import { describe, expect, it } from 'vitest';
import {
	invalidTitle,
	markRecentUndone,
	applySyncResults,
	findTicket,
	loadDoorState,
	localCheckIn,
	localCounts,
	localSearch,
	mergeServerList,
	parseScan,
	saveDoorState,
	sha256Hex,
	undoLocal
} from './doorOffline.js';

const TOKEN = 'A'.repeat(42) + 'b';

/** @param {Partial<import('./doorOffline.js').OfflineTicket>} o */
function ticket(o) {
	return {
		ticketId: 't1',
		orderId: 'o1',
		orderRef: 'KV-O1',
		holder: 'Persona Ñandú',
		pronouns: 'elle',
		type: 'General',
		typeId: 'general',
		buyer: 'Persona Ñandú',
		email: 'prueba@example.com',
		dniTail: '456',
		code: 'ABC234',
		at: null,
		by: null,
		firstTime: true,
		hash: '',
		valid: true,
		...o
	};
}

describe('parseScan', () => {
	it('link del QR, token solo o código corto', () => {
		expect(parseScan(`https://kinkyvibe.ar/entradas/t/${TOKEN}`)).toEqual({
			kind: 'token',
			token: TOKEN
		});
		expect(parseScan(`  ${TOKEN} `)).toEqual({ kind: 'token', token: TOKEN });
		expect(parseScan('kv-abc 234')).toEqual({ kind: 'code', code: 'ABC234' });
		expect(parseScan('hola')).toBeNull();
		expect(parseScan(null)).toBeNull();
	});
});

describe('validar y marcar sin conexión', () => {
	it('encuentra por hash del token o por código, y encola el ingreso', async () => {
		const list = [
			ticket({ hash: await sha256Hex(TOKEN) }),
			ticket({ ticketId: 't2', code: 'XYZ789', hash: 'x' })
		];
		const state = { list, queue: [], savedAt: 1 };
		const parsed = parseScan(`/entradas/t/${TOKEN}`);
		const found = await findTicket(list, parsed);
		expect(found?.ticketId).toBe('t1');
		const r = localCheckIn(state, parsed, found, { now: 1000, by: 'gorrite', id: 'q1' });
		expect(r.result).toBe('ok');
		expect(r.state.queue).toEqual([
			{ id: 'q1', ticketId: 't1', holder: 'Persona Ñandú', token: TOKEN, at: 1000 }
		]);
		expect(r.state.list[0].at).toBe(1000);
		expect(state.queue).toHaveLength(0); // no muta

		// Otra vez: ya ingresó (sin conexión también).
		const again = localCheckIn(r.state, parsed, await findTicket(r.state.list, parsed), {
			now: 2000,
			by: 'gorrite',
			id: 'q2'
		});
		expect(again.result).toBe('already');
		expect(again.state.queue).toHaveLength(1);

		const byCode = parseScan('xyz 789');
		const r2 = localCheckIn(r.state, byCode, await findTicket(r.state.list, byCode), {
			now: 3000,
			by: 'gorrite',
			id: 'q3'
		});
		expect(r2.state.queue[1]).toMatchObject({ code: 'XYZ789', ticketId: 't2' });
		expect(localCounts(r2.state.list)).toEqual({
			total: 2,
			inside: 2,
			byType: { general: { total: 2, inside: 2 } }
		});
	});

	it('anulada e inválida', async () => {
		const list = [ticket({ valid: false })];
		const state = { list, queue: [], savedAt: 1 };
		const p = parseScan('ABC234');
		expect(
			localCheckIn(state, p, await findTicket(list, p), { now: 1, by: 'x', id: 'q' }).result
		).toBe('void');
		const bad = parseScan('ZZZ999');
		expect(
			localCheckIn(state, bad, await findTicket(list, bad), { now: 1, by: 'x', id: 'q' }).result
		).toBe('invalid');
		expect(localCounts(list).total).toBe(0);
	});

	it('deshacer solo lo que no se sincronizó', () => {
		const state = {
			list: [ticket({ at: 5 })],
			queue: [{ id: 'q', ticketId: 't1', holder: 'x', code: 'ABC234', at: 5 }],
			savedAt: 1
		};
		const undone = undoLocal(state, 't1');
		expect(undone?.queue).toHaveLength(0);
		expect(undone?.list[0].at).toBeNull();
		expect(undoLocal({ ...state, queue: [] }, 't1')).toBeNull();
	});
});

