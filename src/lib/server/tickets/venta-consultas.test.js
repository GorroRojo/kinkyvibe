/**
 * El resumen de la venta de un evento (`getTicketsView`, el botón de la página del evento y el
 * formulario de /entradas) lee la configuración del evento una sola vez, busca el porcentaje del
 * Fondo a la par de su lugar y lee los ajustes de venta una sola vez por pedido: la base está lejos
 * y cada consulta que espera a otra es una ida y vuelta más. D1 de miniflare; datos inventados.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { countingDB, createTestDB } from '$lib/server/db/testing.js';
import { seedPosts } from '$lib/server/contenido/testing.js';
import { makeEvent, makeProfile } from '$lib/server/amigues/testing.js';

vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 });

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
	modalidad: 'online',
	tags: [],
	authors: [],
	...extra
});
const sale = {
	payment_methods: ['transferencia'],
	lista_espera: 'evento',
	tickets: [{ id: 'general', name: 'General', price: 10000, capacity: 50 }]
};

beforeAll(async () => {
	t = await createTestDB();
	await seedPosts(t.db, [
		eventMeta('sin-venta-inventado'),
		eventMeta('con-fondo-inventado', { ...sale, tags: ['KinkyVibe'] }),
		eventMeta('sin-fondo-inventado', sale)
	]);
	// Con lugar vinculado: la venta lo trata como presencial (así se nota si leyó el lugar).
	const venue = await makeProfile(t.db, { title: 'Lugar Inventado', kind: 'lugar' });
	const venues = await import('$lib/server/amigues/venues.js');
	await makeEvent(t.db, 'con-fondo-inventado');
	await venues.setEventVenue(t.db, {
		eventSlug: 'con-fondo-inventado',
		venueId: venue.id,
		privacy: null,
		by: BY
	});
	const { saveSalesSettings } = await import('./settings.js');
	await saveSalesSettings(t.db, { transfer_alias: 'alias.inventado' }, { by: BY });
});
afterAll(async () => {
	fake.event = null;
	await t?.dispose();
});

/**
 * `getTicketsView` en frío, dentro de un GET, con una base que cuenta consultas y tandas en fila.
 * @param {string} slug
 */
async function ticketsView(slug) {
	vi.resetModules();
	const counted = countingDB(t.db, { delayMs: DELAY_MS });
	(await import('$lib/server/contenido/repo.js')).setContentDB(counted.db);
	const url = new URL(`/calendario/${slug}`, 'https://kinkyvibe.ar');
	fake.event = { request: new Request(url), url, cookies: { get: () => undefined } };
	const fetch = vi.fn(
		async () =>
			new Response(JSON.stringify({ percent: 20 }), {
				headers: { 'content-type': 'application/json' }
			})
	);
	try {
		const { getTicketsView } = await import('./checkout.js');
		const view = await getTicketsView(counted.db, slug, /** @type {any} */ (fetch), {
			waitlist: true
		});
		return { view, fetch, queries: counted.queries, waves: counted.waves, log: counted.log };
	} finally {
		fake.event = null;
	}
}

