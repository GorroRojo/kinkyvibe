import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import { parseTicketConfig } from './config.js';
import { saveSalesSettings, validateSalesSettings } from './settings.js';

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
afterEach(() => {
	vi.doUnmock('$app/environment');
	vi.doUnmock('$env/dynamic/private');
	vi.resetModules();
	vi.restoreAllMocks();
});

/** @param {{ dev?: boolean, env?: Record<string, string> }} [o] */
async function load(o = {}) {
	vi.resetModules();
	vi.doMock('$app/environment', () => ({
		dev: o.dev ?? false,
		browser: false,
		building: false,
		version: 'test'
	}));
	vi.doMock('$env/dynamic/private', () => ({ env: o.env ?? {} }));
	return await import('./fondo.js');
}

/** fetch simulado que responde el JSON de fondo.kinkyvibe.ar (o un error). */
function fakeFetch(/** @type {any} */ body, status = 200) {
	return vi.fn(async () => new Response(JSON.stringify(body), { status }));
}
const down = vi.fn(async () => {
	throw new TypeError('fetch failed');
});

describe('porcentaje automático del Fondo', () => {
	it('parsePercent: enteros de 0 a 100', async () => {
		const { parsePercent } = await load();
		expect(parsePercent(30)).toBe(30);
		expect(parsePercent('40')).toBe(40);
		expect(parsePercent('50%')).toBe(50);
		for (const bad of [-10, 101, 12.5, 'x', null, '', undefined])
			expect(parsePercent(bad)).toBeNull();
	});

	it('usa la API, lo guarda en D1 y lo recuerda 10 minutos', async () => {
		vi.spyOn(console, 'warn').mockImplementation(() => {});
		const f = await load();
		const fetch1 = fakeFetch({ percent: 30, collected: 1, goal: 3, step: 10 });
		const r = await f.resolveFondoPercent({
			db: t.db,
			fetch: fetch1,
			now: 1000,
			url: 'https://x.test/api'
		});
		expect(r).toEqual({ percent: 30, source: 'live', updatedAt: 1000 });
		expect(fetch1).toHaveBeenCalledWith('https://x.test/api', expect.anything());
		expect(await f.getStoredPercent(t.db)).toEqual({ percent: 30, at: 1000 });
		// Dentro de los 10 minutos no vuelve a pedir.
		const fetch2 = fakeFetch({ percent: 40 });
		expect((await f.resolveFondoPercent({ db: t.db, fetch: fetch2, now: 5 * 60000 })).percent).toBe(
			30
		);
		expect(fetch2).not.toHaveBeenCalled();
		// Después sí.
		expect(
			(await f.resolveFondoPercent({ db: t.db, fetch: fetch2, now: 11 * 60000 })).percent
		).toBe(40);
	});

	it('si la API no responde: el último dato guardado; si no hay, 0 (nunca frena la venta)', async () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		let f = await load();
		expect(await f.resolveFondoPercent({ db: t.db, fetch: down, now: 1 })).toEqual({
			percent: 0,
			source: 'none',
			updatedAt: null
		});
		expect(warn).toHaveBeenCalled();
		f = await load();
		await f.resolveFondoPercent({ db: t.db, fetch: fakeFetch({ percent: 20 }), now: 100 });
		for (const broken of [
			down,
			fakeFetch({ error: 'unavailable' }, 503),
			fakeFetch({ percent: 'mucho' }),
			fakeFetch({ percent: 150 })
		]) {
			f = await load(); // sin la memoria del isolate
			expect(await f.resolveFondoPercent({ db: t.db, fetch: broken, now: 200 })).toEqual({
				percent: 20,
				source: 'stored',
				updatedAt: 100
			});
		}
	});

	it('el porcentaje fijado en Ajustes de venta gana sobre la API', async () => {
		const f = await load();
		const v = /** @type {any} */ (validateSalesSettings({ fondo_percent_override: '50' })).value;
		await saveSalesSettings(t.db, v, { by: 'admin' });
		const fetch1 = fakeFetch({ percent: 30 });
		expect(await f.resolveFondoPercent({ db: t.db, fetch: fetch1 })).toEqual({
			percent: 50,
			source: 'admin',
			updatedAt: null
		});
		expect(fetch1).not.toHaveBeenCalled();
		expect(validateSalesSettings({ fondo_percent_override: '101' }).ok).toBe(false);
		expect(validateSalesSettings({ fondo_percent_override: '12.5' }).ok).toBe(false);
		expect(validateSalesSettings({ fondo_percent_override: '100 %' }).ok).toBe(true);
	});

	it('FONDO_PERCENT_OVERRIDE solo en dev', async () => {
		vi.spyOn(console, 'warn').mockImplementation(() => {});
		let f = await load({ dev: true, env: { FONDO_PERCENT_OVERRIDE: '20' } });
		expect((await f.resolveFondoPercent({ db: t.db, fetch: down })).source).toBe('override');
		f = await load({ dev: false, env: { FONDO_PERCENT_OVERRIDE: '20' } });
		expect((await f.resolveFondoPercent({ db: t.db, fetch: down })).percent).toBe(0);
	});
});

/** Un fetch de fondo.kinkyvibe.ar que no contesta hasta `release()`. */
function gatedFetch(/** @type {number} */ percent) {
	/** @type {() => void} */
	let release = () => {};
	const gate = new Promise((r) => (release = () => r(undefined)));
	const fn = vi.fn(async () => {
		await gate;
		return new Response(JSON.stringify({ percent }));
	});
	return { fn, release: () => release() };
}

