/**
 * Eventos → Series y su CSV: solo admins (sin sesión, 303 al login; sin permiso, 403), y nunca
 * los mails de quienes pidieron aviso (solo cuántos son).
 * D1 de miniflare; posts y mails inventados.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import { ADMINS } from '$lib/server/auth';
import { emailHash } from '$lib/server/cuentas/accounts.js';
import { fakeRequestEvent, fakeSeriesPosts, thrown } from '$lib/server/series/fixtures.js';
import { seedPosts } from '$lib/server/contenido/testing.js';

vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

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
	vi.doUnmock('$env/dynamic/private');
	vi.doUnmock('$lib/utils');
	vi.resetModules();
});

const admin = { id: ADMINS[0].id, login: ADMINS[0].login };
const stranger = { id: 1, login: 'alguien-de-prueba' };
const SECRET_EMAIL = 'suscripta.prueba@example.com';

/** Las rutas, recién cargadas. */
async function routes() {
	vi.resetModules();
	const posts = fakeSeriesPosts(Date.now());
	// Los eventos salen de la base.
	await seedPosts(t.db, posts);
	vi.doMock('$lib/utils', async () => ({
		.../** @type {object} */ (await vi.importActual('$lib/utils')),
		fetchMarkdownPosts: async () => [...posts],
		thumbURL: async (/** @type {string} */ _c, /** @type {string} */ _p, /** @type {string} */ f) =>
			`/assets/${f}`,
		// La imagen de un evento como imagen de la serie (calendario:<evento>/<archivo>).
		mediaURL: (/** @type {string} */ c, /** @type {string} */ p, /** @type {string} */ f) =>
			`/media/${c}/${p}/${f}`
	}));
	return {
		page: await import('./+page.server.js'),
		csv: await import('./ediciones.csv/+server.js')
	};
}

/** @param {{ user?: any, path?: string }} [o] */
const ev = ({ user = admin, path = '/admin/eventos/series' } = {}) =>
	fakeRequestEvent({ platform: t.platform, path, user });

async function seedSubscribers() {
	await t.db
		.prepare(
			`INSERT INTO series_subscriptions (id, series_tag, email, subscriber_key, created_at, confirmed_at)
			VALUES (?1, 'Picantearla', ?2, ?3, 1, 1)`
		)
		.bind(crypto.randomUUID(), SECRET_EMAIL, `e:${await emailHash(SECRET_EMAIL)}`)
		.run();
	await t.db
		.prepare(
			`INSERT INTO series_subscriptions (id, series_tag, email, subscriber_key, confirm_hash, confirm_expires_at, created_at)
			VALUES (?1, 'Picantearla', 'pendiente.prueba@example.com', 'e:pendiente', ?2, 9999999999999, 1)`
		)
		.bind(crypto.randomUUID(), 'a'.repeat(64))
		.run();
}

describe('acceso', () => {
	it('sin sesión: 303 al login (página y CSV)', async () => {
		const { page, csv } = await routes();
		expect(await thrown(() => page.load(ev({ user: null })))).toMatchObject({ status: 303 });
		expect(
			await thrown(() => csv.GET(ev({ user: null, path: '/admin/eventos/series/ediciones.csv' })))
		).toMatchObject({ status: 303 });
	});
	it('logueade sin permiso: 403 (página y CSV)', async () => {
		const { page, csv } = await routes();
		expect(await thrown(() => page.load(ev({ user: stranger })))).toMatchObject({ status: 403 });
		expect(await thrown(() => csv.GET(ev({ user: stranger })))).toMatchObject({ status: 403 });
	});
});

describe('con permiso y prendido', () => {
	it('las series con sus ediciones y cuántas personas pidieron aviso, sin sus mails', async () => {
		await seedSubscribers();
		const { page } = await routes();
		const data = /** @type {any} */ (await page.load(ev()));
		const pica = data.series.find((/** @type {any} */ s) => s.id === 'Picantearla');
		expect(pica).toMatchObject({
			total: 3,
			upcoming: 1,
			subscribers: { confirmed: 1, pending: 1 },
			image: '/assets/picantearla-miniatura.webp'
		});
		expect(pica.next.slug).toBe('serie-prueba-3');
		expect(pica.editions.map((/** @type {any} */ e) => e.slug)).toEqual([
			'serie-prueba-3',
			'serie-prueba-2',
			'serie-prueba-1'
		]);
		expect(JSON.stringify(data)).not.toContain('@example.com');
	});
	it('CSV: una fila por edición, sin datos de personas; ?serie= filtra', async () => {
		await seedSubscribers();
		const { csv } = await routes();
		const res = await csv.GET(ev({ path: '/admin/eventos/series/ediciones.csv' }));
		expect(res.status).toBe(200);
		expect(res.headers.get('content-type')).toContain('text/csv');
		const text = await res.text();
		const lines = text.trim().split('\r\n');
		expect(lines[0]).toContain('Serie,Edición,Título');
		expect(lines).toHaveLength(4); // encabezado + 3 ediciones de Picantearla
		expect(text).toContain('Serie de prueba (7° Edición)');
		expect(text).not.toContain('@example.com');
		const only = await csv.GET(
			ev({ path: '/admin/eventos/series/ediciones.csv?serie=Cine%20para%20Sucixs' })
		);
		expect((await only.text()).trim().split('\r\n')).toHaveLength(1);
	});
});
