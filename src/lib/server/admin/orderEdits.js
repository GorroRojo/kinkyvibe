/**
 * «Editar» una compra en Ventas › Órdenes (solo admins): corregir los datos de quien compró
 * (nombre, pronombres, mail), de cada entrada (nombre y pronombres) y las respuestas a las
 * preguntas de inscripción, con historial y «Deshacer» (docs/tickets.md, «Editar una compra»).
 *
 * - Se cambia en el lugar de siempre (`orders`, `tickets` o, si todavía no se emitieron, el JSON
 *   `orders.holders`, y `order_answers`), así todo lo que ya lee esos datos (las dos vistas de
 *   Órdenes, el CSV, la puerta, la ficha de la persona) ve lo corregido sin tocar nada más.
 * - Cada guardado deja una fila en `order_edits` (migración 0085) con lo que había y lo que quedó,
 *   en la MISMA tanda que el cambio. «Deshacer» vuelve a lo que había y deja otra fila (`undoes`):
 *   nunca se borra ni se cambia una fila vieja. Un cambio se deshace una sola vez (índice único).
 * - Solo se valida lo que cambió, con las mismas reglas que la compra (nombres y pronombres de
 *   $lib/utils/ticketBuyer.js, el mail con `normalizeBuyerEmail`, cada respuesta con
 *   `validateAnswer` según su tipo, todos los de las preguntas de inscripción): un dato viejo que
 *   hoy no pasaría (una compra en la puerta sin pronombres, una pregunta obligatoria que se sumó
 *   después) no frena corregir otro.
 * - No se manda ningún mail. Cambiar el mail no toca las entradas ni sus links (van por su token);
 *   los avisos que salgan después van a la dirección nueva.
 * - El registro de actividad (`order.edit`, `order.edit_undo`) dice qué se cambió, sin los
 *   valores: son datos de quien compró.
 */
import { logDBError } from '$lib/server/db';
import { isSuppressed } from '$lib/server/email/suppressions.js';
import { getOrderTickets, orderHolders } from '$lib/server/tickets/orders.js';
import { orderAnswers } from '$lib/server/tickets/signupFields.js';
import {
	answerFormValue,
	answerKindTag,
	answerSlots,
	answerTicketLabel,
	fieldAppliesTo,
	fieldInputName,
	validateAnswer
} from '$lib/utils/signupFields.js';
import {
	checkName,
	checkPronouns,
	cleanText,
	normalizeBuyerEmail
} from '$lib/utils/ticketBuyer.js';

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */
/** @typedef {import('@cloudflare/workers-types').D1PreparedStatement} D1PreparedStatement */
/** @typedef {import('$lib/server/tickets/orders.js').Order} Order */
/** @typedef {import('$lib/utils/signupFields.js').SignupField} SignupField */
/** @typedef {import('$lib/utils/signupFields.js').Answer} Answer */

/**
 * Un dato cambiado. `key`: `buyer.name`, `buyer.pronouns`, `buyer.email`, `holder.<n>.name`,
 * `holder.<n>.pronouns` (n desde 0), `answer.<pregunta>` o `answer.<pregunta>.<entrada>` (desde
 * 1, como en `order_answers`). `label`: cómo se muestra en el historial. `question`: en una
 * respuesta, el texto de la pregunta (lo que se guarda con la respuesta). `kind`: en una respuesta
 * de los tipos nuevos, su tipo (se guarda con la respuesta, como en la compra, y el historial
 * muestra un número o una fecha como se leen). `''` es vacío.
 * @typedef {{ key: string, label: string, before: string, after: string, question?: string,
 *   kind?: string }} Change
 */

/**
 * Un cambio guardado, para el historial de la tarjeta. `undone`: ya se deshizo.
 * @typedef {{ id: number, at: number, by: string, changes: Change[], undoes: number | null,
 *   undone: boolean }} OrderEdit
 */

/**
 * Lo que tiene hoy una compra: quien compró, cada entrada (de `tickets` si ya se emitieron, con
 * su id; si no, del JSON de la orden) y las respuestas.
 * @typedef {{ buyer: { name: string, pronouns: string, email: string },
 *   holders: { name: string, pronouns: string }[], ticketIds: string[], answers: Answer[] }} EditState
 */