describe('la venta de un evento, en pocas tandas', () => {
	it('con el Fondo: el evento una vez, el Fondo a la par del lugar, los ajustes una vez', async () => {
		const r = await ticketsView('con-fondo-inventado');
		expect(r.view).toMatchObject({ open: true, online: false, fondoPercent: 20 });
		expect(r.view?.types[0]).toMatchObject({ price: 10000, fondo: 2000 });
		expect(r.view?.methods).toEqual(['transferencia']);
		expect(r.fetch).toHaveBeenCalledTimes(1);
		const count = (/** @type {RegExp} */ re) => r.log.filter((q) => re.test(q.sql)).length;
		expect(count(/FROM ticket_settings$/)).toBe(1);
		// La configuración del evento y su lugar, una vez cada uno (antes, dos).
		expect(count(/^SELECT id, type, slug, title, data\b/)).toBe(1);
		expect(count(/^SELECT DISTINCT l\.event_slug/)).toBe(1);
		// Antes: 12 consultas en 12 tandas (el guardado del porcentaje es solo con el isolate frío).
		// Lo vendido, la fila, los ajustes y las preguntas salen a la par del lugar y del Fondo.
		expect(r.queries).toBeLessThanOrEqual(8);
		expect(r.waves).toBeLessThanOrEqual(4);
	});

	it('sin el Fondo: no lo busca', async () => {
		const r = await ticketsView('sin-fondo-inventado');
		expect(r.view).toMatchObject({ open: true, online: true, fondoEnabled: false });
		expect(r.fetch).not.toHaveBeenCalled();
		// Antes: 7 consultas en 7 tandas (los ajustes, dos veces). Ahora, el evento y después todo
		// lo demás a la par.
		expect(r.queries).toBeLessThanOrEqual(6);
		expect(r.waves).toBeLessThanOrEqual(2);
	});

	it('sin venta: una consulta (el evento), sin Fondo ni ajustes', async () => {
		const r = await ticketsView('sin-venta-inventado');
		expect(r.view).toBeNull();
		expect(r.fetch).not.toHaveBeenCalled();
		expect(r.queries).toBe(1);
	});
});

describe('getEventTickets con `fondo`', () => {
	it('lo mismo que leer el porcentaje antes y pasarlo', async () => {
		vi.resetModules();
		(await import('$lib/server/contenido/repo.js')).setContentDB(t.db);
		const events = await import('./events.js');
		for (const slug of [
			'con-fondo-inventado',
			'sin-fondo-inventado',
			'sin-venta-inventado',
			'no-existe-inventado',
			'_privado'
		]) {
			const fondo = vi.fn(async (/** @type {any} */ base) => (base.fondoEnabled ? 30 : undefined));
			const before = await events.getEventTickets(slug);
			const expected = before?.fondoEnabled
				? await events.getEventTickets(slug, { fondoPercent: 30 })
				: before;
			expect(await events.getEventTickets(slug, { fondo }), slug).toEqual(expected);
			// Solo se pregunta con una venta válida.
			expect(fondo, slug).toHaveBeenCalledTimes(before ? 1 : 0);
		}
	});
});

describe('getSalesSettings: una vez por pedido de lectura', () => {
	/** @param {string} method */
	const inRequest = (method) => {
		const url = new URL('/admin/ajustes/cobros', 'https://kinkyvibe.ar');
		fake.event = { request: new Request(url, { method }), url, cookies: { get: () => undefined } };
	};

	it('en un GET, una consulta; cada llamada recibe su copia', async () => {
		vi.resetModules();
		const { getSalesSettings } = await import('./settings.js');
		const counted = countingDB(t.db);
		inRequest('GET');
		try {
			const [a, b] = await Promise.all([
				getSalesSettings(counted.db),
				getSalesSettings(counted.db)
			]);
			const c = await getSalesSettings(counted.db);
			expect(counted.queries).toBe(1);
			expect(a.transfer_alias).toBe('alias.inventado');
			expect(c).toEqual(a);
			a.transfer_alias = 'cambiado-por-quien-llamo';
			expect(b.transfer_alias).toBe('alias.inventado');
			expect((await getSalesSettings(counted.db)).transfer_alias).toBe('alias.inventado');
		} finally {
			fake.event = null;
		}
	});

	it('en un POST, lo leído después de guardar es lo nuevo', async () => {
		vi.resetModules();
		const { getSalesSettings, saveSalesSettings } = await import('./settings.js');
		inRequest('POST');
		try {
			expect((await getSalesSettings(t.db)).mp_fee_percent).toBe('');
			await saveSalesSettings(t.db, { mp_fee_percent: '5' }, { by: BY });
			expect((await getSalesSettings(t.db)).mp_fee_percent).toBe('5');
			await saveSalesSettings(t.db, { mp_fee_percent: '' }, { by: BY });
			expect((await getSalesSettings(t.db)).mp_fee_percent).toBe('');
		} finally {
			fake.event = null;
		}
	});
});
