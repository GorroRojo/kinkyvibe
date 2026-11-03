/**
 * El conector muestra lo mismo que el panel le muestra a le admin (gorrite, 3/11): una orden como
 * la pestaña Ventas › Órdenes (de `eventOrderRows`, lo mismo que carga esa página) y un objeto con
 * todos sus datos, como el editor. Datos inventados.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import { eventOrderRows } from '$lib/server/admin/eventOrders.js';
import { insertOrder, insertTicket } from '$lib/server/admin/testRows.js';
import { saveObject } from '$lib/server/objects/save.js';
import { TOOLS, orderForClaude } from './tools.js';

const SLUG = 'fiesta-inventada';
const CONFIG = /** @type {any} */ ({
	title: 'Fiesta Inventada',
	start: '2031-01-10T21:00:00-03:00',
	types: [{ id: 'general', name: 'General', price: 10000, capacity: 50, gorra: null }]
});

vi.mock('$lib/server/tickets/events.js', () => ({
	getEventTickets: vi.fn(async (/** @type {string} */ slug) =>
		slug === 'fiesta-inventada' ? CONFIG : null
	),
	isTestEventSlug: () => false,
	listTicketedEvents: async () => []
}));
vi.mock('$lib/server/eventos/index.js', () => ({
	listEvents: async () => [
		{ slug: 'fiesta-inventada', title: 'Fiesta Inventada', start: '2031-01-10T21:00:00-03:00' }
	]
}));
vi.mock('$lib/server/tickets/fondo.js', () => ({
	resolveFondoPercent: async () => ({ percent: 20 })
}));

/** @type {Awaited<ReturnType<typeof createTestDB>>} */
let t;
beforeAll(async () => {
	t = await createTestDB();
});
afterAll(async () => {
	await t?.dispose();
});
beforeEach(async () => {
	await resetDB(t.db);
});

const NOW = Date.parse('2030-12-01T12:00:00Z');
const ctx = () => ({
	db: t.db,
	user: { id: 1, login: 'admin-de-prueba' },
	fetch: /** @type {typeof fetch} */ (async () => new Response('{}')),
	now: NOW
});

/** Una orden con todo lo que muestra el panel: DNI, pago de MP, nota, entradas y respuestas. */
async function seedOrder() {
	const id = await insertOrder(t.db, {
		slug: SLUG,
		quantity: 2,
		name: 'Persona Inventada',
		pronouns: 'elle',
		email: 'persona@example.com',
		dni: '11.222.333',
		created: NOW - 60_000,
		expires: NOW + 60_000
	});
	await t.db
		.prepare(
			'UPDATE orders SET mp_payment_id = ?1, admin_note = ?2, confirmed_by = ?3 WHERE id = ?4'
		)
		.bind('1234567890', 'Nota inventada del panel', 'admin-de-prueba', id)
		.run();
	await insertTicket(t.db, { orderId: id, slug: SLUG, name: 'Persona Inventada' });
	await insertTicket(t.db, {
		orderId: id,
		slug: SLUG,
		name: 'Otra Persona Inventada',
		checkedInAt: NOW
	});
	await t.db
		.prepare('INSERT INTO order_answers (order_id, answers, created_at) VALUES (?1, ?2, ?3)')
		.bind(
			id,
			JSON.stringify([{ id: 1, label: '¿Alguna restricción alimentaria?', value: 'Ninguna' }]),
			NOW
		)
		.run();
	return id;
}

describe('ventas: lo mismo que la pestaña Órdenes del panel', () => {
	it('devuelve los datos de la orden que muestra el panel', async () => {
		await seedOrder();
		const out = await TOOLS.ventas.run(ctx(), { evento: SLUG });
		const ordenes = /** @type {any[]} */ (out.result.ordenes);
		expect(ordenes).toHaveLength(1);
		expect(JSON.parse(JSON.stringify(ordenes[0]))).toMatchObject({
			nombre: 'Persona Inventada',
			pronombres: 'elle',
			email: 'persona@example.com',
			dni_ultimos_3: '333',
			tipo: 'General',
			cantidad: 2,
			estado: 'aprobada',
			pago_mp: '1234567890',
			confirmada_por: 'admin-de-prueba',
			nota: 'Nota inventada del panel',
			mail: 'enviado',
			entradas: [
				{ a_nombre_de: 'Persona Inventada', ingreso: false },
				{ a_nombre_de: 'Otra Persona Inventada', ingreso: true }
			],
			respuestas: [{ pregunta: '¿Alguna restricción alimentaria?', respuesta: 'Ninguna' }]
		});
	});

	it('del DNI, solo los últimos 3 dígitos, como la lista del panel', async () => {
		await seedOrder();
		const out = await TOOLS.ventas.run(ctx(), { evento: SLUG });
		const text = JSON.stringify(out.result);
		expect(text).toContain('"dni_ultimos_3":"333"');
		expect(text).not.toContain('11.222.333');
		expect(text).not.toContain('11222333');
	});

	it('cada campo sale de la misma fila que carga la página del panel', async () => {
		await seedOrder();
		const { rows } = await eventOrderRows(t.db, SLUG, CONFIG, NOW);
		const [row] = rows;
		const o = orderForClaude(row);
		expect(o).toMatchObject({
			referencia: row.reference,
			dni_ultimos_3: row.dniTail,
			total: row.total,
			pago_mp: row.paymentId,
			nota: row.note,
			ingresaron: row.checkedIn
		});
		expect(o.entradas?.map((h) => h.a_nombre_de)).toEqual(row.holders.map((h) => h.name));
		expect(o.respuestas?.map((a) => a.respuesta)).toEqual(row.answers.map((a) => a.value));
	});

	it('Actividad anota la herramienta y el evento, sin datos de quien compra', async () => {
		await seedOrder();
		const out = await TOOLS.ventas.run(ctx(), { evento: SLUG });
		const log = JSON.stringify(out.log);
		expect(out.log).toMatchObject({ targetType: 'event', targetId: SLUG });
		for (const s of ['Persona Inventada', 'persona@example.com', '333', '1234567890', 'Nota'])
			expect(log).not.toContain(s);
	});
});

describe('leer: todos los datos del objeto, como el editor', () => {
	it('devuelve los datos completos, sin recortar ni sacar campos', async () => {
		const body = 'Texto largo inventado. '.repeat(40);
		const extra = { a: { b: { c: { d: { e: 'dato profundo' } } } } };
		await saveObject(
			t.db,
			{
				type: 'evento',
				slug: 'evento-inventado',
				title: 'Evento Inventado',
				data: { start: '2031-01-10T21:00:00-03:00', body, extra },
				visibility: 'public'
			},
			{ actor: 'admin-de-prueba' }
		);
		const out = await TOOLS.leer.run(ctx(), { nombre: 'evento-inventado', tipo: 'evento' });
		expect(out.result.datos).toMatchObject({ body, extra });
		expect(JSON.stringify(out.log)).not.toContain('Texto largo');
	});
});
