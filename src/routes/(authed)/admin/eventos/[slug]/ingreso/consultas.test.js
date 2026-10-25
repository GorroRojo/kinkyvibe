/**
 * Cuántas consultas a D1 hace el escaneo de la puerta (acción `checkin` del modo puerta), y en
 * cuántas «olas» (vueltas seguidas a la base: lo
 * que va junto, con `Promise.all` o en una tanda, cuenta como una). D1 está lejos (este de EE.
 * UU.): cada ola es una ida y vuelta. `readWorkshop` es una sola tanda, la venta del evento se lee
 * junto con las partes del taller y, después de marcar el ingreso, la entrada con quien compró,
 * la primera vez en la serie y los contadores van juntos (antes, todo uno detrás del otro). La
 * página de la entrada se mide en src/routes/entradas/t/[token]/consultas.test.js. Eventos y
 * personas inventados; D1 de miniflare.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { countingDB, createTestDB, resetDB } from '$lib/server/db/testing.js';
import { seedPosts } from '$lib/server/contenido/testing.js';
import { setWorkshopParts } from '$lib/server/eventos/partes.js';
import { applyPayment, reserveOrder } from '$lib/server/tickets/orders.js';
import { ADMINS } from '$lib/server/auth.js';

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
const admin = { user: { id: ADMINS[0].id, login: ADMINS[0].login }, user_token: 'prueba' };

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

/**
 * @param {string} slug el evento del modo puerta
 * @param {string} token
 */
const scan = (slug, token) =>
	measure((mod, platform) => {
		const body = new FormData();
		body.set('token', `https://kinkyvibe.ar/entradas/t/${token}`);
		return mod.actions.checkin({
			params: { slug },
			platform,
			locals: admin,
			request: new Request('http://localhost/x', { method: 'POST', body }),
			url: new URL(`http://localhost/admin/eventos/${slug}/ingreso`),
			fetch: async () => new Response('{}', { status: 503 }),
			cookies: { get: () => undefined, set: () => {}, delete: () => {} },
			getClientAddress: () => '203.0.113.9',
			setHeaders: () => {}
		});
	});

describe('modo puerta, escaneo: consultas a D1', () => {
	it('entrada de un evento suelto', async () => {
		await seed();
		const m = await scan('suelto', (await ticketFor('suelto')).token);
		const r = /** @type {any} */ (m.result);
		expect(r.checkin.result).toBe('ok');
		expect(r.checkin.card?.holder).toBe('Persona de Prueba');
		expect(r.counts.inside).toBe(1);
		expect(m.queries).toBeLessThanOrEqual(BOUNDS.suelto.queries);
		expect(m.waves).toBeLessThanOrEqual(BOUNDS.suelto.waves);
	});

	it('la entrada del taller en la puerta de la parte 2', async () => {
		await seed();
		const m = await scan('taller-parte-2', (await ticketFor('taller')).token);
		const r = /** @type {any} */ (m.result);
		expect(r.checkin.result).toBe('ok');
		expect(r.checkin.card?.holder).toBe('Persona de Prueba');
		expect(r.counts.inside).toBe(1);
		expect(m.queries).toBeLessThanOrEqual(BOUNDS.parte.queries);
		expect(m.waves).toBeLessThanOrEqual(BOUNDS.parte.waves);
	});
});

/**
 * Medido: evento suelto 8 consultas en 4 olas (antes 10 en 10); parte 2 de un taller 13 en 5
 * (antes 13 en 13: la venta de la parte se lee por las dudas y no se usa, a cambio de no esperar a
 * las partes). Se admite una ola más: lo de la primera vez en la serie puede salir en la misma ola
 * que los contadores o no, según qué vuelve antes.
 */
const BOUNDS = {
	suelto: { queries: 8, waves: 5 },
	parte: { queries: 13, waves: 6 }
};
