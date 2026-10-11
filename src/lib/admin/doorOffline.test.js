import { describe, expect, it } from 'vitest';
import {
	doorConnectionNote,
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
	undoLocal,
	applySaleSyncResults,
	emptyDoorState,
	isPendingSaleTicket,
	markRecentSynced,
	offlineSaleLimits,
	pendingNote,
	queueOfflineSale,
	salesPayload
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
		const state = { list, queue: [], savedAt: 1, sales: [], failed: [] };
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
		const state = { list, queue: [], savedAt: 1, sales: [], failed: [] };
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
			savedAt: 1,
			sales: [],
			failed: []
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
			savedAt: 1,
			sales: [],
			failed: []
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
		// El estado completo (con la cola de ventas sin conexión, decisión 0035).
		const state = { list: [ticket({})], queue: [], savedAt: 5, sales: [], failed: [] };
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
		expect(loadDoorState(broken, 'ev')).toEqual({
			list: [],
			queue: [],
			savedAt: null,
			sales: [],
			failed: []
		});
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

describe('doorConnectionNote', () => {
	it('con conexión y la lista guardada: «Listo para sin conexión», con la hora', () => {
		const n = doorConnectionNote({ online: true, saved: true, savedAt: '21:40' });
		expect(n?.kind).toBe('ready');
		expect(n?.title).toBe('Listo para sin conexión.');
		expect(n?.detail).toContain('(21:40)');
		expect(n?.detail).toContain('podés seguir validando');
	});

	it('con conexión y sin lista todavía: no muestra nada', () => {
		expect(doorConnectionNote({ online: true, saved: false, savedAt: '' })).toBeNull();
	});

	// Decisión 0035: vender en la puerta pasó de «necesita conexión» a «sigue andando». Este caso
	// antes pedía que el aviso nombrara la venta entre lo que necesita conexión; ahora la nombra
	// entre lo que anda, con la nota de que se sincroniza después.
	it('sin conexión y con lista: qué sigue andando (también vender) y qué necesita conexión', () => {
		const n = doorConnectionNote({ online: false, saved: true, savedAt: '22:05' });
		expect(n?.kind).toBe('offline');
		expect(n?.title).toBe('Sin conexión.');
		expect(n?.detail).toContain('Podés seguir validando');
		expect(n?.detail).toContain('(22:05)');
		expect(n?.detail).toContain('vender en la puerta');
		expect(n?.detail).toContain('los ingresos y las ventas se mandan solos cuando vuelve');
		expect(n?.detail).toContain('Ver el DNI completo necesita conexión');
		expect(n?.detail).not.toMatch(/vender en la puerta[^.]*necesita/i);
	});

	it('sin conexión en un evento sin venta en la puerta: no ofrece vender', () => {
		const n = doorConnectionNote({ online: false, saved: true, savedAt: '', canSell: false });
		expect(n?.detail).toContain('Podés seguir validando');
		expect(n?.detail).not.toContain('vender');
		expect(n?.detail).toContain('Ver el DNI completo necesita conexión');
	});

	it('sin conexión y sin lista: no se puede validar, y se baja sola al volver', () => {
		const n = doorConnectionNote({ online: false, saved: false, savedAt: '' });
		expect(n?.kind).toBe('offline');
		expect(n?.detail).toContain('no se puede validar');
		expect(n?.detail).toContain('se baja sola');
		// Vender no depende de la lista.
		expect(n?.detail).toContain('Podés vender en la puerta');
	});

	it('sin hora no deja paréntesis vacíos', () => {
		expect(doorConnectionNote({ online: true, saved: true, savedAt: '' })?.detail).not.toContain(
			'()'
		);
	});
});

describe('ventas sin conexión', () => {
	const NOW = Date.parse('2026-10-01T23:00:00Z');
	const GENERAL = { id: 'general', name: 'General' };
	/** Datos inventados. */
	const FIELDS = {
		type: 'general',
		quantity: '2',
		method: 'efectivo',
		name: 'Persona Inventada',
		email: 'prueba@example.com',
		dni: '30123456',
		holder_1: 'Otra Persona'
	};
	/**
	 * @param {import('./doorOffline.js').DoorState} state
	 * @param {string} id
	 * @param {Partial<Parameters<typeof queueOfflineSale>[1]>} [o]
	 */
	const queue = (state, id, o = {}) =>
		queueOfflineSale(state, {
			id,
			now: NOW,
			by: 'admin-de-prueba',
			fields: FIELDS,
			type: GENERAL,
			quantity: 2,
			total: 16000,
			holders: [
				{ name: 'Persona Inventada', pronouns: 'elle' },
				{ name: 'Otra Persona', pronouns: '' }
			],
			...o
		});

	it('se encola y sus entradas cuentan como adentro en este celu, pendientes', () => {
		const base = { ...emptyDoorState(), list: [ticket({})] };
		const { state, sale } = queue(base, 'venta-0001');
		expect(base.sales).toHaveLength(0);
		expect(state.sales).toHaveLength(1);
		expect(sale).toMatchObject({
			id: 'venta-0001',
			buyer: 'Persona Inventada',
			quantity: 2,
			method: 'efectivo'
		});
		expect(state.list).toHaveLength(3);
		expect(localCounts(state.list)).toMatchObject({ total: 3, inside: 2 });
		expect(sale.tickets.every((x) => x.at === NOW && isPendingSaleTicket(x.ticketId))).toBe(true);
		expect(sale.tickets[0].orderRef).toBe('Pendiente de sincronizar');
	});

	it('el DNI no se guarda en el celu', () => {
		const { state } = queue(emptyDoorState(), 'venta-0001');
		expect(state.sales[0].fields).not.toHaveProperty('dni');
		/** @type {Record<string, string>} */
		const box = {};
		const storage = /** @type {Storage} */ (
			/** @type {unknown} */ ({
				getItem: (/** @type {string} */ k) => box[k] ?? null,
				setItem: (/** @type {string} */ k, /** @type {string} */ v) => (box[k] = v)
			})
		);
		saveDoorState(storage, 'fiesta', state);
		expect(JSON.stringify(box)).not.toContain('30123456');
		// Y vuelve igual al recargar la página.
		expect(loadDoorState(storage, 'fiesta').sales).toEqual(state.sales);
	});

	it('lo guardado antes de esta versión (sin ventas) sigue cargando', () => {
		const storage = /** @type {Storage} */ (
			/** @type {unknown} */ ({
				getItem: () => JSON.stringify({ list: [ticket({})], queue: [], savedAt: 5 })
			})
		);
		const s = loadDoorState(storage, 'fiesta');
		expect(s.sales).toEqual([]);
		expect(s.failed).toEqual([]);
		expect(s.list).toHaveLength(1);
	});

	it('la lista nueva del servidor mantiene las entradas de las ventas pendientes', () => {
		const { state } = queue(emptyDoorState(), 'venta-0001');
		const merged = mergeServerList([ticket({})], [], state.sales);
		expect(merged).toHaveLength(3);
		expect(merged.filter((x) => isPendingSaleTicket(x.ticketId))).toHaveLength(2);
	});

	it('se mandan en el orden en que se vendieron, sin las entradas locales', () => {
		let s = emptyDoorState();
		s = queue(s, 'venta-000b', { now: NOW + 2000 }).state;
		s = queue(s, 'venta-000a', { now: NOW + 1000 }).state;
		const payload = salesPayload(s.sales);
		expect(payload.map((x) => x.id)).toEqual(['venta-000a', 'venta-000b']);
		expect(Object.keys(payload[0]).sort()).toEqual(['at', 'fields', 'id']);
	});

	it('al sincronizar: saca las registradas (también las repetidas) y avisa las que pasaron un límite', () => {
		let s = { ...emptyDoorState(), list: [ticket({})] };
		s = queue(s, 'venta-0001').state;
		s = queue(s, 'venta-0002', { fields: { ...FIELDS, name: 'Se Pasa' } }).state;
		s = queue(s, 'venta-0003').state;
		const r = applySaleSyncResults(s, [
			{ id: 'venta-0001', result: 'ok', ref: 'KV-AAAA1111', review: [] },
			{
				id: 'venta-0002',
				result: 'ok',
				ref: 'KV-BBBB2222',
				buyer: 'Se Pasa',
				review: ['Se pasa del cupo de «General»: quedarían 4 / 3, 1 entrada de más.']
			}
		]);
		expect(r.done).toBe(2);
		expect(r.state.sales.map((x) => x.id)).toEqual(['venta-0003']);
		// Quedan la entrada del servidor y las 2 de la venta que falta mandar.
		expect(r.state.list).toHaveLength(3);
		expect(r.warnings).toEqual([
			{ buyer: 'Se Pasa', ref: 'KV-BBBB2222', review: [expect.stringContaining('cupo')] }
		]);
		const again = applySaleSyncResults(r.state, [
			{ id: 'venta-0003', result: 'duplicate', ref: 'KV-CCCC3333' }
		]);
		expect(again.done).toBe(1);
		expect(again.state.sales).toEqual([]);
		expect(again.warnings).toEqual([]);
	});

	it('una venta que el servidor no pudo registrar no se pierde: queda a la vista', () => {
		const { state } = queue(emptyDoorState(), 'venta-0001');
		const r = applySaleSyncResults(state, [
			{ id: 'venta-0001', result: 'rejected', message: 'Elegí un tipo de entrada.' }
		]);
		expect(r.done).toBe(0);
		expect(r.state.sales).toEqual([]);
		expect(r.state.failed).toEqual([
			expect.objectContaining({
				id: 'venta-0001',
				buyer: 'Persona Inventada',
				quantity: 2,
				total: 16000,
				message: 'Elegí un tipo de entrada.'
			})
		]);
	});

	it('las que el servidor no contestó siguen en la cola', () => {
		const { state } = queue(emptyDoorState(), 'venta-0001');
		const r = applySaleSyncResults(state, []);
		expect(r.state.sales).toHaveLength(1);
		expect(r.state.list).toHaveLength(2);
	});

	it('«Últimos escaneos»: las ventas ya registradas dejan de decir «pendiente»', () => {
		const recent = [
			{
				result: 'sold',
				title: 'A',
				sub: 'pendiente de sincronizar',
				at: 2,
				ticketId: 'local:v1:0'
			},
			{
				result: 'sold',
				title: 'B',
				sub: 'pendiente de sincronizar',
				at: 1,
				ticketId: 'local:v2:0'
			},
			{ result: 'ok', title: 'C', sub: '', at: 0, ticketId: 't1' }
		];
		expect(markRecentSynced(recent, ['v1']).map((r) => r.sub)).toEqual([
			'sincronizada',
			'pendiente de sincronizar',
			''
		]);
	});

	it('cuántas ventas e ingresos faltan sincronizar', () => {
		expect(pendingNote({ checkins: 0, sales: 0 })).toBe('');
		expect(pendingNote({ checkins: 0, sales: 2 })).toBe('2 ventas por sincronizar.');
		expect(pendingNote({ checkins: 0, sales: 1 })).toBe('1 venta por sincronizar.');
		expect(pendingNote({ checkins: 3, sales: 1 })).toBe('1 venta y 3 ingresos por sincronizar.');
		expect(pendingNote({ checkins: 1, sales: 0 })).toBe('1 ingreso por sincronizar.');
	});

	it('avisa antes de guardar si, con lo que sabe el celu, pasaría un límite', () => {
		const type = { id: 'general', name: 'General', capacity: 3, taken: 1 };
		const base = { type, quantity: 1, doorSales: true, maxPerSale: 10, sales: [] };
		expect(offlineSaleLimits(base)).toEqual([]);
		const { state } = queue(emptyDoorState(), 'venta-0001');
		// 1 vendida + 2 sin conexión + 1 = 4 de 3.
		expect(offlineSaleLimits({ ...base, sales: state.sales })[0].message).toContain('4 / 3');
		expect(offlineSaleLimits({ ...base, quantity: 11, type: { ...type, capacity: null } })).toEqual(
			[{ message: expect.stringContaining('máximo por venta es 10') }]
		);
		expect(offlineSaleLimits({ ...base, doorSales: false })[0].message).toContain(
			'solo anticipadas'
		);
	});
});