/**
 * Lo que mandó el formulario de «Editar». `null`: ese campo no vino (no se cambia).
 * @typedef {{ name: string | null, pronouns: string | null, email: string | null,
 *   holders: { name: string | null, pronouns: string | null }[],
 *   answers: Record<string, string | string[]> }} EditInput
 *   `answers`: en «Varias opciones», la lista de las marcadas (como `readAnswers` de la compra).
 */

/** Lo que dice cada dato de quien compró en el historial. */
const BUYER_LABELS = Object.freeze({ name: 'Nombre', pronouns: 'Pronombres', email: 'Mail' });
const HOLDER_LABELS = Object.freeze({ name: 'nombre', pronouns: 'pronombres' });

/**
 * @param {D1Database} db
 * @param {Order} order
 * @returns {Promise<EditState>}
 */
export async function readEditState(db, order) {
	const [tickets, answers] = await Promise.all([
		getOrderTickets(db, order.id),
		orderAnswers(db, order.id)
	]);
	return {
		buyer: {
			name: order.buyer_name ?? '',
			pronouns: order.buyer_pronouns ?? '',
			email: order.buyer_email ?? ''
		},
		holders: tickets.length
			? tickets.map((t) => ({ name: t.holder_name ?? '', pronouns: t.holder_pronouns ?? '' }))
			: orderHolders(order),
		ticketIds: tickets.map((t) => t.id),
		answers
	};
}

/**
 * Lee el formulario de «Editar»: los mismos `name` que la compra (`name`, `pronouns`, `email`,
 * `holder_name_<n>`, `holder_pronouns_<n>` y las respuestas con `fieldInputName`).
 *
 * @param {FormData} form
 * @param {number} quantity
 * @param {readonly SignupField[]} fields las preguntas que aplican a la compra
 * @returns {EditInput}
 */
export function readEditInput(form, quantity, fields) {
	/** @param {string} name @param {number} max */
	const str = (name, max) => {
		const v = form.get(name);
		return typeof v === 'string' ? v.slice(0, max) : null;
	};
	/** @type {Record<string, string | string[]>} */
	const answers = {};
	for (const f of fields) {
		for (const slot of answerSlots(f, quantity)) {
			const name = fieldInputName(f.id, slot);
			if (f.kind === 'multi') {
				// Una casilla por opción, todas con el mismo `name` (como `readAnswers` de la compra).
				const all = form.getAll(name).filter((v) => typeof v === 'string');
				if (all.length) answers[name] = all.slice(0, 50).map((v) => String(v).slice(0, 200));
				continue;
			}
			const v = form.get(name);
			if (typeof v === 'string') answers[name] = v.slice(0, 2000);
		}
	}
	return {
		name: str('name', 200),
		pronouns: str('pronouns', 100),
		email: str('email', 300),
		holders: Array.from({ length: quantity }, (_, i) => ({
			name: str(`holder_name_${i}`, 200),
			pronouns: str(`holder_pronouns_${i}`, 100)
		})),
		answers
	};
}

/**
 * @param {string} key
 * @returns {{ id: number, ticket: number | undefined } | null}
 */
function answerKey(key) {
	const m = /^answer\.(\d+)(?:\.(\d+))?$/.exec(key);
	if (!m) return null;
	return { id: Number(m[1]), ticket: m[2] ? Number(m[2]) : undefined };
}

/**
 * La respuesta guardada a una pregunta (y entrada), si hay.
 * @param {readonly Answer[]} answers
 * @param {number} id
 * @param {number | undefined} ticket
 */
function findAnswer(answers, id, ticket) {
	return answers.find((a) => a.id === id && (a.ticket ?? undefined) === ticket);
}

/**
 * Lo que vale hoy un dato (`''` si está vacío o no existe).
 * @param {EditState} state
 * @param {string} key
 */
export function stateValue(state, key) {
	const [kind, a, b] = key.split('.');
	/** @type {(obj: Record<string, string> | undefined, k: string) => string} */
	const pick = (obj, k) => obj?.[k] ?? '';
	if (kind === 'buyer') return pick(state.buyer, a);
	if (kind === 'holder') return pick(state.holders[Number(a)], b);
	const ak = answerKey(key);
	return ak ? (findAnswer(state.answers, ak.id, ak.ticket)?.value ?? '') : '';
}

