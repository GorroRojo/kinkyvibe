/**
 * Cuántas consultas a D1 hace la página de estado de una compra, y en cuántas «olas» (vueltas
 * seguidas a la base: lo que se lanza junto, con `Promise.all`, cuenta como una). D1 está lejos
 * (este de EE. UU.), así que cada ola es una ida y vuelta. Después de leer la orden, lo demás (la
 * venta del evento, la cookie, las entradas, las partes, los datos para transferir) va junto.
 * Antes: una consulta detrás de la otra. Datos inventados; D1 de miniflare.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { countingDB, createTestDB, resetDB } from '$lib/server/db/testing.js';
import { saveObject } from '$lib/server/objects/save.js';
import { setWorkshopParts } from '$lib/server/eventos/partes.js';
import { applyPayment, reserveOrder } from '$lib/server/tickets/orders.js';
import { signedOrderEntry } from '$lib/server/tickets/checkout.js';

vi.setConfig({ testTimeout: 90_000, hookTimeout: 90_000 });

/** @type {Awaited<ReturnType<typeof createTestDB>>} */
let t;
beforeAll(async () => {
	t = await createTestDB();
	(await import('$lib/server/contenido/repo.js')).setContentDB(t.db);
});
afterAll(async () => {
	await t?.dispose();
});
beforeEach(async () => {
	await resetDB(t.db);
});

const BY = 'admin-de-prueba';

/**
 * Cuenta las olas: una consulta que arranca cuando no hay ninguna en vuelo empieza una ola nueva;
 * las que arrancan mientras otra sigue en vuelo van en la misma.
 *
 * @param {import('@cloudflare/workers-types').D1Database} db
 */
function wavesDB(db) {
	let inFlight = 0;
	let waves = 0;
	/** @param {() => Promise<unknown>} run */
	const track = async (run) => {
		if (inFlight === 0) waves++;
		inFlight++;
		try {
			return await run();
		} finally {
			inFlight--;
		}
	};
	/** @param {any} statement @returns {any} */
	const wrap = (statement) =>
		new Proxy(statement, {
			get(target, prop) {
				if (prop === 'bind') return (/** @type {unknown[]} */ ...a) => wrap(target.bind(...a));
				if (prop === 'first' || prop === 'all' || prop === 'run' || prop === 'raw') {
					return (/** @type {unknown[]} */ ...a) => track(() => target[prop](...a));
				}
				const value = target[prop];
				return typeof value === 'function' ? value.bind(target) : value;
			}
		});
	const tracked = /** @type {import('@cloudflare/workers-types').D1Database} */ (
		new Proxy(db, {
			get(target, prop) {
				if (prop === 'prepare') return (/** @type {string} */ sql) => wrap(target.prepare(sql));
				if (prop === 'batch') {
					return (/** @type {any[]} */ statements) => track(() => target.batch(statements));
				}
				const value = /** @type {any} */ (target)[prop];
				return typeof value === 'function' ? value.bind(target) : value;
			}
		})
	);
	return {
		db: tracked,
		get waves() {
			return waves;
		}
	};
}

/** @param {string} slug @param {string} start */
const event = (slug, start) =>
	saveObject(
		t.db,
		{
			type: 'evento',
			slug,
			title: `Evento ${slug}`,
			data: { start, location_name: 'Espacio Inventado' },
			visibility: 'public'
		},
		{ actor: BY }
	);

/**
 * @param {string} eventSlug
 * @param {'mercadopago' | 'transferencia'} method
 */
async function orderFor(eventSlug, method) {
	const r = /** @type {any} */ (
		await reserveOrder(t.db, {
			eventSlug,
			type: { id: 'general', price: 10000, capacity: 10 },
			quantity: 1,
			method,
			holders: [{ name: 'Persona de Prueba', pronouns: 'elle' }],
			buyer: {
				name: 'Persona de Prueba',
				pronouns: 'elle',
				email: 'p@example.com',
				dni: '30111222'
			}
		})
	);
	if (method === 'mercadopago') {
		await applyPayment(t.db, {
			id: 1,
			status: 'approved',
			external_reference: r.order.id,
			transaction_amount: 10000,
			currency_id: 'ARS'
		});
	}
	return /** @type {string} */ (r.order.id);
}

/**
 * La carga de la página con módulos nuevos (sin nada en memoria de otra carga), contando.
 * @param {string} id
 */
async function measure(id) {
	const cookie = await signedOrderEntry(t.db, id);
	vi.resetModules();
	const counted = countingDB(t.db);
	const waves = wavesDB(counted.db);
	(await import('$lib/server/contenido/repo.js')).setContentDB(waves.db);
	const { load } = await import('./+page.server.js');
	/** @type {string[]} */
	const deps = [];
	const data = /** @type {any} */ (
		await load(
			/** @type {any} */ ({
				params: { order: id },
				platform: { ...t.platform, env: { ...t.platform.env, DB: waves.db } },
				locals: {},
				url: new URL(`http://localhost/entradas/${id}/estado`),
				fetch: () => {
					throw new Error('no debería llamar afuera');
				},
				cookies: { get: () => cookie },
				depends: (/** @type {string} */ d) => deps.push(d)
			})
		)
	);
	(await import('$lib/server/contenido/repo.js')).setContentDB(t.db);
	return { data, deps, queries: counted.queries, waves: waves.waves };
}

describe('/entradas/<orden>/estado: consultas a D1', () => {
	it('compra aprobada de un taller en partes: todo junto después de la orden', async () => {
		await event('taller-inventado', '2026-10-02T22:00-03:00');
		await event('taller-inventado-parte-2', '2026-10-09T22:00-03:00');
		expect(
			await setWorkshopParts(t.db, {
				eventSlug: 'taller-inventado',
				partSlugs: ['taller-inventado-parte-2'],
				by: BY
			})
		).toEqual({ ok: true });
		const m = await measure(await orderFor('taller-inventado', 'mercadopago'));
		expect(m.data.order.status).toBe('approved');
		expect(m.data.tickets).toHaveLength(1);
		expect(m.data.event.parts?.lines).toHaveLength(2);
		expect(m.deps).toContain('kv:orden');
		expect(m.queries).toBeLessThanOrEqual(BOUNDS.approved.queries);
		expect(m.waves).toBeLessThanOrEqual(BOUNDS.approved.waves);
	});

	it('esperando la transferencia: los datos para transferir van junto con lo demás', async () => {
		await event('evento-suelto', '2026-10-02T22:00-03:00');
		const m = await measure(await orderFor('evento-suelto', 'transferencia'));
		expect(m.data.order.status).toBe('awaiting_transfer');
		expect(m.data.transfer).not.toBeNull();
		expect(m.data.event.parts).toBeNull();
		expect(m.deps).toContain('kv:orden');
		expect(m.queries).toBeLessThanOrEqual(BOUNDS.transfer.queries);
		expect(m.waves).toBeLessThanOrEqual(BOUNDS.transfer.waves);
	});
});

/**
 * Medido: aprobada 11 consultas en 8 olas (antes 11 en 11); transferencia 8 en 5 (antes 8 en 8).
 * Las olas que quedan son la orden, después todo junto, y lo que va en fila adentro de las partes
 * del taller (`readWorkshop` y el lugar de cada parte). La aprobada admite 9: las entradas esperan
 * a la cookie y, según cuál vuelve antes, pueden salir en la misma ola que las partes o no.
 */
const BOUNDS = {
	approved: { queries: 11, waves: 9 },
	transfer: { queries: 8, waves: 5 }
};
