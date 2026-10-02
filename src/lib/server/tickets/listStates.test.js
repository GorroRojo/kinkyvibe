/**
 * Estado de la venta para las tarjetas de las listas (listStates.js), con D1 real en memoria:
 * eventos inventados abiertos, agotados, con la venta cerrada, que todavía no abren y sin
 * entradas. Todos se resuelven con UNA consulta a `orders`, y cada uno dice lo mismo que la página
 * del evento (`getTicketsView` + `summarizeTickets`).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./events.js', async () => {
	const { parseTicketConfig } = await import('./config.js');
	const DAY = 24 * 60 * 60 * 1000;
	const common = {
		title: 'Evento de prueba',
		start: '2099-12-01T20:00-03:00',
		status: 'abierto',
		location: 'Un lugar inventado 123',
		modalidad: 'presencial',
		tags: ['AMBA'],
		payment_methods: ['transferencia']
	};
	/** @type {Record<string, Record<string, any>>} */
	const metas = {
		abierto: {
			...common,
			tickets: [{ id: 'general', name: 'General', price: 5000, capacity: 10 }]
		},
		agotado: {
			...common,
			tickets: [
				{ id: 'general', name: 'General', price: 5000, capacity: 2 },
				{ id: 'ultima', name: 'Última', price: 7000, capacity: 1, after: 'general' }
			]
		},
		'agotado-encadenado': {
			...common,
			tickets: [
				{ id: 'general', name: 'General', price: 5000, capacity: 1 },
				{ id: 'ultima', name: 'Última', price: 7000, capacity: 5, after: 'general' }
			]
		},
		cerrado: {
			...common,
			tickets_close: new Date(Date.now() - DAY).toISOString(),
			tickets: [{ id: 'general', name: 'General', price: 5000 }]
		},
		'tipo-cerrado': {
			...common,
			tickets: [
				{
					id: 'anticipada',
					name: 'Anticipada',
					price: 4000,
					close: new Date(Date.now() - DAY).toISOString()
				},
				{ id: 'general', name: 'General', price: 5000, capacity: 1 }
			]
		},
		'no-abre': {
			...common,
			tickets_open: new Date(Date.now() + 3 * DAY).toISOString(),
			tickets: [{ id: 'general', name: 'General', price: 5000 }]
		},
		'estado-agotadas': {
			...common,
			status: 'agotadas',
			tickets: [{ id: 'general', name: 'General', price: 5000 }]
		},
		'sin-entradas': { ...common, link: 'https://example.com/inscripcion' }
	};
	return {
		isValidEventSlug: () => true,
		isTestEventSlug: () => false,
		getEventTickets: async (/** @type {string} */ slug, /** @type {any} */ opts) =>
			metas[slug]?.tickets ? parseTicketConfig(metas[slug], opts) : null,
		listTicketedEvents: async () => []
	};
});

import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import { getTicketsView, summarizeTickets } from './checkout.js';
import { getListTicketStates, ticketStatesFor } from './listStates.js';
import { reserveOrder } from './orders.js';

/** @type {Awaited<ReturnType<typeof createTestDB>>} */
let t;
beforeAll(async () => {
	t = await createTestDB();
});
afterAll(async () => {
	await t?.dispose();
});

const BIG = { perEmailQuantity: 1000, perEmailOrders: 1000, perClientQuantity: 1000 };
let n = 0;

/**
 * Lugares tomados (aprobados) de un tipo, con personas inventadas.
 * @param {string} slug
 * @param {string} typeId
 * @param {number} quantity
 */
async function preload(slug, typeId, quantity) {
	const r = await reserveOrder(t.db, {
		eventSlug: slug,
		type: { id: typeId, price: 1000, capacity: null, tier: null },
		quantity,
		holders: Array.from({ length: quantity }, (_, i) => ({
			name: `Persona ${i + 1}`,
			pronouns: 'elle'
		})),
		buyer: { name: 'Precarga', email: `precarga${++n}@example.com`, dni: '30000000' },
		method: 'transferencia',
		limits: BIG
	});
	if (!r.ok) throw new Error(`precarga: ${JSON.stringify(r)}`);
	await t.db.prepare("UPDATE orders SET status = 'approved' WHERE id = ?1").bind(r.order.id).run();
}

const noFetch = /** @type {any} */ (async () => new Response('{}', { status: 503 }));

const SLUGS = [
	'abierto',
	'agotado',
	'agotado-encadenado',
	'cerrado',
	'tipo-cerrado',
	'no-abre',
	'estado-agotadas',
	'sin-entradas'
];

beforeEach(async () => {
	await resetDB(t.db);
	// Datos para transferir inventados (así se ofrece la transferencia).
	await t.db
		.prepare(
			`INSERT INTO ticket_settings (key, value, updated_at, updated_by)
			VALUES ('transfer_alias', 'EJEMPLO.PRUEBA', 1, 'test')`
		)
		.run();
	await preload('abierto', 'general', 3);
	await preload('agotado', 'general', 2);
	await preload('agotado', 'ultima', 1);
	await preload('agotado-encadenado', 'general', 1);
	await preload('agotado-encadenado', 'ultima', 5);
	await preload('tipo-cerrado', 'general', 1);
});

