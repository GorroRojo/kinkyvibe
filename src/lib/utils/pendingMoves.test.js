import { describe, expect, it } from 'vitest';
import {
	pendingMovesReducer,
	pendingMovesSummary,
	pendingSavePayload,
	restorePendingMoves,
	withPendingMoves
} from './pendingMoves.js';
import { agendaRowFromMeta, agendaValues } from './agenda.js';

/** @param {string} slug @param {Record<string, unknown>} [meta] */
const row = (slug, meta = {}) =>
	agendaRowFromMeta(slug, {
		title: `Evento ${slug}`,
		start: '2099-12-12T21:00-03:00',
		end: '2099-12-13T02:00-03:00',
		location_name: 'Lugar de prueba',
		tags: ['español', 'AMBA'],
		status: 'abierto',
		...meta
	});

const A = row('evento-a');
const B = row('evento-b', { start: '2099-12-20T20:00-03:00', end: '2099-12-20T23:00-03:00' });

/**
 * @param {import('./pendingMoves.js').PendingMoves} state
 * @param {import('./agenda.js').AgendaRow} r
 * @param {{ date: string, time?: string }} to
 */
const move = (state, r, to) =>
	pendingMovesReducer(state, { type: 'move', slug: r.slug, title: r.title, saved: r, to });

describe('pendingMovesReducer', () => {
	it('mover anota el cambio: lo guardado en before, el día nuevo en after', () => {
		const s = move({}, A, { date: '2099-12-19' });
		expect(Object.keys(s)).toEqual(['evento-a']);
		expect(s['evento-a'].title).toBe('Evento evento-a');
		expect(s['evento-a'].before).toEqual(agendaValues(A));
		expect(s['evento-a'].after).toEqual({ ...agendaValues(A), date: '2099-12-19' });
	});

	it('moverlo de nuevo actualiza el mismo cambio (before sigue siendo lo guardado)', () => {
		let s = move({}, A, { date: '2099-12-19' });
		s = move(s, A, { date: '2099-12-26', time: '22:00' });
		expect(Object.keys(s)).toEqual(['evento-a']);
		expect(s['evento-a'].before).toEqual(agendaValues(A));
		// la hora de fin se corre lo mismo que la de inicio
		expect(s['evento-a'].after).toMatchObject({
			date: '2099-12-26',
			startTime: '22:00',
			endTime: '03:00'
		});
	});

	it('volverlo a su día (y hora) original lo saca de los pendientes', () => {
		let s = move({}, A, { date: '2099-12-19', time: '23:00' });
		s = move(s, A, { date: '2099-12-12', time: '21:00' });
		expect(s).toEqual({});
	});

	it('soltarlo donde estaba no anota nada', () => {
		expect(move({}, A, { date: '2099-12-12' })).toEqual({});
	});

	it('varios eventos se anotan por separado', () => {
		let s = move({}, A, { date: '2099-12-19' });
		s = move(s, B, { date: '2099-12-21' });
		expect(Object.keys(s).sort()).toEqual(['evento-a', 'evento-b']);
	});

	it('revert vuelve uno solo; discard, todos', () => {
		let s = move({}, A, { date: '2099-12-19' });
		s = move(s, B, { date: '2099-12-21' });
		expect(Object.keys(pendingMovesReducer(s, { type: 'revert', slug: 'evento-a' }))).toEqual([
			'evento-b'
		]);
		expect(pendingMovesReducer(s, { type: 'discard' })).toEqual({});
	});

	it('saved saca los que se guardaron y deja los que fallaron', () => {
		let s = move({}, A, { date: '2099-12-19' });
		s = move(s, B, { date: '2099-12-21' });
		const next = pendingMovesReducer(s, { type: 'saved', slugs: ['evento-b'] });
		expect(Object.keys(next)).toEqual(['evento-a']);
	});

	it('rebase (conflicto): sigue pendiente al día elegido, sobre lo último del archivo', () => {
		const s = move({}, A, { date: '2099-12-19' });
		// otra persona le cambió el título y la hora de fin mientras tanto
		const fresh = { ...agendaValues(A), title: 'Título nuevo', endTime: '04:00' };
		const next = pendingMovesReducer(s, { type: 'rebase', slug: 'evento-a', saved: fresh });
		expect(next['evento-a'].before).toEqual(fresh);
		expect(next['evento-a'].after).toEqual({ ...fresh, date: '2099-12-19' });
	});

	it('rebase: si otra persona ya lo movió a ese mismo día, deja de estar pendiente', () => {
		const s = move({}, A, { date: '2099-12-19' });
		const fresh = { ...agendaValues(A), date: '2099-12-19' };
		expect(pendingMovesReducer(s, { type: 'rebase', slug: 'evento-a', saved: fresh })).toEqual({});
	});

	it('no modifica el estado anterior', () => {
		const s = move({}, A, { date: '2099-12-19' });
		const copy = structuredClone(s);
		move(s, B, { date: '2099-12-21' });
		pendingMovesReducer(s, { type: 'discard' });
		pendingMovesReducer(s, { type: 'revert', slug: 'evento-a' });
		expect(s).toEqual(copy);
	});
});

