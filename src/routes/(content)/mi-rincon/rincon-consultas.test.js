/**
 * Con sesión de cuenta, la fila de `accounts` se lee una vez: la sesión trae la velocidad de
 * lectura y el permiso de perfiles (`getSessionAccount`), así el layout no la vuelve a leer, y Mi
 * rincón lee lo suyo a la par. La base está lejos (en el este de EE. UU.): cada consulta que
 * espera a otra es una ida y vuelta más. `locals.member` nunca lleva `preferences` (ahí está el
 * DNI guardado). D1 de miniflare; datos inventados.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { countingDB, createTestDB } from '$lib/server/db/testing.js';
import { seedPosts } from '$lib/server/contenido/testing.js';
import { insertOrder } from '$lib/server/admin/testRows.js';

// La primera prueba compila las rutas: tarda.
vi.setConfig({ testTimeout: 180_000, hookTimeout: 120_000 });

// Como en un pedido de verdad (GET): lo que se lee una vez por pedido se comparte.
const fake = vi.hoisted(() => ({ event: /** @type {any} */ (null) }));
vi.mock('$app/server', () => ({
	getRequestEvent: () => {
		if (!fake.event) throw new Error('fuera de un pedido');
		return fake.event;
	}
}));

/** Cada consulta tarda esto de más, para contar bien lo que sale a la par. */
const DELAY_MS = 15;
const EMAIL = 'persona.inventada@example.com';
const DNI = '30111222';

/** @type {Awaited<ReturnType<typeof createTestDB>>} */
let t;
/** @type {string} */
let token;
/** @type {string} */
let orderId;

beforeAll(async () => {
	t = await createTestDB();
	await seedPosts(t.db, [
		{
			category: 'calendario',
			postID: 'evento-comprado-inventado',
			title: 'Evento Comprado Inventado',
			summary: 'Un evento de prueba',
			published_date: '2026-09-01Z-03:00',
			start: '2099-03-06T20:00-03:00',
			status: 'abierto',
			modalidad: 'online',
			tags: [],
			authors: []
		}
	]);
	const accounts = await import('$lib/server/cuentas/accounts.js');
	const account = await accounts.upsertVerifiedAccount(t.db, EMAIL, { now: 1_000 });
	await accounts.setReadingSpeed(t.db, account.id, 300);
	await t.db
		.prepare('UPDATE accounts SET can_have_profiles = 1 WHERE id = ?1')
		.bind(account.id)
		.run();
	const { setSavedBuyer } = await import('$lib/server/cuentas/savedBuyer.js');
	await setSavedBuyer(t.db, account.id, {
		name: 'Persona Inventada',
		pronouns: 'elle',
		dni: DNI
	});
	orderId = await insertOrder(t.db, {
		slug: 'evento-comprado-inventado',
		email: EMAIL,
		created: 5_000
	});
	const { createSession } = await import('$lib/server/cuentas/session.js');
	token = await createSession(t.db, account.id, 'code');
});
afterAll(async () => {
	fake.event = null;
	await t?.dispose();
});

/**
 * Un GET a /mi-rincon en frío como lo corre SvelteKit: el hook carga `locals.member` desde la
 * cookie y después el layout raíz y la página corren a la par. Con una base que cuenta las
 * consultas y las tandas en fila.
 */
async function rinconRequest() {
	vi.resetModules();
	const counted = countingDB(t.db, { delayMs: DELAY_MS });
	(await import('$lib/server/contenido/repo.js')).setContentDB(counted.db);
	const platform = { env: { ...t.env, DB: counted.db } };
	const url = new URL('/mi-rincon', 'https://kinkyvibe.ar');
	const { SESSION_COOKIE } = await import('$lib/server/cuentas/session.js');
	/** @type {Record<string, string>} */
	const jar = { [SESSION_COOKIE]: token };
	const cookies = {
		get: (/** @type {string} */ k) => jar[k],
		set: (/** @type {string} */ k, /** @type {string} */ v) => {
			jar[k] = v;
		},
		delete: (/** @type {string} */ k) => {
			delete jar[k];
		}
	};
	fake.event = { request: new Request(url), url, cookies };
	// Como cada pedido: hooks.server.js lee el árbol de etiquetas al empezar (no se cuenta).
	await (await import('$lib/server/etiquetas/source.js')).siteTagSource(platform);
	const { loadMember } = await import('$lib/server/cuentas/web.js');
	const root = await import('../../+layout.server.js');
	const rincon = await import('./+page.server.js');
	const event = /** @type {any} */ ({
		url,
		platform,
		params: {},
		cookies,
		request: new Request(url),
		locals: { user: undefined, user_token: '' },
		setHeaders: () => {}
	});
	counted.reset();
	try {
		await loadMember(event);
		const [layout, page] = await Promise.all([root.load(event), rincon.load(event)]);
		const accountReads = counted.log.filter((q) => /\bFROM accounts\b/.test(q.sql)).length;
		if (process.env.KV_CONSULTAS)
			console.info(
				`[mi-rincon] ${counted.queries} consultas en ${counted.waves} tandas; ` +
					`${accountReads} leen accounts`
			);
		return {
			locals: event.locals,
			layout: /** @type {any} */ (layout),
			page: /** @type {any} */ (page),
			queries: counted.queries,
			waves: counted.waves,
			accountReads
		};
	} finally {
		fake.event = null;
	}
}