/**
 * ¿Lo que mandó el formulario es lo que ya tenía el campo (`answerFormValue`)? En «Varias
 * opciones» se comparan las elegidas, sin importar el orden; un campo que no vino es vacío.
 * @param {string | string[] | undefined} sent
 * @param {string | string[]} now
 */
function sameFormValue(sent, now) {
	/** @param {string | string[] | undefined} v */
	const list = (v) => (Array.isArray(v) ? v : v ? [v] : []);
	const a = list(sent);
	const b = list(now);
	return a.length === b.length && a.every((v) => b.includes(v));
}

/** ¿Dos valores de un dato son el mismo? (El mail, sin mayúsculas ni espacios.) */
function sameValue(/** @type {string} */ key, /** @type {string} */ a, /** @type {string} */ b) {
	return key === 'buyer.email' ? a.trim().toLowerCase() === b.trim().toLowerCase() : a === b;
}

/**
 * Qué cambia el formulario y si está bien: compara cada campo con lo que hay y valida solo lo
 * que cambió, con las reglas de la compra. Los errores van por el `name` del campo.
 *
 * @param {EditState} state
 * @param {EditInput} input
 * @param {readonly SignupField[]} fields las preguntas del evento (se usan las que aplican)
 * @param {{ typeId: string, quantity: number }} order
 * @returns {{ changes: Change[], errors: Record<string, string> }}
 */
export function diffEdit(state, input, fields, { typeId, quantity }) {
	/** @type {Change[]} */
	const changes = [];
	/** @type {Record<string, string>} */
	const errors = {};

	// Quien compró.
	if (input.name !== null && cleanText(input.name) !== cleanText(state.buyer.name)) {
		const r = checkName(input.name, 'Poné un nombre (entre 2 y 80 letras).');
		if (r.error) errors.name = r.error;
		else
			changes.push({
				key: 'buyer.name',
				label: BUYER_LABELS.name,
				before: state.buyer.name,
				after: r.value
			});
	}
	if (input.pronouns !== null && cleanText(input.pronouns) !== cleanText(state.buyer.pronouns)) {
		const r = checkPronouns(input.pronouns, 'Poné los pronombres de esta persona.');
		if (r.error) errors.pronouns = r.error;
		else
			changes.push({
				key: 'buyer.pronouns',
				label: BUYER_LABELS.pronouns,
				before: state.buyer.pronouns,
				after: r.value
			});
	}
	if (input.email !== null && !sameValue('buyer.email', input.email, state.buyer.email)) {
		const email = normalizeBuyerEmail(input.email);
		if (!email) errors.email = 'Revisá el mail: no parece un mail.';
		else
			changes.push({
				key: 'buyer.email',
				label: BUYER_LABELS.email,
				before: state.buyer.email,
				after: email
			});
	}

	// Cada entrada.
	for (let i = 0; i < Math.min(quantity, state.holders.length); i++) {
		const now = state.holders[i];
		const raw = input.holders[i] ?? { name: null, pronouns: null };
		const ticket = answerTicketLabel(i + 1);
		if (raw.name !== null && cleanText(raw.name) !== cleanText(now.name)) {
			const r = checkName(raw.name, 'Poné un nombre (entre 2 y 80 letras).');
			if (r.error) errors[`holder_name_${i}`] = r.error;
			else
				changes.push({
					key: `holder.${i}.name`,
					label: `${ticket}: ${HOLDER_LABELS.name}`,
					before: now.name,
					after: r.value
				});
		}
		if (raw.pronouns !== null && cleanText(raw.pronouns) !== cleanText(now.pronouns)) {
			const r = checkPronouns(raw.pronouns, 'Poné los pronombres de esta persona.');
			if (r.error) errors[`holder_pronouns_${i}`] = r.error;
			else
				changes.push({
					key: `holder.${i}.pronouns`,
					label: `${ticket}: ${HOLDER_LABELS.pronouns}`,
					before: now.pronouns,
					after: r.value
				});
		}
	}

	// Las respuestas: las preguntas que aplican a la compra, una vez o una por entrada.
	for (const f of fields) {
		if (!fieldAppliesTo(f, typeId)) continue;
		for (const slot of answerSlots(f, quantity)) {
			const name = fieldInputName(f.id, slot);
			const ticket = slot === null ? undefined : slot + 1;
			const stored = findAnswer(state.answers, f.id, ticket)?.value;
			const raw = input.answers[name];
			if (sameFormValue(raw, answerFormValue(f, stored))) continue;
			const r = validateAnswer(f, raw);
			if ('error' in r) {
				errors[name] = r.error;
				continue;
			}
			const after = r.value ?? '';
			if (after === (stored ?? '')) continue;
			const shown = f.shortLabel || f.label;
			changes.push({
				key: ticket ? `answer.${f.id}.${ticket}` : `answer.${f.id}`,
				label: ticket ? `${answerTicketLabel(ticket)}: ${shown}` : shown,
				question: findAnswer(state.answers, f.id, ticket)?.label || f.label,
				before: stored ?? '',
				after,
				...answerKindTag(f.kind)
			});
		}
	}
	return { changes, errors };
}

