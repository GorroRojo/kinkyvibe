/**
 * La página de compra de entradas hace sus consultas a la base en pocas tandas en fila: la base
 * está lejos (en el este de EE. UU.) y cada consulta que espera a la anterior es una ida y vuelta
 * más. El evento, las partes del taller y el interruptor de la lista de espera salen a la par; la
 * venta, el lugar y los datos guardados de la cuenta, también. Lo que la página devuelve y sus
 * encabezados no cambian. D1 de miniflare; datos inventados.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { countingDB, createTestDB } from '$lib/server/db/testing.js';
import { seedPosts } from '$lib/server/contenido/testing.js';
import { makeProfile } from '$lib/server/amigues/testing.js';

// La primera prueba compila la ruta: tarda.
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
const BY = 'admin-de-prueba';
const EMAIL = 'persona.inventada@example.com';

/** @type {Awaited<ReturnType<typeof createTestDB>>} */
let t;
/** @type {{ id: string, email: string }} */
let member;

/** @param {string} postID @param {Record<string, unknown>} [extra] */
const eventMeta = (postID, extra = {}) => ({
	category: 'calendario',
	postID,
	title: `Evento ${postID}`,
	summary: 'Un evento de prueba',
	published_date: '2026-09-01Z-03:00',
	start: '2099-03-06T20:00-03:00',
	status: 'abierto',
	modalidad: 'presencial',
	location: 'Calle Inventada 123',
	tags: [],
	authors: [],
	...extra
});
const sale = {
	tags: ['KinkyVibe'],
	payment_methods: ['transferencia'],
	lista_espera: 'evento',
	tickets: [{ id: 'general', name: 'General', price: 10000, capacity: 50 }]
};

beforeAll(async () => {
	t = await createTestDB();
	const venue = await makeProfile(t.db, {
		title: 'Galpón Inventado',
		kind: 'lugar',
		data: { address: 'Calle Del Lugar 222', city: 'Ciudad Inventada', venue_privacy: 'public' }
	});
	await seedPosts(t.db, [
		eventMeta('venta-inventada', sale),
		// La venta abre recién en 2098: cerrada por ahora.
		eventMeta('venta-cerrada-inventada', {
			...sale,
			lista_espera: undefined,
			tickets_open: '2098-01-01T00:00-03:00'
		}),
		eventMeta('taller-inventado', sale),
		eventMeta('taller-inventado-parte-2', { start: '2099-03-13T20:00-03:00' }),
		eventMeta('taller-oculto-inventado', { ...sale, title: 'Taller Secreto' }),
		eventMeta('taller-oculto-inventado-parte-2', { start: '2099-03-13T20:00-03:00' })
	]);
	const { setWorkshopParts } = await import('$lib/server/eventos/partes.js');
	for (const slug of ['taller-inventado', 'taller-oculto-inventado']) {
		expect(
			await setWorkshopParts(t.db, { eventSlug: slug, partSlugs: [`${slug}-parte-2`], by: BY })
		).toEqual({ ok: true });
	}
	// Un taller oculto que oculta también sus partes.
	await t.db
		.prepare(
			`UPDATE objects SET visibility = 'hidden', version = version + 1,
				data = json_set(data, '$.extra.ocultar_partes', 1)
			WHERE type = 'evento' AND slug = ?1`
		)
		.bind('taller-oculto-inventado')
		.run();
	const venues = await import('$lib/server/amigues/venues.js');
	await venues.setEventVenue(t.db, {
		eventSlug: 'venta-inventada',
		venueId: venue.id,
		privacy: null,
		by: BY
	});
	const { saveSalesSettings } = await import('$lib/server/tickets/settings.js');
	await saveSalesSettings(t.db, { transfer_alias: 'alias.inventado' }, { by: BY });
	const { setFlag } = await import('$lib/server/flags.js');
	await setFlag(t.db, 'lista_espera', true, { by: BY });
	const { upsertVerifiedAccount } = await import('$lib/server/cuentas/accounts.js');
	const account = await upsertVerifiedAccount(t.db, EMAIL);
	member = { id: account.id, email: account.email };
	const { setSavedBuyer } = await import('$lib/server/cuentas/savedBuyer.js');
	await setSavedBuyer(t.db, member.id, { name: 'Persona Inventada', pronouns: 'elle' });
});
afterAll(async () => {
	fake.event = null;
	await t?.dispose();
});

