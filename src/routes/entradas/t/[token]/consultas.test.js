/**
 * Cuántas consultas a D1 hace la página de una entrada (/entradas/t/<token>), y en cuántas «olas» (vueltas seguidas a la base: lo
 * que va junto, con `Promise.all` o en una tanda, cuenta como una). D1 está lejos (este de EE.
 * UU.): cada ola es una ida y vuelta. `readWorkshop` es una sola tanda, y la venta del evento, el
 * lugar y las partes del taller se leen juntos (antes, uno detrás del otro). El escaneo de la
 * puerta se mide en src/routes/(authed)/admin/eventos/[slug]/ingreso/consultas.test.js. Eventos y
 * personas inventados; D1 de miniflare.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { countingDB, createTestDB, resetDB } from '$lib/server/db/testing.js';
import { seedPosts } from '$lib/server/contenido/testing.js';
import { setWorkshopParts } from '$lib/server/eventos/partes.js';
import { applyPayment, reserveOrder } from '$lib/server/tickets/orders.js';

vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 });

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

const BY = 'admin-de-prueba';

/**
 * Cuenta las olas (vueltas seguidas a la base): una consulta que arranca cuando no hay ninguna en
 * vuelo empieza una ola nueva; las que arrancan mientras otra sigue en vuelo van en la misma.
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

const common = {
	category: 'calendario',
	summary: 'Un evento de prueba',
	published_date: '2026-09-01Z-03:00',
	status: 'abierto',
	location_name: 'Espacio Inventado',
	tags: [],
	authors: [],
	payment_methods: ['transferencia'],
	tickets: [{ id: 'general', name: 'General', price: 10000, capacity: 10 }]
};

async function seed() {
	await seedPosts(t.db, [
		{ ...common, postID: 'suelto', title: 'Suelto', start: '2099-01-02T20:00-03:00' },
		{ ...common, postID: 'taller', title: 'Taller', start: '2099-01-03T20:00-03:00' },
		{
			...common,
			postID: 'taller-parte-2',
			title: 'Taller parte 2',
			start: '2099-01-10T20:00-03:00'
		}
	]);
	expect(
		await setWorkshopParts(t.db, { eventSlug: 'taller', partSlugs: ['taller-parte-2'], by: BY })
	).toEqual({ ok: true });
}

/** @param {string} eventSlug */
async function ticketFor(eventSlug) {
	const r = /** @type {any} */ (
		await reserveOrder(t.db, {
			eventSlug,
			type: { id: 'general', price: 10000, capacity: 10 },
			quantity: 1,
			holders: [{ name: 'Persona de Prueba', pronouns: 'elle' }],
			buyer: {
				name: 'Persona de Prueba',
				pronouns: 'elle',
				email: 'p@example.com',
				dni: '30111222'
			}
		})
	);
	const { tickets } = await applyPayment(t.db, {
		id: 1,
		status: 'approved',
		external_reference: r.order.id,
		transaction_amount: 10000,
		currency_id: 'ARS'
	});
	return /** @type {{ token: string }} */ (tickets[0]);
}

/**
 * Corre `run` con módulos nuevos (sin nada en memoria de otra carga) contra la base contada.
 * @template T
 * @param {(mod: any, platform: any) => Promise<T>} run
 */
async function measure(run) {
	vi.resetModules();
	const counted = countingDB(t.db);
	const waves = wavesDB(counted.db);
	const repo = await import('$lib/server/contenido/repo.js');
	repo.setContentDB(waves.db);
	try {
		const mod = await import('./+page.server.js');
		const platform = { ...t.platform, env: { ...t.platform.env, DB: waves.db } };
		const result = await run(mod, platform);
		return { result, queries: counted.queries, waves: waves.waves };
	} finally {
		repo.setContentDB(null);
	}
}

/** @param {string} token */
const page = (token) =>
	measure((mod, platform) =>
		mod.load({
			params: { token },
			platform,
			locals: {},
			url: new URL(`http://localhost/entradas/t/${token}`)
		})
	);

describe('/entradas/t/<token>: consultas a D1', () => {
	it('evento suelto', async () => {
		await seed();
		const m = await page((await ticketFor('suelto')).token);
		const data = /** @type {any} */ (m.result);
		expect(data.ticket.state).toBe('valid');
		expect(data.event.parts).toBeNull();
		expect(m.queries).toBeLessThanOrEqual(BOUNDS.suelto.queries);
		expect(m.waves).toBeLessThanOrEqual(BOUNDS.suelto.waves);
	});

	it('taller en dos partes con una sola entrada', async () => {
		await seed();
		const m = await page((await ticketFor('taller')).token);
		const data = /** @type {any} */ (m.result);
		expect(data.event.parts?.lines).toHaveLength(2);
		expect(m.queries).toBeLessThanOrEqual(BOUNDS.taller.queries);
		expect(m.waves).toBeLessThanOrEqual(BOUNDS.taller.waves);
	});
});

/**
 * Medido: evento suelto 5 consultas en 3 olas (antes 7 en 7); taller en dos partes 9 en 4 (antes
 * 11 en 11). El taller admite una ola más: el lugar de cada parte puede ir en una o dos según qué
 * vuelve antes.
 */
const BOUNDS = {
	suelto: { queries: 5, waves: 3 },
	taller: { queries: 9, waves: 5 }
};
