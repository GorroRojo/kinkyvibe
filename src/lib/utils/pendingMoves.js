/**
 * Eventos movidos en el calendario de la agenda que todavía no se guardaron. Arrastrar un evento
 * (o "Mover a otro día") no guarda: anota el cambio, y "Guardar cambios" los manda todos juntos por
 * la action `saveMany` (un solo commit). Funciones puras:
 *
 * - `pendingMovesReducer`: el estado de los cambios pendientes (mover, volver, descartar…);
 * - `pendingSavePayload`: los pendientes → lo que manda "Guardar cambios";
 * - `withPendingMoves`: las filas como se ven con los pendientes aplicados;
 * - `restorePendingMoves`: los pendientes recuperados de un borrador, solo los que siguen valiendo.
 */
import { agendaValues, changedAgendaFields, readAgendaValues } from './agenda.js';
import { movedAgendaValues } from './calendario.js';

/** @typedef {import('./agenda.js').AgendaValues} Values */

/**
 * Un evento movido: `before` es lo guardado (lo que dice el archivo, contra lo que el servidor
 * detecta conflictos) y `after`, adónde lo movieron.
 * @typedef {{ slug: string, title: string, before: Values, after: Values }} PendingMove
 */

/** @typedef {Record<string, PendingMove>} PendingMoves */

/**
 * @typedef {(
 *   | { type: 'move', slug: string, title: string, saved: Values, to: { date: string, time?: string } }
 *   | { type: 'revert', slug: string }
 *   | { type: 'saved', slugs: string[] }
 *   | { type: 'rebase', slug: string, saved: Values }
 *   | { type: 'discard' }
 * )} PendingAction
 * - `move`: lo movieron (otra vez, si ya estaba pendiente) a `to`; `saved` es la fila guardada;
 * - `revert`: vuelve un evento a lo guardado;
 * - `saved`: esos se guardaron (dejan de estar pendientes);
 * - `rebase`: el archivo cambió (conflicto): sigue pendiente, sobre lo último guardado;
 * - `discard`: todos vuelven a lo guardado.
 */

/**
 * @param {PendingMoves} state
 * @param {PendingAction} action
 * @returns {PendingMoves}
 */
export function pendingMovesReducer(state, action) {
	switch (action.type) {
		case 'move': {
			const prev = state[action.slug];
			const before = prev ? prev.before : agendaValues(action.saved);
			const after = movedAgendaValues(prev ? prev.after : before, action.to);
			return setOrClear(state, { slug: action.slug, title: action.title, before, after });
		}
		case 'revert':
			return without(state, [action.slug]);
		case 'saved':
			return without(state, action.slugs);
		case 'rebase': {
			const prev = state[action.slug];
			if (!prev) return state;
			const before = agendaValues(action.saved);
			const after = movedAgendaValues(before, {
				date: prev.after.date,
				time: prev.after.startTime
			});
			return setOrClear(state, { ...prev, before, after });
		}
		case 'discard':
			return {};
		default:
			return state;
	}
}

/**
 * Lo anota, o lo saca si quedó como estaba guardado (lo volvieron a su día).
 * @param {PendingMoves} state
 * @param {PendingMove} move
 */
function setOrClear(state, move) {
	if (!changedAgendaFields(move.before, move.after).length) return without(state, [move.slug]);
	return { ...state, [move.slug]: move };
}

/** @param {PendingMoves} state @param {string[]} slugs */
function without(state, slugs) {
	if (!slugs.some((s) => s in state)) return state;
	const next = { ...state };
	for (const s of slugs) delete next[s];
	return next;
}

/**
 * Los cambios pendientes → el pedido de la action `saveMany` (`rows`): lo guardado y lo nuevo de
 * cada evento, ordenados por slug (así el commit y los mensajes salen siempre igual).
 * @param {PendingMoves} state
 * @returns {Array<{ slug: string, before: Values, after: Values }>}
 */
export function pendingSavePayload(state) {
	return Object.values(state)
		.sort((a, b) => a.slug.localeCompare(b.slug))
		.map(({ slug, before, after }) => ({ slug, before: { ...before }, after: { ...after } }));
}

/**
 * Las filas como se ven con los cambios pendientes aplicados (`pending: true` en las movidas).
 * @template {import('./agenda.js').AgendaRow} R
 * @param {R[]} rows
 * @param {PendingMoves} state
 * @returns {Array<R & { pending?: boolean }>}
 */
export function withPendingMoves(rows, state) {
	return rows.map((r) => {
		const p = state[r.slug];
		return p ? { ...r, ...p.after, slug: r.slug, pending: true } : r;
	});
}

/**
 * Pendientes recuperados de un borrador del navegador: quedan solo los de eventos que siguen
 * existiendo y que nadie cambió desde entonces (si el archivo cambió, el movimiento se descarta en
 * vez de pisar lo nuevo). Lo que no tiene la forma esperada se ignora.
 * @param {unknown} data
 * @param {import('./agenda.js').AgendaRow[]} rows
 * @returns {PendingMoves}
 */
export function restorePendingMoves(data, rows) {
	if (!data || typeof data !== 'object' || Array.isArray(data)) return {};
	const bySlug = new Map(rows.map((r) => [r.slug, r]));
	/** @type {PendingMoves} */
	const out = {};
	for (const [slug, raw] of Object.entries(data)) {
		const row = bySlug.get(slug);
		const m = /** @type {any} */ (raw);
		if (!row || !m || typeof m !== 'object' || !m.before || !m.after) continue;
		const saved = agendaValues(row);
		const before = readAgendaValues(m.before);
		const after = readAgendaValues(m.after);
		if (changedAgendaFields(saved, before).length) continue;
		if (!changedAgendaFields(before, after).length) continue;
		out[slug] = { slug, title: row.title || slug, before, after };
	}
	return out;
}