describe('getListTicketStates', () => {
	it('resuelve cada caso', async () => {
		const states = await getListTicketStates(t.db, SLUGS, { cacheMs: 0 });
		expect(states.abierto).toEqual({ open: true, reason: null, opensAt: null });
		expect(states.agotado).toMatchObject({ open: false, reason: 'soldout' });
		expect(states['agotado-encadenado']).toMatchObject({ open: false, reason: 'soldout' });
		expect(states.cerrado).toMatchObject({ open: false, reason: 'closed' });
		// La anticipada cerró por horario y la general se agotó: agotadas.
		expect(states['tipo-cerrado']).toMatchObject({ open: false, reason: 'soldout' });
		expect(states['no-abre']).toMatchObject({ open: false, reason: 'notyet' });
		expect(states['no-abre'].opensAt).toBeGreaterThan(Date.now());
		expect(states['estado-agotadas']).toMatchObject({ open: false, reason: 'soldout' });
		// Sin entradas acá: no está (la tarjeta sigue con su link de siempre).
		expect(states).not.toHaveProperty('sin-entradas');
	});

	it('dice lo mismo que la página del evento', async () => {
		const states = await getListTicketStates(t.db, SLUGS, { cacheMs: 0 });
		for (const slug of SLUGS) {
			const view = await getTicketsView(t.db, slug, noFetch);
			if (!view) {
				expect(states[slug]).toBeUndefined();
				continue;
			}
			const summary = summarizeTickets(view);
			expect({ slug, open: states[slug].open, reason: states[slug].reason }).toEqual({
				slug,
				open: summary.open,
				reason: summary.reason
			});
		}
	});

	it('una sola consulta a orders para toda la lista', async () => {
		/** @type {string[]} */
		const sqls = [];
		const db = /** @type {typeof t.db} */ (
			/** @type {unknown} */ ({
				prepare: (/** @type {string} */ sql) => {
					sqls.push(sql);
					return t.db.prepare(sql);
				},
				batch: (/** @type {any} */ s) => t.db.batch(s)
			})
		);
		const states = await getListTicketStates(db, SLUGS, { cacheMs: 0 });
		expect(Object.keys(states)).toHaveLength(SLUGS.length - 1);
		expect(sqls.filter((sql) => /\bFROM orders\b/.test(sql))).toHaveLength(1);
	});

	it('sin medios de pago configurados: no disponible (como la página del evento)', async () => {
		await t.db.prepare('DELETE FROM ticket_settings').run();
		const states = await getListTicketStates(t.db, ['abierto', 'cerrado'], { cacheMs: 0 });
		expect(states.abierto).toMatchObject({ open: false, reason: 'unavailable' });
		// Lo que se sabe sin la base (horarios) gana.
		expect(states.cerrado).toMatchObject({ open: false, reason: 'closed' });
	});

	it('reusa el resultado por un rato (una compra no se ve hasta que vence)', async () => {
		const now = Date.now();
		const first = await getListTicketStates(t.db, ['abierto', 'agotado'], { now });
		await preload('abierto', 'general', 7);
		const cached = await getListTicketStates(t.db, ['agotado', 'abierto'], { now: now + 1000 });
		expect(cached).toEqual(first);
		const fresh = await getListTicketStates(t.db, ['abierto', 'agotado'], {
			now: now + 60 * 1000
		});
		expect(fresh.abierto).toMatchObject({ open: false, reason: 'soldout' });
	});
});

describe('ticketStatesFor (loads de las listas)', () => {
	const post = (/** @type {string} */ slug, /** @type {Record<string, any>} */ meta = {}) => ({
		meta: {
			postID: slug,
			category: 'calendario',
			start: '2099-12-01T20:00-03:00',
			tickets: [{ id: 'general' }],
			...meta
		}
	});

	it('solo los eventos que vienen y venden entradas', async () => {
		const states = await ticketStatesFor(t.platform, [
			post('cerrado'),
			post('abierto', { start: '2001-01-01T20:00-03:00' }),
			post('sin-entradas', { tickets: undefined }),
			{ meta: { postID: 'algo', category: 'material', tags: [] } }
		]);
		expect(Object.keys(states ?? {})).toEqual(['cerrado']);
	});

	it('sin base (prerenderizado): null, la tarjeta muestra el link a /entradas', async () => {
		expect(await ticketStatesFor(undefined, [post('abierto')])).toBeNull();
	});

	it('sin eventos con entradas: mapa vacío y ninguna consulta', async () => {
		expect(await ticketStatesFor(t.platform, [post('x', { tickets: [] })])).toEqual({});
	});
});