describe('Mi rincón con sesión, en pocas tandas', () => {
	it('la fila de la cuenta, sin volver a leerla en el layout; lo de la página a la par', async () => {
		const r = await rinconRequest();
		expect(r.layout.member).toBe(true);
		expect(r.layout.readingSpeed).toBe(300);
		// Antes: 10 consultas en 9 tandas, 6 de ellas a `accounts` además de la sesión (con una
		// compra). Ahora: 7 en 4 (la sesión; la página a la par; la segunda consulta de las compras;
		// el evento de la compra).
		// 8 con «¿Son tuyas?» («No fui yo», parte 2): el mail verificado una vez, y las dos consultas de compras a la par.
		// 9 con «Dónde tenés la sesión abierta»: una consulta más, a la par de las otras (sin tanda nueva).
		expect(r.queries).toBeLessThanOrEqual(9);
		expect(r.waves).toBeLessThanOrEqual(4);
		expect(r.accountReads).toBeLessThanOrEqual(3);
	});

	it('locals.member: la velocidad y el permiso, sin preferences ni el DNI', async () => {
		const r = await rinconRequest();
		const member = /** @type {any} */ (r.locals.member);
		expect(Object.keys(member).sort()).toEqual(['canHaveProfiles', 'email', 'id', 'readingSpeed']);
		expect(member).toMatchObject({ email: EMAIL, readingSpeed: 300, canHaveProfiles: true });
		const json = JSON.stringify(member);
		expect(json).not.toContain(DNI);
		expect(json).not.toContain('savedBuyer');
		expect(json).not.toContain('preferences');
	});

	it('los datos de la página y del layout no cambian', async () => {
		const r = await rinconRequest();
		expect(r.page).toEqual({
			email: EMAIL,
			hasPassword: false,
			createdAt: 1_000,
			canHaveProfiles: true,
			sigoOn: false,
			ordersError: false,
			saved: {
				name: 'Persona Inventada',
				pronouns: 'elle',
				hasDni: true,
				dniMasked: '•••••222'
			},
			savedError: false,
			readingSpeed: 300,
			orders: [
				{
					id: orderId,
					reference: expect.any(String),
					event: 'Evento Comprado Inventado',
					eventStart: '2099-03-06T20:00-03:00',
					quantity: 1,
					total: 10000,
					status: 'approved',
					createdAt: 5_000
				}
			],
			unconfirmed: [],
			// «Dónde tenés la sesión abierta»: la de este pedido, sin token ni hash.
			sessions: [
				{
					id: expect.stringMatching(/^[0-9a-f]{32}$/),
					method: 'code',
					device: null,
					createdAt: expect.any(Number),
					lastSeenAt: expect.any(Number),
					current: true
				}
			],
			now: expect.any(Number)
		});
		expect(r.layout).toMatchObject({ member: true, readingSpeed: 300, user: undefined });
	});

	it('cambiar la velocidad sin JavaScript: el layout del mismo pedido ya ve la nueva', async () => {
		vi.resetModules();
		const url = new URL('/mi-rincon?/velocidad', 'https://kinkyvibe.ar');
		const { SESSION_COOKIE } = await import('$lib/server/cuentas/session.js');
		const cookies = {
			get: (/** @type {string} */ k) => (k === SESSION_COOKIE ? token : undefined)
		};
		const request = new Request(url, {
			method: 'POST',
			body: new URLSearchParams({ velocidad: 'otro', otro: '180' })
		});
		fake.event = { request, url, cookies };
		const event = /** @type {any} */ ({
			url,
			platform: t.platform,
			params: {},
			cookies,
			request,
			locals: { user: undefined, user_token: '' },
			setHeaders: () => {}
		});
		try {
			await (await import('$lib/server/cuentas/web.js')).loadMember(event);
			const rincon = await import('./+page.server.js');
			const root = await import('../../+layout.server.js');
			expect(await rincon.actions.velocidad(event)).toMatchObject({ action: 'velocidad' });
			// Después de la acción, SvelteKit carga el layout y la página en el mismo pedido.
			expect(/** @type {any} */ (await root.load(event)).readingSpeed).toBe(180);
			expect(/** @type {any} */ (await rincon.load(event)).readingSpeed).toBe(180);
		} finally {
			fake.event = null;
			const accounts = await import('$lib/server/cuentas/accounts.js');
			await accounts.setReadingSpeed(t.db, event.locals.member.id, 300);
		}
	});
});
