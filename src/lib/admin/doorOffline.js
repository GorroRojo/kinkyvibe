/**
 * Modo puerta sin conexión (navegador). Al entrar, el celu baja la lista de entradas del evento
 * (`GET …/ingreso/lista`, ver `offlineList` en $lib/server/tickets/door.js) y la guarda en
 * localStorage. Si se corta la conexión:
 * - valida los QR y códigos contra esa lista (el QR trae el token: se compara su SHA-256);
 * - marca el ingreso en la lista local y lo encola con la hora;
 * - cuando vuelve la conexión, manda la cola (`?/sync`) y aplica lo que responde el servidor
 *   (hecho, o conflicto: otra persona u otro celu la había marcado antes);
 * - «Vender en puerta» sigue andando (decisión 0035): la venta queda en el celu con un id propio
 *   (`queueOfflineSale`), sus entradas cuentan como adentro en este celu y, cuando vuelve la
 *   conexión, se manda en orden (`?/syncSales`); el servidor no la duplica si se reintenta y, si
 *   pasó un límite (cupo, agotadas…), la guarda igual y avisa (`applySaleSyncResults`).
 *
 * Todo lo que toca localStorage va en try/catch: en modo privado o con el almacenamiento lleno,
 * el modo puerta sigue andando (solo que sin copia para usar sin conexión).
 */
import { normalizeTicketCode } from '$lib/utils/ticketCode.js';

/**
 * Una entrada de la lista sin conexión (misma forma que devuelve el servidor).
 * @typedef {{
 *   ticketId: string, orderId: string, orderRef: string, holder: string, pronouns: string,
 *   type: string, typeId: string, buyer: string, email: string, dniTail: string, code: string,
 *   at: number | null, by: string | null, firstTime: boolean | null, hash: string, valid: boolean
 * }} OfflineTicket
 */
/**
 * Lo que se muestra de una entrada al escanearla (`ticketCard` en $lib/server/tickets/door.js).
 * @typedef {{
 *   ticketId: string, orderId: string, orderRef: string, holder: string, pronouns: string,
 *   type: string, buyer: string, email: string, dniTail: string, code: string,
 *   at: number | null, by: string | null, firstTime: boolean | null
 * }} DoorCard
 */
/**
 * Un resultado del modo puerta (escaneo, venta o error).
 * @typedef {{
 *   result: 'ok' | 'already' | 'void' | 'wrong-event' | 'invalid' | 'error' | 'sold',
 *   card: DoorCard | null, cards?: DoorCard[], otherEvent?: string | null, offline?: boolean,
 *   message?: string, stamp: number, typed?: boolean, notes?: string[]
 * }} DoorScan `typed`: el código se escribió a mano («Escribir código»), no se escaneó; `notes`:
 *   en una venta, el precio cambiado y la nota
 */
/**
 * Un ingreso marcado sin conexión, esperando para sincronizar.
 * @typedef {{ id: string, ticketId: string, holder: string, token?: string, code?: string, at: number }} QueueItem
 */
/**
 * Una venta hecha sin conexión, esperando para sincronizar. `fields`: los campos del formulario
 * de «Vender en puerta» (sin el DNI: sin conexión no se guarda en el celu); `tickets`: sus
 * entradas en la lista local (adentro en este celu, «pendiente de sincronizar»).
 * @typedef {{
 *   id: string, at: number, fields: Record<string, string>, buyer: string, quantity: number,
 *   type: string, method: 'efectivo' | 'transferencia', total: number | null,
 *   tickets: OfflineTicket[]
 * }} QueuedSale
 */
/**
 * Una venta sin conexión que el servidor no pudo registrar (datos que ya no sirven): queda a la
 * vista hasta que alguien la descarta, nunca se borra sola.
 * @typedef {{ id: string, at: number, buyer: string, quantity: number, type: string,
 *   method: string, total: number | null, message: string }} FailedSale
 */
/**
 * @typedef {{
 *   list: OfflineTicket[], queue: QueueItem[], savedAt: number | null,
 *   sales: QueuedSale[], failed: FailedSale[]
 * }} DoorState
 */
/**
 * @typedef {{
 *   id: string,
 *   result: 'ok' | 'duplicate' | 'rejected',
 *   orderId?: string, ref?: string, buyer?: string, quantity?: number, type?: string,
 *   total?: number, method?: string, message?: string, review?: string[]
 * }} SaleSyncResult
 */