/**
 * Las sentencias que dejan cada dato en `after` (sobre lo que hay, `state`).
 *
 * @param {D1Database} db
 * @param {Order} order
 * @param {EditState} state
 * @param {readonly Change[]} changes
 * @returns {D1PreparedStatement[]}
 */
function applyStatements(db, order, state, changes) {
	/** @type {D1PreparedStatement[]} */
	const out = [];
	const byKey = new Map(changes.map((c) => [c.key, c]));

	// Quien compró: una sola sentencia con las columnas que cambian.
	/** @type {[string, string | null][]} */
	const sets = [];
	const name = byKey.get('buyer.name');
	if (name) sets.push(['buyer_name', name.after]);
	const pronouns = byKey.get('buyer.pronouns');
	if (pronouns) sets.push(['buyer_pronouns', pronouns.after || null]);
	const email = byKey.get('buyer.email');
	if (email) sets.push(['buyer_email', email.after]);
	if (sets.length) {
		out.push(
			db
				.prepare(
					`UPDATE orders SET ${sets.map(([col], i) => `${col} = ?${i + 3}`).join(', ')}
					WHERE id = ?1 AND event_slug = ?2`
				)
				.bind(order.id, order.event_slug, ...sets.map(([, v]) => v))
		);
	}
	if (email) {
		// El código combo que salió de esta compra es de quien compró: sigue a su mail (como en
		// «Corregir el mail…», `updateBuyerEmail`).
		out.push(
			db
				.prepare('UPDATE discount_codes SET buyer_email = ?2 WHERE source_order_id = ?1')
				.bind(order.id, email.after)
		);
	}

	// Cada entrada: en `tickets` si ya se emitieron; si no, en el JSON de la orden.
	const holderChanges = changes.filter((c) => c.key.startsWith('holder.'));
	if (holderChanges.length && state.ticketIds.length) {
		for (const c of holderChanges) {
			const [, n, field] = c.key.split('.');
			const id = state.ticketIds[Number(n)];
			if (!id) continue;
			out.push(
				db
					.prepare(
						`UPDATE tickets SET ${field === 'name' ? 'holder_name' : 'holder_pronouns'} = ?3
						WHERE id = ?1 AND order_id = ?2`
					)
					.bind(id, order.id, field === 'name' ? c.after : c.after || null)
			);
		}
	} else if (holderChanges.length) {
		const holders = state.holders.map((h) => ({ ...h }));
		for (const c of holderChanges) {
			const [, n, field] = c.key.split('.');
			const h = holders[Number(n)];
			if (h) /** @type {Record<string, string>} */ (h)[field] = c.after;
		}
		out.push(
			db
				.prepare('UPDATE orders SET holders = ?2 WHERE id = ?1')
				.bind(order.id, JSON.stringify(holders))
		);
	}

	// Las respuestas: la lista entera, con cada una cambiada en su lugar (o sumada al final).
	const answerChanges = changes.filter((c) => c.key.startsWith('answer.'));
	if (answerChanges.length) {
		/** @type {Answer[]} */
		let answers = state.answers.map((a) => ({ ...a }));
		for (const c of answerChanges) {
			const k = answerKey(c.key);
			if (!k) continue;
			const found = findAnswer(answers, k.id, k.ticket);
			if (!c.after) answers = answers.filter((a) => a !== found);
			else if (found) {
				found.value = c.after;
				if (c.kind) found.kind = c.kind;
			} else
				answers.push({
					id: k.id,
					label: c.question || c.label,
					value: c.after,
					...(k.ticket ? { ticket: k.ticket } : {}),
					...answerKindTag(c.kind)
				});
		}
		out.push(
			db
				.prepare(
					`INSERT INTO order_answers (order_id, answers, created_at) VALUES (?1, ?2, ?3)
					ON CONFLICT (order_id) DO UPDATE SET answers = excluded.answers`
				)
				.bind(
					order.id,
					JSON.stringify(
						// Como las guarda la compra: `ticket` y `kind` solo si hay.
						answers.map(({ id, label, value, ticket, kind }) => ({
							id,
							label,
							value,
							...(ticket ? { ticket } : {}),
							...answerKindTag(kind)
						}))
					),
					order.created_at
				)
		);
	}
	return out;
}