describe('sincronizar', () => {
	it('saca de la cola lo procesado y reporta conflictos', () => {
		const state = {
			list: [
				ticket({ at: 5 }),
				ticket({ ticketId: 't2', at: 6 }),
				ticket({ ticketId: 't3', at: 7 })
			],
			queue: [
				{ id: 'q1', ticketId: 't1', holder: 'Uno', code: 'A', at: 5 },
				{ id: 'q2', ticketId: 't2', holder: 'Dos', code: 'B', at: 6 },
				{ id: 'q3', ticketId: 't3', holder: 'Tres', code: 'C', at: 7 },
				{ id: 'q4', ticketId: 't4', holder: 'Cuatro', code: 'D', at: 8 }
			],
			savedAt: 1
		};
		const r = applySyncResults(state, [
			{ id: 'q1', result: 'ok' },
			{ id: 'q2', result: 'conflict', holder: 'Dos', at: 3, by: 'otre' },
			{ id: 'q3', result: 'void', holder: 'Tres' }
		]);
		expect(r.done).toBe(3);
		expect(r.state.queue.map((q) => q.id)).toEqual(['q4']);
		expect(r.conflicts).toEqual([
			{ holder: 'Dos', result: 'conflict', at: 3, by: 'otre' },
			{ holder: 'Tres', result: 'void', at: null, by: null }
		]);
		expect(r.state.list[1]).toMatchObject({ at: 3, by: 'otre' });
		expect(r.state.list[2]).toMatchObject({ at: null, valid: false });
	});

	it('la lista nueva del servidor conserva lo que sigue en la cola', () => {
		const merged = mergeServerList(
			[ticket({}), ticket({ ticketId: 't2' })],
			[{ id: 'q', ticketId: 't2', holder: 'x', code: 'B', at: 9 }]
		);
		expect(merged.map((t) => t.at)).toEqual([null, 9]);
	});
});

describe('buscar y guardar', () => {
	it('busca sin tildes por nombre, email o código', () => {
		const list = [
			ticket({}),
			ticket({
				ticketId: 't2',
				holder: 'Otre',
				buyer: 'Otre',
				email: 'o@example.com',
				code: 'XYZ789'
			})
		];
		expect(localSearch(list, 'nandu').map((t) => t.ticketId)).toEqual(['t1']);
		expect(localSearch(list, 'o@exa').map((t) => t.ticketId)).toEqual(['t2']);
		expect(localSearch(list, 'kv-xyz789').map((t) => t.ticketId)).toEqual(['t2']);
		expect(localSearch(list, 'n')).toEqual([]);
	});

	it('localStorage con try/catch', () => {
		/** @type {Record<string, string>} */
		const mem = {};
		const storage = /** @type {Storage} */ (
			/** @type {unknown} */ ({
				getItem: (/** @type {string} */ k) => mem[k] ?? null,
				setItem: (/** @type {string} */ k, /** @type {string} */ v) => {
					mem[k] = v;
				}
			})
		);
		const state = { list: [ticket({})], queue: [], savedAt: 5 };
		expect(saveDoorState(storage, 'ev', state)).toBe(true);
		expect(loadDoorState(storage, 'ev')).toEqual(state);
		const broken = /** @type {Storage} */ (
			/** @type {unknown} */ ({
				getItem: () => {
					throw new Error('bloqueado');
				},
				setItem: () => {
					throw new Error('lleno');
				}
			})
		);
		expect(loadDoorState(broken, 'ev')).toEqual({ list: [], queue: [], savedAt: null });
		expect(saveDoorState(broken, 'ev', state)).toBe(false);
		mem['kv-door:roto'] = '{no';
		expect(loadDoorState(storage, 'roto').list).toEqual([]);
	});
});

describe('Puerta: textos y «Deshacer»', () => {
	it('un código escrito que no existe es «Código no encontrado»; un QR, «QR inválido»', () => {
		expect(invalidTitle('invalid', true)).toBe('Código no encontrado');
		expect(invalidTitle('invalid', false)).toBe('QR inválido');
		expect(invalidTitle('ok', true)).toBe('');
	});
	it('después de deshacer, el último ingreso de esa entrada deja de figurar como adentro', () => {
		const recent = [
			{ result: 'ok', title: 'Persona Uno · General', sub: '', at: 3, ticketId: 't1' },
			{ result: 'ok', title: 'Persona Dos · General', sub: '', at: 2, ticketId: 't2' },
			{ result: 'already', title: 'Persona Uno · ya ingresó', sub: '', at: 1, ticketId: 't1' }
		];
		const next = markRecentUndone(recent, 't1', 'Persona Uno');
		expect(next[0]).toMatchObject({ result: 'undone', title: 'Persona Uno · ingreso deshecho' });
		expect(next[1]).toEqual(recent[1]);
		expect(next[2]).toEqual(recent[2]);
	});
});