describe('pendingSavePayload', () => {
	it('arma las filas de saveMany (slug, before, after), ordenadas por slug', () => {
		let s = move({}, B, { date: '2099-12-21' });
		s = move(s, A, { date: '2099-12-19', time: '22:00' });
		const payload = pendingSavePayload(s);
		expect(payload).toEqual([
			{
				slug: 'evento-a',
				before: agendaValues(A),
				after: { ...agendaValues(A), date: '2099-12-19', startTime: '22:00', endTime: '03:00' }
			},
			{
				slug: 'evento-b',
				before: agendaValues(B),
				after: { ...agendaValues(B), date: '2099-12-21' }
			}
		]);
		// sin el título del aviso ni otras cosas de la página
		expect(Object.keys(payload[0])).toEqual(['slug', 'before', 'after']);
	});

	it('sin pendientes no manda nada', () => {
		expect(pendingSavePayload({})).toEqual([]);
	});

	it('es una copia: cambiarla no toca los pendientes', () => {
		const s = move({}, A, { date: '2099-12-19' });
		pendingSavePayload(s)[0].after.date = '2000-01-01';
		expect(s['evento-a'].after.date).toBe('2099-12-19');
	});
});

describe('withPendingMoves', () => {
	it('muestra las filas movidas en su día nuevo, marcadas', () => {
		const s = move({}, A, { date: '2099-12-19' });
		const rows = withPendingMoves([A, B], s);
		expect(rows[0]).toMatchObject({ slug: 'evento-a', date: '2099-12-19', pending: true });
		expect(rows[0].status).toBe(A.status);
		expect(rows[1]).toBe(B);
	});
});

describe('restorePendingMoves', () => {
	it('recupera los que siguen valiendo', () => {
		const s = move({}, A, { date: '2099-12-19' });
		const back = restorePendingMoves(JSON.parse(JSON.stringify(s)), [A, B]);
		expect(back).toEqual(s);
	});

	it('descarta los de eventos que ya no están o que cambiaron desde entonces', () => {
		let s = move({}, A, { date: '2099-12-19' });
		s = move(s, B, { date: '2099-12-21' });
		const changedA = { ...A, date: '2099-12-15' };
		expect(restorePendingMoves(s, [changedA])).toEqual({});
		expect(Object.keys(restorePendingMoves(s, [A]))).toEqual(['evento-a']);
	});

	it('ignora basura', () => {
		expect(restorePendingMoves(null, [A])).toEqual({});
		expect(restorePendingMoves('x', [A])).toEqual({});
		expect(restorePendingMoves([1, 2], [A])).toEqual({});
		expect(restorePendingMoves({ 'evento-a': 3 }, [A])).toEqual({});
		expect(restorePendingMoves({ 'evento-a': { before: agendaValues(A) } }, [A])).toEqual({});
	});
});

describe('pendingMovesSummary', () => {
	it('sin pendientes no dice nada', () => {
		expect(pendingMovesSummary({})).toBe('');
	});

	it('un evento: nombre, día de antes y día de después', () => {
		const s = move({}, A, { date: '2099-12-19' });
		expect(pendingMovesSummary(s)).toBe(
			'Vas a mover: «Evento evento-a» del sáb 12 dic al sáb 19 dic.'
		);
	});

	it('varios, separados por «;» y en el mismo orden que se guardan', () => {
		let s = move({}, B, { date: '2099-12-21' });
		s = move(s, A, { date: '2099-12-13' });
		expect(pendingMovesSummary(s)).toBe(
			'Vas a mover: «Evento evento-a» del sáb 12 dic al dom 13 dic; «Evento evento-b» del dom 20 dic al lun 21 dic.'
		);
		expect(pendingSavePayload(s).map((c) => c.slug)).toEqual(['evento-a', 'evento-b']);
	});

	it('si también cambió la hora, la muestra de los dos lados', () => {
		const s = move({}, A, { date: '2099-12-19', time: '23:00' });
		expect(pendingMovesSummary(s)).toBe(
			'Vas a mover: «Evento evento-a» del sáb 12 dic 21:00 al sáb 19 dic 23:00.'
		);
	});
});