/**
 * La fila del historial, para la misma tanda.
 * @param {D1Database} db
 * @param {Order} order
 * @param {readonly Change[]} changes
 * @param {{ by: string, now: number, undoes?: number | null }} opts
 */
function recordStatement(db, order, changes, { by, now, undoes = null }) {
	return db
		.prepare(
			`INSERT INTO order_edits (order_id, event_slug, at, by, changes, undoes)
			VALUES (?1, ?2, ?3, ?4, ?5, ?6) RETURNING id`
		)
		.bind(order.id, order.event_slug, now, by, JSON.stringify(changes), undoes);
}

/** El último cambio de una orden (0 si no tiene). */
async function lastEditId(/** @type {D1Database} */ db, /** @type {string} */ orderId) {
	const row = await db
		.prepare('SELECT MAX(id) AS id FROM order_edits WHERE order_id = ?1')
		.bind(orderId)
		.first();
	return Number(row?.id ?? 0);
}

/**
 * Guarda lo que cambió el formulario de «Editar».
 *
 * `since`: el último cambio que vio le admin al abrir el editor; si alguien guardó otro en el
 * medio, no se pisa: se pide volver a abrir.
 *
 * @param {D1Database} db
 * @param {{ order: Order, input: EditInput, fields: readonly SignupField[], since: number,
 *   by: string, now?: number }} opts
 * @returns {Promise<{ ok: true, id: number, changes: Change[] } | { ok: true, id: null, changes: [] }
 *   | { ok: false, status: number, message: string, errors?: Record<string, string> }>}
 */
export async function saveOrderEdit(db, { order, input, fields, since, by, now = Date.now() }) {
	if ((await lastEditId(db, order.id)) !== since) {
		return {
			ok: false,
			status: 409,
			message: 'Alguien más la editó recién. Cerrá y volvé a abrir «Editar».'
		};
	}
	const state = await readEditState(db, order);
	const { changes, errors } = diffEdit(state, input, fields, {
		typeId: order.ticket_type,
		quantity: order.quantity
	});
	// Un mail que tocó «No fui yo» no se le pone a una compra (como en «Corregir el mail…»).
	const email = changes.find((c) => c.key === 'buyer.email');
	if (email && (await isSuppressed(db, email.after))) {
		errors.email = 'Esa dirección pidió no recibir mails de Kinky Vibe.';
	}
	if (Object.keys(errors).length) {
		return { ok: false, status: 400, message: 'Revisá los datos marcados.', errors };
	}
	if (!changes.length) return { ok: true, id: null, changes: [] };
	const results = await db.batch([
		...applyStatements(db, order, state, changes),
		recordStatement(db, order, changes, { by, now })
	]);
	const id = Number(/** @type {any} */ (results.at(-1))?.results?.[0]?.id ?? 0);
	return { ok: true, id, changes };
}

