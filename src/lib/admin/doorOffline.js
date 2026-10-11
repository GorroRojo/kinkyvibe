/**
 * Modo puerta sin conexión (navegador). Al entrar, el celu baja la lista de entradas del evento
 * (`GET …/ingreso/lista`, ver `offlineList` en $lib/server/tickets/door.js) y la guarda en
 * localStorage. Si se corta la conexión:
 * - valida los QR y códigos contra esa lista (el QR trae el token: se compara su SHA-256);
 * - marca el ingreso en la lista local y lo encola con la hora;
 * - cuando vuelve la conexión, manda la cola (`?/sync`) y aplica lo que responde el servidor
 *   (hecho, o conflicto: otra persona u otro celu la había marcado antes).
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
 *   message?: string, stamp: number, typed?: boolean
 * }} DoorScan `typed`: el código se escribió a mano («Escribir código»), no se escaneó
 */
/**
 * Un ingreso marcado sin conexión, esperando para sincronizar.
 * @typedef {{ id: string, ticketId: string, holder: string, token?: string, code?: string, at: number }} QueueItem
 */
/** @typedef {{ list: OfflineTicket[], queue: QueueItem[], savedAt: number | null }} DoorState */
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
 * Lista nueva del servidor + ingresos que siguen en la cola (todavía no llegaron al servidor).
 * @param {OfflineTicket[]} list
 * @param {QueueItem[]} queue
 * @returns {OfflineTicket[]}
 */
export function mergeServerList(list, queue) {
	const pending = new Map(queue.map((q) => [q.ticketId, q]));
	return list.map((t) => {
		const q = pending.get(t.ticketId);
		return q && !t.at ? { ...t, at: q.at } : t;
	});
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

/** @param {string} slug */
const key = (slug) => `kv-door:${slug}`;

/**
 * @param {Storage | undefined | null} storage
 * @param {string} slug
 * @returns {DoorState}
 */
export function loadDoorState(storage, slug) {
	try {
		const raw = storage?.getItem(key(slug));
		const parsed = raw ? JSON.parse(raw) : null;
		if (parsed && Array.isArray(parsed.list) && Array.isArray(parsed.queue)) {
			return { list: parsed.list, queue: parsed.queue, savedAt: Number(parsed.savedAt) || null };
		}
	} catch {
		// sin almacenamiento o JSON roto: empezamos de cero
	}
	return { list: [], queue: [], savedAt: null };
}

/**
 * @param {Storage | undefined | null} storage
 * @param {string} slug
 * @param {DoorState} state
 * @returns {boolean} si se pudo guardar
 */
export function saveDoorState(storage, slug, state) {
	try {
		if (!storage) return false;
		storage.setItem(key(slug), JSON.stringify(state));
		return true;
	} catch {
		return false;
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