/** fetch de fondo.kinkyvibe.ar (20 %), sin red. */
const fondoFetch = async () =>
	new Response(JSON.stringify({ percent: 20 }), {
		headers: { 'content-type': 'application/json' }
	});

/**
 * La página de compra de `slug` cargada en frío, con una base que cuenta las consultas y las
 * tandas en fila. Devuelve también los encabezados que puso.
 * @param {string} slug
 * @param {{ member?: { id: string, email: string } }} [opts]
 */
async function purchasePage(slug, { member } = {}) {
	vi.resetModules();
	const counted = countingDB(t.db, { delayMs: DELAY_MS });
	(await import('$lib/server/contenido/repo.js')).setContentDB(counted.db);
	const platform = { env: { ...t.env, DB: counted.db } };
	const url = new URL(`/calendario/${slug}/entradas`, 'https://kinkyvibe.ar');
	fake.event = { request: new Request(url), url, cookies: { get: () => undefined } };
	// Como cada pedido: hooks.server.js lee el árbol de etiquetas al empezar.
	await (await import('$lib/server/etiquetas/source.js')).siteTagSource(platform);
	const { load } = await import('./+page.server.js');
	/** @type {Record<string, string>} */
	const headers = {};
	const event = /** @type {any} */ ({
		url,
		params: { event: slug },
		platform,
		fetch: fondoFetch,
		locals: { user: undefined, user_token: '', member },
		setHeaders: (/** @type {Record<string, string>} */ h) => Object.assign(headers, h)
	});
	counted.reset();
	try {
		const page = /** @type {any} */ (await load(event));
		// Con `KV_CONSULTAS=1`, las cuentas, para comparar a mano.
		if (process.env.KV_CONSULTAS)
			console.info(`[${slug}] ${counted.queries} consultas en ${counted.waves} tandas`);
		return { page, headers, queries: counted.queries, waves: counted.waves };
	} finally {
		fake.event = null;
	}
}

describe('la página de compra, en pocas tandas', () => {
	it('con venta abierta, lugar y lista de espera', async () => {
		const r = await purchasePage('venta-inventada');
		expect(r.page.tickets).toMatchObject({ open: true, methods: ['transferencia'] });
		expect(r.page.venue).not.toBeNull();
		expect(r.page.account).toBeNull();
		expect(r.headers).toEqual({});
		// Antes: 22 consultas en 18 tandas; ahora, las mismas en 8 (en frío: la última es el guardado
		// del porcentaje del Fondo, que pasa una vez por isolate).
		expect(r.queries).toBeLessThanOrEqual(22);
		expect(r.waves).toBeLessThanOrEqual(8);
	});

	it('con cuenta y la venta abierta: los datos guardados y la página privada', async () => {
		const r = await purchasePage('venta-inventada', { member });
		expect(r.page.account).toEqual({
			name: 'Persona Inventada',
			pronouns: 'elle',
			email: EMAIL,
			dni: '',
			remember: true,
			rememberDni: false
		});
		expect(r.headers).toEqual({ 'cache-control': 'private, no-store' });
		// Los datos de la cuenta salen a la par de la venta: ninguna tanda más (antes, 19).
		expect(r.waves).toBeLessThanOrEqual(8);
	});

	it('con cuenta y la venta cerrada: sin datos de la cuenta ni encabezado privado', async () => {
		const r = await purchasePage('venta-cerrada-inventada', { member });
		expect(r.page.tickets).toMatchObject({ open: false, reason: 'notyet' });
		expect(r.page.account).toBeNull();
		expect(r.page.waitlist).toBeNull();
		expect(r.headers).toEqual({});
		expect(JSON.stringify(r.page)).not.toContain('Persona Inventada');
	});

	it('una parte de un taller con una sola entrada lleva a la compra del taller', async () => {
		await expect(purchasePage('taller-inventado-parte-2')).rejects.toMatchObject({
			status: 307,
			location: '/calendario/taller-inventado/entradas'
		});
	});

	it('la parte de un taller que oculta sus partes da 404, sin llevar al taller', async () => {
		await expect(purchasePage('taller-oculto-inventado-parte-2')).rejects.toMatchObject({
			status: 404
		});
		await expect(purchasePage('taller-oculto-inventado')).rejects.toMatchObject({ status: 404 });
	});

	it('un evento que no existe sigue dando 404', async () => {
		await expect(purchasePage('no-existe-inventado')).rejects.toMatchObject({ status: 404 });
	});
});