/**
 * @typedef {{
 *   id: string,
 *   result: 'ok' | 'duplicate' | 'conflict' | 'void' | 'wrong-event' | 'invalid',
 *   holder?: string, at?: number | null, by?: string | null
 * }} SyncResult
 */

const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

/**
 * Qué se escaneó o tipeó: el link del QR o el token solo, o un código corto.
 * @param {unknown} raw
 * @returns {{ kind: 'token', token: string } | { kind: 'code', code: string } | null}
 */
export function parseScan(raw) {
	const s = String(raw ?? '')
		.trim()
		.slice(0, 500);
	const m = s.match(/\/entradas\/t\/([A-Za-z0-9_-]{43})(?:[/?#]|$)/);
	if (m) return { kind: 'token', token: m[1] };
	if (TOKEN_RE.test(s)) return { kind: 'token', token: s };
	const code = normalizeTicketCode(s);
	return code ? { kind: 'code', code } : null;
}

/**
 * SHA-256 en hex (Web Crypto: navegador y Node).
 * @param {string} text
 */
export async function sha256Hex(text) {
	const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
	return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * @param {OfflineTicket[]} list
 * @param {ReturnType<typeof parseScan>} parsed
 * @returns {Promise<OfflineTicket | null>}
 */
export async function findTicket(list, parsed) {
	if (!parsed) return null;
	if (parsed.kind === 'code') return list.find((t) => t.code === parsed.code) ?? null;
	const hash = await sha256Hex(parsed.token);
	return list.find((t) => t.hash === hash) ?? null;
}

/**
 * Marca un ingreso sin conexión. No cambia `state`: devuelve el estado nuevo.
 *
 * @param {DoorState} state
 * @param {ReturnType<typeof parseScan>} parsed
 * @param {OfflineTicket | null} ticket lo que devolvió `findTicket`
 * @param {{ now: number, by: string, id: string }} opts `id`: identificador del ingreso en la cola
 * @returns {{ result: 'ok' | 'already' | 'void' | 'invalid', ticket: OfflineTicket | null, state: DoorState }}
 */
export function localCheckIn(state, parsed, ticket, { now, by, id }) {
	if (!parsed || !ticket) return { result: 'invalid', ticket: null, state };
	if (!ticket.valid) return { result: 'void', ticket, state };
	if (ticket.at) return { result: 'already', ticket, state };
	const marked = { ...ticket, at: now, by };
	/** @type {QueueItem} */
	const item = { id, ticketId: ticket.ticketId, holder: ticket.holder, at: now };
	if (parsed.kind === 'token') item.token = parsed.token;
	else item.code = parsed.code;
	return {
		result: 'ok',
		ticket: marked,
		state: {
			...state,
			list: state.list.map((t) => (t.ticketId === ticket.ticketId ? marked : t)),
			queue: [...state.queue, item]
		}
	};
}

/**
 * Deshace un ingreso marcado sin conexión que todavía no se sincronizó.
 * @param {DoorState} state
 * @param {string} ticketId
 * @returns {DoorState | null} `null` si ese ingreso no está en la cola (ya se sincronizó)
 */
export function undoLocal(state, ticketId) {
	if (!state.queue.some((q) => q.ticketId === ticketId)) return null;
	return {
		...state,
		queue: state.queue.filter((q) => q.ticketId !== ticketId),
		list: state.list.map((t) => (t.ticketId === ticketId ? { ...t, at: null, by: null } : t))
	};
}

/**
 * Lista nueva del servidor + ingresos que siguen en la cola y entradas de las ventas sin conexión
 * (todavía no llegaron al servidor).
 * @param {OfflineTicket[]} list
 * @param {QueueItem[]} queue
 * @param {QueuedSale[]} [sales]
 * @returns {OfflineTicket[]}
 */
export function mergeServerList(list, queue, sales = []) {
	const pending = new Map(queue.map((q) => [q.ticketId, q]));
	return [
		...list.map((t) => {
			const q = pending.get(t.ticketId);
			return q && !t.at ? { ...t, at: q.at } : t;
		}),
		// Las entradas de las ventas sin conexión que todavía no llegaron al servidor.
		...sales.flatMap((s) => s.tickets)
	];
}

/**
 * Aplica la respuesta de `?/sync`: saca de la cola lo que el servidor procesó y devuelve los
 * conflictos y problemas para mostrar.
 *
 * @param {DoorState} state
 * @param {SyncResult[]} results
 * @returns {{ state: DoorState, done: number, conflicts: { holder: string, result: string, at: number | null, by: string | null }[] }}
 */
export function applySyncResults(state, results) {
	const byId = new Map(results.map((r) => [r.id, r]));
	/** @type {{ holder: string, result: string, at: number | null, by: string | null }[]} */
	const conflicts = [];
	/** @type {Map<string, Partial<OfflineTicket>>} */
	const patch = new Map();
	let done = 0;
	const queue = state.queue.filter((q) => {
		const r = byId.get(q.id);
		if (!r) return true;
		done++;
		if (r.result === 'conflict') {
			conflicts.push({
				holder: r.holder ?? q.holder,
				result: r.result,
				at: r.at ?? null,
				by: r.by ?? null
			});
			patch.set(q.ticketId, { at: r.at ?? null, by: r.by ?? null });
		} else if (r.result !== 'ok' && r.result !== 'duplicate') {
			conflicts.push({ holder: r.holder ?? q.holder, result: r.result, at: null, by: null });
			patch.set(q.ticketId, { at: null, by: null, valid: r.result !== 'void' });
		}
		return false;
	});
	const list = state.list.map((t) =>
		patch.has(t.ticketId) ? { ...t, ...patch.get(t.ticketId) } : t
	);
	return { state: { ...state, list, queue }, done, conflicts };
}

/**
 * "18 de 31 adentro" con la lista local (entradas válidas).
 * @param {OfflineTicket[]} list
 */
export function localCounts(list) {
	/** @type {Record<string, { total: number, inside: number }>} */
	const byType = {};
	let total = 0;
	let inside = 0;
	for (const t of list) {
		if (!t.valid) continue;
		const c = (byType[t.typeId] ??= { total: 0, inside: 0 });
		c.total++;
		total++;
		if (t.at) {
			c.inside++;
			inside++;
		}
	}
	return { total, inside, byType };
}

/** @param {unknown} v */
function fold(v) {
	return String(v ?? '')
		.normalize('NFD')
		.replace(/\p{Diacritic}/gu, '')
		.toLowerCase()
		.replace(/\s+/g, ' ')
		.trim();
}

/**
 * Búsqueda sin conexión en la lista local (nombre, pronombres, quien compró, email, código).
 * @param {OfflineTicket[]} list
 * @param {string} query
 * @param {number} [limit]
 */
export function localSearch(list, query, limit = 8) {
	const q = fold(query);
	if (q.length < 2) return [];
	const code = normalizeTicketCode(query);
	return list
		.filter(
			(t) =>
				t.valid &&
				((code && t.code === code) ||
					[t.holder, t.pronouns, t.buyer, t.email, t.code].some((f) => fold(f).includes(q)))
		)
		.slice(0, limit);
}

/**
 * Dónde se guarda la puerta en el celu: la del panel en `kv-door:<slug>` y la puerta con link
 * aparte, en `kv-puerta-link:<slug>` (así lo que se borra de un link nunca toca lo del panel).
 */
export const DOOR_PREFIX = 'kv-door';
export const LINK_DOOR_PREFIX = 'kv-puerta-link';

/** @typedef {{ link?: boolean }} DoorStorageOpts `link`: la puerta con link */

/**
 * @param {string} slug
 * @param {DoorStorageOpts} [opts]
 */
const key = (slug, { link = false } = {}) => `${link ? LINK_DOOR_PREFIX : DOOR_PREFIX}:${slug}`;

/**
 * Dónde se guardan los «Últimos escaneos».
 * @param {string} slug
 * @param {DoorStorageOpts} [opts]
 */
export function doorRecentKey(slug, { link = false } = {}) {
	return `${link ? LINK_DOOR_PREFIX : DOOR_PREFIX}-recent:${slug}`;
}

/** @returns {DoorState} */
export function emptyDoorState() {
	return { list: [], queue: [], savedAt: null, sales: [], failed: [] };
}

/**
 * @param {Storage | undefined | null} storage
 * @param {string} slug
 * @param {DoorStorageOpts} [opts]
 * @returns {DoorState}
 */
export function loadDoorState(storage, slug, opts) {
	try {
		const raw = storage?.getItem(key(slug, opts));
		const parsed = raw ? JSON.parse(raw) : null;
		if (parsed && Array.isArray(parsed.list) && Array.isArray(parsed.queue)) {
			return {
				list: parsed.list,
				queue: parsed.queue,
				savedAt: Number(parsed.savedAt) || null,
				// Lo guardado antes de las ventas sin conexión no tiene estas listas.
				sales: Array.isArray(parsed.sales) ? parsed.sales : [],
				failed: Array.isArray(parsed.failed) ? parsed.failed : []
			};
		}
	} catch {
		// sin almacenamiento o JSON roto: empezamos de cero
	}
	return emptyDoorState();
}

/**
 * @param {Storage | undefined | null} storage
 * @param {string} slug
 * @param {DoorState} state
 * @param {DoorStorageOpts} [opts]
 * @returns {boolean} si se pudo guardar
 */
export function saveDoorState(storage, slug, state, opts) {
	try {
		if (!storage) return false;
		storage.setItem(key(slug, opts), JSON.stringify(state));
		return true;
	} catch {
		return false;
	}
}

/**
 * Puerta con link que ya no anda (venció, la revocaron) o que se cierra en el celu: borra la lista
 * guardada (nombres, mails), los ingresos marcados sin conexión y los «Últimos escaneos», pero
 * **nunca** las ventas hechas sin conexión que no se mandaron ni las que el servidor no pudo
 * registrar: una venta que pasó no se pierde (decisión 0035), queda para mostrársela a une admin.
 * Nunca toca lo de la puerta del panel (`kv-door:`).
 *
 * @param {Storage | undefined | null} storage
 * @param {string} slug
 * @returns {DoorState} lo que quedó (solo `sales` y `failed`)
 */
export function forgetLinkDoor(storage, slug) {
	const prev = loadDoorState(storage, slug, { link: true });
	const kept = { ...emptyDoorState(), sales: prev.sales, failed: prev.failed };
	try {
		storage?.removeItem(doorRecentKey(slug, { link: true }));
		if (kept.sales.length || kept.failed.length) saveDoorState(storage, slug, kept, { link: true });
		else storage?.removeItem(key(slug, { link: true }));
	} catch {
		// sin almacenamiento: no había nada guardado
	}
	return kept;
}

/**
 * `forgetLinkDoor` para todas las puertas con link guardadas en el celu (en /puerta, sin un link
 * vivo). Devuelve las que conservan ventas sin mandar o sin registrar.
 *
 * @param {Storage | undefined | null} storage
 * @returns {{ slug: string, sales: QueuedSale[], failed: FailedSale[] }[]}
 */
export function forgetAllLinkDoors(storage) {
	/** @type {Set<string>} */
	const slugs = new Set();
	try {
		if (!storage) return [];
		for (let i = 0; i < storage.length; i++) {
			const k = storage.key(i) ?? '';
			const m = k.match(/^kv-puerta-link(?:-recent)?:(.+)$/);
			if (m) slugs.add(m[1]);
		}
	} catch {
		return [];
	}
	/** @type {{ slug: string, sales: QueuedSale[], failed: FailedSale[] }[]} */
	const left = [];
	for (const slug of slugs) {
		const kept = forgetLinkDoor(storage, slug);
		if (kept.sales.length || kept.failed.length)
			left.push({ slug, sales: kept.sales, failed: kept.failed });
	}
	return left;
}

/**
 * Borra del celu lo que quedó de una puerta con link (las ventas sin mandar), cuando une admin ya
 * las cargó.
 * @param {Storage | undefined | null} storage
 * @param {string} slug
 */
export function dropLinkDoor(storage, slug) {
	try {
		storage?.removeItem(key(slug, { link: true }));
		storage?.removeItem(doorRecentKey(slug, { link: true }));
	} catch {
		// sin almacenamiento
	}
}

/**
 * Título de un resultado de la puerta que no es una entrada válida. Un código escrito a mano que
 * no existe es «Código no encontrado» (no «QR inválido»: no hubo QR).
 * @param {DoorScan['result']} result
 * @param {boolean} [typed]
 */
export function invalidTitle(result, typed = false) {
	if (result !== 'invalid') return '';
	return typed ? 'Código no encontrado' : 'QR inválido';
}

/**
 * @typedef {{ result: string, title: string, sub: string, at: number, ticketId?: string }} RecentScan
 */

/**
 * «Últimos escaneos» después de «Deshacer»: el último ingreso de esa entrada deja de figurar como
 * adentro (sin el tilde verde) y dice que se deshizo.
 * @param {RecentScan[]} recent
 * @param {string} ticketId
 * @param {string} holder
 * @returns {RecentScan[]}
 */
export function markRecentUndone(recent, ticketId, holder) {
	let done = false;
	return recent.map((r) => {
		if (done || r.ticketId !== ticketId || (r.result !== 'ok' && r.result !== 'sold')) return r;
		done = true;
		return { ...r, result: 'undone', title: `${holder} · ingreso deshecho`, sub: '' };
	});
}

/**
 * El cartel de conexión del modo puerta:
 * - con conexión y la lista ya guardada en el celu: `ready` («listo para sin conexión»), para que
 *   quien está en la puerta sepa que, si se corta, puede seguir validando;
 * - con conexión y sin lista todavía (bajándola, o sin almacenamiento): nada;
 * - sin conexión: `offline`, con lo que sigue andando y lo que necesita conexión.
 * - sin conexión, «Vender en puerta» sigue andando (decisión 0035): las ventas se guardan en el
 *   celu y se mandan solas cuando vuelve.
 * @param {{ online: boolean, saved: boolean, savedAt: string, canSell?: boolean }} s `saved`: hay
 *   una lista bajada y guardada en el celu (aunque el evento no tenga entradas todavía); `savedAt`:
 *   su hora, ya formateada («21:40»); `canSell`: la pantalla ofrece «Vender en puerta» (no en una
 *   parte de un taller ni en un evento solo anticipadas)
 * Sin conexión, además, `keep`: que no cierren ni recarguen la pestaña (sin service worker, la
 * página no vuelve a cargar sin conexión; UX V12).
 * @returns {null | { kind: 'ready' | 'offline', title: string, detail: string, keep?: string }}
 */
export function doorConnectionNote({ online, saved, savedAt, canSell = true }) {
	if (online) {
		if (!saved) return null;
		return {
			kind: 'ready',
			title: 'Listo para sin conexión.',
			detail: `La lista quedó guardada en este celu${savedAt ? ` (${savedAt})` : ''}: si se corta internet, podés seguir validando.`
		};
	}
	const keep = 'No cierres ni recargues esta pestaña: sin conexión no vuelve a cargar.';
	const selling = canSell
		? ' Podés vender en la puerta: las ventas quedan en este celu y se mandan solas cuando vuelve.'
		: '';
	if (!saved)
		return {
			kind: 'offline',
			title: 'Sin conexión.',
			keep,
			detail: `No hay lista guardada en este celu, así que no se puede validar. Cuando vuelva la conexión se baja sola.${selling}`
		};
	const list = savedAt ? ` (${savedAt})` : '';
	return {
		kind: 'offline',
		title: 'Sin conexión.',
		keep,
		detail: canSell
			? `Podés seguir validando QR y códigos, buscar personas con la lista guardada${list} y vender en la puerta; los ingresos y las ventas se mandan solos cuando vuelve. Ver el DNI completo necesita conexión.`
			: `Podés seguir validando QR y códigos y buscar personas con la lista guardada${list}; los ingresos se mandan solos cuando vuelve. Ver el DNI completo necesita conexión.`
	};
}

/**
 * «2 ventas y 1 ingreso por sincronizar.» ('' si no hay nada pendiente).
 * @param {{ checkins: number, sales: number }} n
 */
export function pendingNote({ checkins, sales }) {
	const parts = [];
	if (sales) parts.push(`${sales} ${sales === 1 ? 'venta' : 'ventas'}`);
	if (checkins) parts.push(`${checkins} ${checkins === 1 ? 'ingreso' : 'ingresos'}`);
	return parts.length ? `${parts.join(' y ')} por sincronizar.` : '';
}

/**
 * Lo que se sabe en el celu de los límites que pasaría una venta sin conexión (con los datos de
 * cuando se abrió la página, menos lo que ya se vendió sin conexión). Es solo un aviso antes de
 * guardarla: al sincronizar, el servidor vuelve a controlar con los números de ese momento, guarda
 * la venta igual y, si pasó un límite, la deja en «Para revisar».
 *
 * @param {{
 *   type: { id: string, name: string, capacity: number | null, taken: number },
 *   quantity: number, doorSales: boolean, maxPerSale: number, sales: QueuedSale[]
 * }} input
 * @returns {{ message: string }[]}
 */
export function offlineSaleLimits({ type, quantity, doorSales, maxPerSale, sales }) {
	/** @type {{ message: string }[]} */
	const out = [];
	if (!doorSales)
		out.push({ message: 'Este evento es solo anticipadas: no tiene entradas en la puerta.' });
	if (quantity > maxPerSale)
		out.push({
			message: `Son ${quantity} entradas y el máximo por venta es ${maxPerSale} (${quantity - maxPerSale} de más).`
		});
	if (type.capacity !== null && type.capacity !== undefined) {
		const queued = sales
			.filter((s) => s.fields.type === type.id)
			.reduce((n, s) => n + s.quantity, 0);
		const after = type.taken + queued + quantity;
		if (after > type.capacity)
			out.push({
				message: `Se pasaría del cupo de «${type.name}»: quedarían ${after} / ${type.capacity} (según la lista de cuando había conexión).`
			});
	}
	return out;
}

/**
 * Guarda una venta hecha sin conexión: la encola y suma sus entradas a la lista local, ya adentro
 * («pendiente de sincronizar»). No cambia `state`: devuelve el estado nuevo.
 *
 * @param {DoorState} state
 * @param {{
 *   id: string, now: number, by: string, fields: Record<string, string>,
 *   type: { id: string, name: string }, quantity: number, total: number | null,
 *   holders: { name: string, pronouns: string }[]
 * }} sale `fields`: los del formulario (el DNI no se guarda); `total`: lo que se cobró, que
 *   viaja como `charged_total`
 * @returns {{ state: DoorState, sale: QueuedSale }}
 */
export function queueOfflineSale(state, { id, now, by, fields, type, quantity, total, holders }) {
	const kept = { ...fields };
	delete kept.dni;
	// Lo que se cobró de verdad (el total que vio quien vendió): si al sincronizar el servidor la
	// registra con otro total (cambió el precio o el % del Fondo), queda en «Para revisar».
	if (Number.isSafeInteger(total) && /** @type {number} */ (total) >= 0) {
		kept.charged_total = String(total);
	} else delete kept.charged_total;
	const buyer = String(kept.name ?? '').trim();
	const method = kept.method === 'transferencia' ? 'transferencia' : 'efectivo';
	/** @type {OfflineTicket[]} */
	const tickets = holders.map((h, i) => ({
		ticketId: `local:${id}:${i}`,
		orderId: `local:${id}`,
		orderRef: 'Pendiente de sincronizar',
		holder: h.name || buyer,
		pronouns: h.pronouns ?? '',
		type: type.name,
		typeId: type.id,
		buyer,
		email: String(kept.email ?? ''),
		dniTail: '',
		code: '',
		at: now,
		by,
		firstTime: null,
		hash: '',
		valid: true
	}));
	/** @type {QueuedSale} */
	const sale = {
		id,
		at: now,
		fields: kept,
		buyer,
		quantity,
		type: type.name,
		method,
		total,
		tickets
	};
	return {
		sale,
		state: { ...state, sales: [...state.sales, sale], list: [...state.list, ...tickets] }
	};
}

/** @param {string} ticketId */
export function isPendingSaleTicket(ticketId) {
	return String(ticketId ?? '').startsWith('local:');
}

/**
 * El id (del celu) de la venta sin conexión de una entrada «pendiente de sincronizar»
 * (`local:<venta>:<n>`); '' si la entrada ya es del servidor.
 * @param {string} ticketId
 */
export function pendingSaleId(ticketId) {
	return isPendingSaleTicket(ticketId) ? (String(ticketId).split(':')[1] ?? '') : '';
}

/**
 * Descarta una venta sin conexión que todavía no se mandó al servidor (UX V12: una venta errada
 * se deshace en la Puerta solo mientras está en la cola del celu). Saca la venta de la cola y sus
 * entradas locales (y algún ingreso encolado de esas entradas). Una venta que ya se sincronizó no
 * está en la cola: no se descarta acá (es una orden: se reembolsa desde el panel, con su
 * confirmación). Sin `confirmed` no hace nada: la pantalla pregunta antes en la página.
 * No cambia `state`: devuelve el estado nuevo.
 *
 * @param {DoorState} state
 * @param {string} saleId
 * @param {{ confirmed?: boolean }} [o]
 * @returns {{ ok: true, state: DoorState, sale: QueuedSale }
 *   | { ok: false, reason: 'unconfirmed' | 'not-queued' }}
 */
export function discardQueuedSale(state, saleId, { confirmed = false } = {}) {
	const sale = saleId ? state.sales.find((s) => s.id === saleId) : undefined;
	if (!sale) return { ok: false, reason: 'not-queued' };
	if (!confirmed) return { ok: false, reason: 'unconfirmed' };
	const orderId = `local:${sale.id}`;
	const ticketPrefix = `${orderId}:`;
	return {
		ok: true,
		sale,
		state: {
			...state,
			sales: state.sales.filter((s) => s.id !== sale.id),
			list: state.list.filter((t) => t.orderId !== orderId),
			queue: state.queue.filter((q) => !String(q.ticketId ?? '').startsWith(ticketPrefix))
		}
	};
}

/**
 * «Últimos escaneos» después de descartar una venta sin conexión: deja de figurar como vendida.
 * @param {RecentScan[]} recent
 * @param {string} saleId
 * @param {string} buyer
 * @returns {RecentScan[]}
 */
export function markRecentDiscarded(recent, saleId, buyer) {
	return recent.map((r) =>
		r.result === 'sold' && r.ticketId && pendingSaleId(r.ticketId) === saleId
			? { ...r, result: 'undone', title: `${buyer} · venta descartada`, sub: 'no se mandó' }
			: r
	);
}

/**
 * Lo que se le manda al servidor (`?/syncSales`), en el orden en que se vendió.
 * @param {QueuedSale[]} sales
 */
export function salesPayload(sales) {
	return [...sales].sort((a, b) => a.at - b.at).map(({ id, at, fields }) => ({ id, at, fields }));
}

/**
 * Aplica la respuesta de `?/syncSales`: saca de la cola lo que el servidor procesó (registrada,
 * o ya registrada antes: un reintento), saca sus entradas locales (la lista nueva del servidor
 * trae las de verdad) y devuelve los avisos:
 * - `warnings`: ventas registradas que pasaron un límite (quedan en «Para revisar»);
 * - las que el servidor no pudo registrar pasan a `failed` (a la vista, no se borran solas).
 *
 * @param {DoorState} state
 * @param {SaleSyncResult[]} results
 * @returns {{ state: DoorState, done: number, warnings: { buyer: string, ref: string, review: string[] }[], rejected: FailedSale[] }}
 */
export function applySaleSyncResults(state, results) {
	const byId = new Map(results.map((r) => [r.id, r]));
	/** @type {{ buyer: string, ref: string, review: string[] }[]} */
	const warnings = [];
	/** @type {FailedSale[]} */
	const rejected = [];
	/** @type {Set<string>} */
	const gone = new Set();
	let done = 0;
	const sales = state.sales.filter((s) => {
		const r = byId.get(s.id);
		if (!r) return true;
		gone.add(`local:${s.id}`);
		if (r.result === 'rejected') {
			rejected.push({
				id: s.id,
				at: s.at,
				buyer: s.buyer,
				quantity: s.quantity,
				type: s.type,
				method: s.method,
				total: s.total,
				message: r.message || 'No se pudo registrar.'
			});
			return false;
		}
		done++;
		if (r.review?.length)
			warnings.push({ buyer: r.buyer || s.buyer, ref: r.ref ?? '', review: r.review });
		return false;
	});
	return {
		state: {
			...state,
			sales,
			failed: [...state.failed, ...rejected],
			list: state.list.filter((t) => !gone.has(t.orderId))
		},
		done,
		warnings,
		rejected
	};
}

/**
 * «Últimos escaneos» después de sincronizar ventas: las que decían «pendiente de sincronizar»
 * pasan a «sincronizada».
 * @param {RecentScan[]} recent
 * @param {Iterable<string>} saleIds ids (del celu) de las ventas que el servidor ya registró
 * @returns {RecentScan[]}
 */
export function markRecentSynced(recent, saleIds) {
	const ids = new Set(saleIds);
	return recent.map((r) => {
		const id = r.ticketId ? pendingSaleId(r.ticketId) : '';
		return id && ids.has(id) ? { ...r, sub: 'sincronizada' } : r;
	});
}
