/**
 * Eventos › Agenda impresa: solo admins (sin sesión, 303 al login; sin permiso, 403), solo lee, y
 * arma las filas de los eventos del rango con el ícono de su serie. D1 de miniflare; eventos
 * inventados.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import { ADMINS } from '$lib/server/auth';
import { fakeEvent, fakeRequestEvent, thrown } from '$lib/server/series/fixtures.js';
import { seedPosts } from '$lib/server/contenido/testing.js';
import { argDate } from '$lib/utils/dates.js';

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
	vi.resetModules();
});

const DAY = 86400000;
const admin = { id: ADMINS[0].id, login: ADMINS[0].login };
const stranger = { id: 1, login: 'alguien-de-prueba' };

async function page() {
	vi.resetModules();
	const now = Date.now();
	await seedPosts(t.db, [
		fakeEvent('serie-proxima', now + 3 * DAY, ['Picantearla'], {
			title: 'Serie de prueba',
			location: 'Calle Falsa 123'
		}),
		fakeEvent('otra-cosa', now + 2 * DAY, ['taller'], {
			title: 'Taller inventado',
			location: 'Zoom'
		}),
		fakeEvent('cancelado', now + 4 * DAY, ['taller'], { status: 'cancelado' }),
		fakeEvent('lejano', now + 60 * DAY, ['taller'])
	]);
	return import('./+page.server.js');
}

/** @param {{ user?: any, path?: string }} [o] */
const ev = ({ user = admin, path = '/admin/eventos/agenda-impresa' } = {}) =>
	fakeRequestEvent({ platform: t.platform, path, user });

describe('acceso', () => {
	it('sin sesión: 303 al login', async () => {
		const { load } = await page();
		expect(await thrown(() => load(ev({ user: null })))).toMatchObject({ status: 303 });
	});
	it('logueade sin permiso: 403', async () => {
		const { load } = await page();
		expect(await thrown(() => load(ev({ user: stranger })))).toMatchObject({ status: 403 });
	});
});

describe('con permiso', () => {
	it('los eventos de los próximos días, en orden, sin cancelados ni lejanos', async () => {
		const { load } = await page();
		const data = /** @type {any} */ (await load(ev()));
		expect(data.bare).toBe(true);
		expect(data.range.from).toBe(argDate(Date.now()));
		expect(data.events.map((/** @type {any} */ e) => e.slug)).toEqual([
			'otra-cosa',
			'serie-proxima'
		]);
		const [online, serie] = data.events;
		expect(online).toMatchObject({ title: 'Taller inventado', place: 'Online', icon: '✨' });
		expect(serie).toMatchObject({ title: 'Serie de prueba', place: 'Calle Falsa 123' });
		expect(serie.series).toBe('Picantearla');
		expect(serie.icon).not.toBe('✨');
		expect(data.qr).toContain('<svg');
	});
	it('un rango pedido trae los de esas fechas', async () => {
		const { load } = await page();
		const from = argDate(Date.now() + 59 * DAY);
		const to = argDate(Date.now() + 61 * DAY);
		const data = /** @type {any} */ (
			await load(ev({ path: `/admin/eventos/agenda-impresa?desde=${from}&hasta=${to}` }))
		);
		expect(data.events.map((/** @type {any} */ e) => e.slug)).toEqual(['lejano']);
	});
});