describe('staleOk: solo para mostrar, sin esperar a la API', () => {
	it('con un porcentaje guardado, lo da sin esperar y lo actualiza en segundo plano', async () => {
		const f = await load();
		await f.resolveFondoPercent({ db: t.db, fetch: fakeFetch({ percent: 20 }), now: 1000 });
		const later = 11 * 60000; // la memoria venció
		const api = gatedFetch(30);
		/** @type {Promise<unknown>[]} */
		const tasks = [];
		/** @param {Promise<unknown>} p */
		const waitUntil = (p) => void tasks.push(p);
		const r = await f.resolveFondoPercent({
			db: t.db,
			fetch: api.fn,
			now: later,
			staleOk: true,
			waitUntil
		});
		// Contestó con la API todavía sin responder.
		expect(r).toEqual({ percent: 20, source: 'live', updatedAt: 1000 });
		expect(api.fn).toHaveBeenCalledTimes(1);
		expect(tasks).toHaveLength(1);
		// Mientras tanto, otra vista no larga otra actualización.
		await f.resolveFondoPercent({ db: t.db, fetch: api.fn, now: later, staleOk: true, waitUntil });
		expect(api.fn).toHaveBeenCalledTimes(1);
		expect(tasks).toHaveLength(1);
		api.release();
		await Promise.all(tasks);
		// Ya actualizado: memoria y D1.
		const after = await f.resolveFondoPercent({ db: t.db, fetch: down, now: later + 1 });
		expect(after).toEqual({ percent: 30, source: 'live', updatedAt: later });
		expect(await f.getStoredPercent(t.db)).toEqual({ percent: 30, at: later });
	});

	it('en un isolate nuevo, usa el guardado en D1', async () => {
		let f = await load();
		await f.resolveFondoPercent({ db: t.db, fetch: fakeFetch({ percent: 20 }), now: 1000 });
		f = await load(); // sin la memoria del isolate
		const api = gatedFetch(30);
		const tasks = /** @type {Promise<unknown>[]} */ ([]);
		const r = await f.resolveFondoPercent({
			db: t.db,
			fetch: api.fn,
			now: 2000,
			staleOk: true,
			waitUntil: (p) => void tasks.push(p)
		});
		expect(r).toEqual({ percent: 20, source: 'stored', updatedAt: 1000 });
		api.release();
		await Promise.all(tasks);
	});

	it('sin porcentaje conocido, sin staleOk o sin waitUntil, espera a la API como siempre', async () => {
		vi.spyOn(console, 'warn').mockImplementation(() => {});
		let f = await load();
		const waitUntil = vi.fn();
		const fresh = await f.resolveFondoPercent({
			db: t.db,
			fetch: fakeFetch({ percent: 20 }),
			now: 1000,
			staleOk: true,
			waitUntil
		});
		expect(fresh).toEqual({ percent: 20, source: 'live', updatedAt: 1000 });
		expect(waitUntil).not.toHaveBeenCalled();
		const later = 11 * 60000;
		// La compra (sin staleOk) espera el valor nuevo.
		const r = await f.resolveFondoPercent({
			db: t.db,
			fetch: fakeFetch({ percent: 40 }),
			now: later
		});
		expect(r.percent).toBe(40);
		// Sin waitUntil (fuera de un Worker), también espera.
		f = await load();
		const s = await f.resolveFondoPercent({
			db: t.db,
			fetch: fakeFetch({ percent: 50 }),
			now: later + 1,
			staleOk: true
		});
		expect(s.percent).toBe(50);
	});

	it('el fijado en Ajustes sigue ganando', async () => {
		const f = await load();
		const v = /** @type {any} */ (validateSalesSettings({ fondo_percent_override: '50' })).value;
		await saveSalesSettings(t.db, v, { by: 'admin' });
		const api = gatedFetch(30);
		const waitUntil = vi.fn();
		const r = await f.resolveFondoPercent({ db: t.db, fetch: api.fn, staleOk: true, waitUntil });
		expect(r.source).toBe('admin');
		expect(api.fn).not.toHaveBeenCalled();
		expect(waitUntil).not.toHaveBeenCalled();
	});
});

describe('precedencia y redondeo en la configuración del evento', () => {
	const META = {
		title: 'x',
		start: '2026-10-17T21:00-03:00',
		tags: ['kinkyvibe'], // alias de KinkyVibe: el Fondo aplica
		tickets: [
			{ id: 'general', price: 10000, capacity: 5 },
			{ id: 'impar', price: 4999, capacity: 5 },
			{ id: 'fijo', price: 8000, fondo: 1000, capacity: 5 }, // `fondo` en pesos: se ignora
			{ id: 'gorra', a_la_gorra: { minimo: 0, sugerido: 3000 }, capacity: 5 }
		]
	};
	it('automático: round(precio × % / 100) en todos los tipos con precio; no en la gorra', () => {
		const c = parseTicketConfig(META, { fondoPercent: 15 });
		// 4999 × 15 % = 749,85 → 750
		expect(c?.types.map((x) => x.fondo)).toEqual([1500, 750, 1200, 0]);
		expect(c).toMatchObject({ fondoEnabled: true, fondoPercent: 15 });
	});
	it('`fondo_percent` y `fondo` en el frontmatter se ignoran: manda el porcentaje global', () => {
		const c = parseTicketConfig({ ...META, fondo_percent: 0 }, { fondoPercent: 40 });
		expect(c?.types.map((x) => x.fondo)).toEqual([4000, 2000, 3200, 0]);
		expect(c?.fondoPercent).toBe(40);
	});
	it('sin nada: sin fondo', () => {
		expect(parseTicketConfig(META)?.types.map((x) => x.fondo)).toEqual([0, 0, 0, 0]);
		expect(parseTicketConfig(META, { fondoPercent: 999 })?.fondoPercent).toBeNull();
	});
});
