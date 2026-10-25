/**
 * La página de un evento hace sus consultas a la base en pocas tandas en fila: la base está lejos
 * (en el este de EE. UU.) y cada consulta que espera a la anterior es una ida y vuelta más. Lo que
 * no depende del evento ya leído (la venta, las partes del taller, el lugar, el interruptor de la
 * lista de espera) sale a la par de la lectura del evento. D1 de miniflare; datos inventados.
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
/** Con `KV_CONSULTAS=detalle`, cada consulta por tanda y quién la pidió. */
const DETAIL = process.env.KV_CONSULTAS === 'detalle';

/** @type {Awaited<ReturnType<typeof createTestDB>>} */
let t;

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
	authors: ['autore-inventade', 'otre-inventade'],
	...extra
});

beforeAll(async () => {
	t = await createTestDB();
	await makeProfile(t.db, { title: 'Autore Inventade', slug: 'autore-inventade' });
	await makeProfile(t.db, { title: 'Otre Inventade', slug: 'otre-inventade' });
	const venue = await makeProfile(t.db, {
		title: 'Galpón Inventado',
		kind: 'lugar',
		data: { address: 'Calle Del Lugar 222', city: 'Ciudad Inventada', venue_privacy: 'public' }
	});
	const sale = {
		tags: ['KinkyVibe'],
		payment_methods: ['transferencia'],
		lista_espera: 'evento',
		tickets: [{ id: 'general', name: 'General', price: 10000, capacity: 50 }]
	};
	await seedPosts(t.db, [
		eventMeta('evento-sin-venta-inventado'),
		eventMeta('taller-inventado', sale),
		eventMeta('taller-inventado-parte-2', { start: '2099-03-13T20:00-03:00' }),
		// Dos talleres ocultos con una sola entrada: uno oculta también sus partes.
		...['taller-oculto-inventado', 'taller-oculto-y-partes-inventado'].flatMap((slug) => [
			eventMeta(slug, { ...sale, title: `Taller Secreto ${slug}` }),
			eventMeta(`${slug}-parte-2`, { start: '2099-03-13T20:00-03:00' })
		])
	]);
	const { setWorkshopParts } = await import('$lib/server/eventos/partes.js');
	for (const slug of [
		'taller-inventado',
		'taller-oculto-inventado',
		'taller-oculto-y-partes-inventado'
	]) {
		expect(
			await setWorkshopParts(t.db, { eventSlug: slug, partSlugs: [`${slug}-parte-2`], by: BY })
		).toEqual({ ok: true });
	}
	await t.db
		.prepare(
			`UPDATE objects SET visibility = 'hidden', version = version + 1,
				data = CASE WHEN slug = ?2 THEN json_set(data, '$.extra.ocultar_partes', 1) ELSE data END
			WHERE type = 'evento' AND slug IN (?1, ?2)`
		)
		.bind('taller-oculto-inventado', 'taller-oculto-y-partes-inventado')
		.run();
	const venues = await import('$lib/server/amigues/venues.js');
	for (const slug of ['taller-inventado', 'taller-inventado-parte-2']) {
		await venues.setEventVenue(t.db, { eventSlug: slug, venueId: venue.id, privacy: null, by: BY });
	}
	const { saveSalesSettings } = await import('$lib/server/tickets/settings.js');
	await saveSalesSettings(t.db, { transfer_alias: 'alias.inventado' }, { by: BY });
	const { setFlag } = await import('$lib/server/flags.js');
	await setFlag(t.db, 'lista_espera', true, { by: BY });
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
 * La página de `slug` cargada en frío (sin nada recordado de otro pedido), con una base que cuenta
 * las consultas (idas: una tanda es una) y las tandas en fila. Con `batch: false`, sin las tandas
 * automáticas (`KV_D1_TANDAS = "off"`, src/lib/server/db/autoBatch.js).
 * @param {string} slug
 */
async function eventPage(slug, { warm = false, batch = true } = {}) {
	vi.resetModules();
	const counted = countingDB(t.db, { delayMs: DELAY_MS, trace: DETAIL });
	const platform = {
		env: { ...t.env, DB: counted.db, ...(batch ? {} : { KV_D1_TANDAS: 'off' }) }
	};
	// Como hooks.server.js: el contenido se lee con la base de `getDB` (con sus tandas).
	(await import('$lib/server/contenido/repo.js')).setContentDB(
		(await import('$lib/server/db')).getDB(platform)
	);
	const url = new URL(`/calendario/${slug}`, 'https://kinkyvibe.ar');
	fake.event = { request: new Request(url), url, cookies: { get: () => undefined } };
	// Como cada pedido: hooks.server.js lee el árbol de etiquetas al empezar.
	await (await import('$lib/server/etiquetas/source.js')).siteTagSource(platform);
	const { load } = await import('./+page.server.js');
	const event = /** @type {any} */ ({
		url,
		params: { event: slug },
		platform,
		fetch: fondoFetch,
		locals: { user: undefined, user_token: '' },
		setHeaders: () => {}
	});
	// En caliente: un pedido antes en el mismo isolate (lo que se recuerda entre pedidos).
	if (warm) {
		await Promise.resolve(load(event)).catch(() => {});
		fake.event = { request: new Request(url), url, cookies: { get: () => undefined } };
	}
	counted.reset();
	try {
		const page = /** @type {any} */ (await load(event));
		// «Por …»: les autores (si llegan como promesa, se esperan para contarlas también).
		const authors = await page.post.authorsProfiles;
		return {
			page,
			authors,
			queries: counted.queries,
			statements: counted.statements,
			waves: counted.waves,
			log: counted.log,
			describe: counted.describe
		};
	} finally {
		fake.event = null;
	}
}

/**
 * Con `KV_CONSULTAS=1`, las cuentas en frío y en caliente (un pedido antes en el mismo isolate),
 * para comparar a mano.
 * @param {string} what
 * @param {{ queries: number, waves: number, describe: () => string }} cold
 * @param {string} slug
 */
async function report(what, cold, slug) {
	if (!process.env.KV_CONSULTAS) return;
	const warm = await eventPage(slug, { warm: true });
	console.info(
		`[${what}] frío: ${cold.queries} consultas en ${cold.waves} tandas; caliente: ${warm.queries} en ${warm.waves}`
	);
	if (DETAIL)
		console.info(`[${what}] frío:\n${cold.describe()}\n[${what}] caliente:\n${warm.describe()}`);
}

describe('en caliente y sin sesión, una sola ida a la base', () => {
	// Antes de las tandas automáticas (y de pedir por la dirección y adelantar con lo que saben las
	// listas): 9 consultas en 4 tandas sin venta, 17 en 4 con venta.
	for (const slug of ['evento-sin-venta-inventado', 'taller-inventado']) {
		it(slug, async () => {
			const r = await eventPage(slug, { warm: true });
			const plain = await eventPage(slug, { warm: true, batch: false });
			if (process.env.KV_CONSULTAS) {
				console.info(
					`[${slug}, caliente] con tandas: ${r.statements} consultas en ${r.queries} idas, ${r.waves} tandas; ` +
						`sin tandas: ${plain.queries} idas en ${plain.waves} tandas`
				);
			}
			if (DETAIL) console.info(r.describe());
			expect(r.queries).toBe(1);
			expect(r.waves).toBe(1);
			// Lo mismo que sin tandas: lo adelantado nunca cambia lo que se muestra.
			expect(r.page).toEqual(plain.page);
			expect(r.authors).toEqual(plain.authors);
		});
	}
});

describe('la página de un evento, en pocas tandas', () => {
	it('sin venta de entradas', async () => {
		const r = await eventPage('evento-sin-venta-inventado');
		expect(r.page.tickets).toBeNull();
		expect(r.authors.map((/** @type {any} */ a) => a.meta.postID)).toEqual([
			'autore-inventade',
			'otre-inventade'
		]);
		await report('sin venta', r, 'evento-sin-venta-inventado');
		expect(r.queries).toBeLessThanOrEqual(28);
		expect(r.waves).toBeLessThanOrEqual(20);
	});

	it('con venta (Fondo, transferencia, lista de espera) y partes', async () => {
		const r = await eventPage('taller-inventado');
		expect(r.page.tickets).toMatchObject({ open: true, slug: 'taller-inventado' });
		expect(r.page.partes).toMatchObject({ total: 2, current: 1 });
		expect(r.page.venue).not.toBeNull();
		await report('con venta', r, 'taller-inventado');
		expect(r.queries).toBeLessThanOrEqual(37);
		expect(r.waves).toBeLessThanOrEqual(16);
	});

	it('una parte de un taller con una sola entrada: la venta del taller', async () => {
		const r = await eventPage('taller-inventado-parte-2');
		expect(r.page.tickets).toMatchObject({ open: true, slug: 'taller-inventado' });
		expect(r.page.partes).toMatchObject({ total: 2, current: 2, ticketSlug: 'taller-inventado' });
		await report('parte', r, 'taller-inventado-parte-2');
		expect(r.queries).toBeLessThanOrEqual(42);
		expect(r.waves).toBeLessThanOrEqual(20);
	});

	it('la parte de un taller oculto: sin el taller ni su venta', async () => {
		const r = await eventPage('taller-oculto-inventado-parte-2');
		expect(r.page.partes).toBeNull();
		expect(r.page.tickets).toBeNull();
		expect(JSON.stringify(r.page)).not.toContain('Taller Secreto');
	});

	it('la parte de un taller que oculta sus partes sigue dando 404', async () => {
		await expect(eventPage('taller-oculto-y-partes-inventado-parte-2')).rejects.toMatchObject({
			status: 404
		});
		await expect(eventPage('taller-oculto-y-partes-inventado')).rejects.toMatchObject({
			status: 404
		});
	});

	it('un evento que no existe sigue dando 404', async () => {
		await expect(eventPage('no-existe-inventado')).rejects.toMatchObject({ status: 404 });
	});
});