/**
 * «Deshacer» un cambio: vuelve cada dato a lo que había, solo si sigue como lo dejó ese cambio
 * (si otro cambio lo tocó después, hay que deshacer ese primero). Queda como un cambio más, con
 * `undoes`; un cambio se deshace una vez (también un «Deshacer» se puede deshacer).
 *
 * @param {D1Database} db
 * @param {{ order: Order, editId: number, by: string, now?: number }} opts
 * @returns {Promise<{ ok: true, id: number, changes: Change[] } | { ok: false, status: number, message: string }>}
 */
export async function undoOrderEdit(db, { order, editId, by, now = Date.now() }) {
	const row = Number.isSafeInteger(editId)
		? await db
				.prepare(
					`SELECT e.changes, (SELECT 1 FROM order_edits u WHERE u.undoes = e.id) AS undone
					FROM order_edits e WHERE e.id = ?1 AND e.order_id = ?2 AND e.event_slug = ?3`
				)
				.bind(editId, order.id, order.event_slug)
				.first()
		: null;
	if (!row) return { ok: false, status: 404, message: 'No encontramos ese cambio.' };
	if (row.undone) return { ok: false, status: 409, message: 'Ese cambio ya se deshizo.' };
	const done = parseChanges(row.changes);
	const state = await readEditState(db, order);
	if (done.some((c) => !sameValue(c.key, stateValue(state, c.key), c.after))) {
		return {
			ok: false,
			status: 409,
			message: 'Eso cambió después: deshacé primero lo más nuevo.'
		};
	}
	/** @type {Change[]} */
	const changes = done.map((c) => ({ ...c, before: c.after, after: c.before }));
	try {
		const results = await db.batch([
			...applyStatements(db, order, state, changes),
			recordStatement(db, order, changes, { by, now, undoes: editId })
		]);
		const id = Number(/** @type {any} */ (results.at(-1))?.results?.[0]?.id ?? 0);
		return { ok: true, id, changes };
	} catch (error) {
		// Dos «Deshacer» a la vez: el índice único deja pasar uno y la tanda del otro no cambia nada.
		if (/UNIQUE/i.test(String(error))) {
			return { ok: false, status: 409, message: 'Ese cambio ya se deshizo.' };
		}
		throw error;
	}
}

/**
 * Los cambios guardados, sin confiar en la forma.
 * @param {unknown} json
 * @returns {Change[]}
 */
export function parseChanges(json) {
	let list;
	try {
		list = typeof json === 'string' ? JSON.parse(json) : json;
	} catch {
		return [];
	}
	if (!Array.isArray(list)) return [];
	return list
		.filter((c) => c && typeof c === 'object' && typeof c.key === 'string')
		.map((c) => ({
			key: String(c.key),
			label: String(c.label ?? c.key),
			before: String(c.before ?? ''),
			after: String(c.after ?? ''),
			...(c.question ? { question: String(c.question) } : {}),
			...answerKindTag(c.kind)
		}));
}

/**
 * El historial de cambios de las órdenes de un evento, por orden, del más nuevo al más viejo.
 * Sin la migración o con un error, vacío (Órdenes sigue andando).
 *
 * @param {D1Database} db
 * @param {string} slug
 * @returns {Promise<Map<string, OrderEdit[]>>}
 */
export async function editsByOrder(db, slug) {
	/** @type {Map<string, OrderEdit[]>} */
	const out = new Map();
	try {
		const { results } = await db
			.prepare(
				`SELECT id, order_id, at, by, changes, undoes FROM order_edits WHERE event_slug = ?1
				ORDER BY id DESC`
			)
			.bind(slug)
			.all();
		const undone = new Set(results.filter((r) => r.undoes != null).map((r) => Number(r.undoes)));
		for (const r of results) {
			const list = out.get(String(r.order_id)) ?? [];
			list.push({
				id: Number(r.id),
				at: Number(r.at),
				by: String(r.by),
				changes: parseChanges(r.changes),
				undoes: r.undoes == null ? null : Number(r.undoes),
				undone: undone.has(Number(r.id))
			});
			out.set(String(r.order_id), list);
		}
	} catch (error) {
		logDBError('cambios de las órdenes', error);
	}
	return out;
}
