/**
 * Panel → Propinas: solo admins, resumen y lista, CSV (también solo admins) y las propinas
 * aprobadas en la actividad del Inicio. D1 de miniflare; datos inventados.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import { ADMINS } from '$lib/server/auth';
import { navItem } from '$lib/admin/nav.js';
import { formatARS } from '$lib/utils/money.js';
import { recentActivity } from '$lib/server/admin/inicio.js';
import { applyTipPayment, createTip, tipReference } from '$lib/server/propinas/index.js';
import * as page from './+page.server.js';
import * as csv from './propinas.csv/+server.js';

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

const admin = { id: ADMINS[0].id, login: ADMINS[0].login };
const NOW = Date.parse('2026-10-01T15:00:00Z');

/**
 * @param {{ path?: string, user?: any }} [o]
 * @returns {any}
 */
function fakeEvent({ path = '/admin/propinas', user } = {}) {
	const url = new URL(path, 'https://kinkyvibe.ar');
	return {
		url,
		params: {},
		platform: t.platform,
		locals: { user: user === undefined ? admin : user, user_token: user === null ? '' : 't' },
		setHeaders: () => {},
		request: new Request(url)
	};
}

/** @param {() => unknown} fn @returns {Promise<any>} */
async function thrown(fn) {
	try {
		await fn();
		return null;
	} catch (e) {
		return e;
	}
}

async function seed() {
	const approved = await createTip(
		t.db,
		{ amount: 2000, message: 'Mensaje de prueba', category: 'material', slug: 'guia' },
		{ now: NOW }
	);
	await applyTipPayment(
		t.db,
		{
			id: 1,
			status: 'approved',
			external_reference: tipReference(approved.id),
			transaction_amount: 2000,
			currency_id: 'ARS'
		},
		{ now: NOW + 60_000 }
	);
	await createTip(
		t.db,
		{ amount: 1000, message: null, category: 'calendario', slug: 'fiesta' },
		{ now: NOW }
	);
	return approved;
}

/** Una propina "Para el Fondo" aprobada (además de las de `seed`). */
async function seedFondo() {
	const tip = await createTip(
		t.db,
		{ amount: 5000, message: null, category: 'material', slug: 'guia', destination: 'fondo' },
		{ now: NOW + 1000 }
	);
	await applyTipPayment(
		t.db,
		{
			id: 2,
			status: 'approved',
			external_reference: tipReference(tip.id),
			transaction_amount: 5000,
			currency_id: 'ARS'
		},
		{ now: NOW + 120_000 }
	);
	return tip;
}

describe('/admin/propinas', () => {
	it('está en el menú, en el grupo de Ventas', () => {
		expect(navItem('propinas')).toMatchObject({
			href: '/admin/propinas',
			group: 'entradas',
			soon: false
		});
	});

	it('sin sesión redirige al login; sin permiso, 403 (página y CSV)', async () => {
		expect((await thrown(() => page.load(fakeEvent({ user: null }))))?.status).toBe(303);
		expect((await thrown(() => csv.GET(fakeEvent({ user: null }))))?.status).toBe(303);
		const nobody = { id: 1, login: 'persona-sin-permiso' };
		expect((await thrown(() => page.load(fakeEvent({ user: nobody }))))?.status).toBe(403);
		expect((await thrown(() => csv.GET(fakeEvent({ user: nobody }))))?.status).toBe(403);
	});

	it('resumen y lista (sin las pendientes)', async () => {
		await seed();
		const data = /** @type {any} */ (await page.load(fakeEvent()));
		expect(data.summary).toMatchObject({ total: 2000, count: 1, counts: { pending: 1 } });
		expect(data.summary.byPost).toEqual([
			{ category: 'material', slug: 'guia', count: 1, total: 2000 }
		]);
		expect(data.tips).toHaveLength(1);
		expect(data.tips[0]).toMatchObject({ status: 'approved', message: 'Mensaje de prueba' });
	});

	it('CSV: privado, con todas las propinas', async () => {
		await seed();
		const res = await csv.GET(fakeEvent({ path: '/admin/propinas/propinas.csv' }));
		expect(res.headers.get('content-type')).toBe('text/csv; charset=utf-8');
		expect(res.headers.get('cache-control')).toBe('private, no-store');
		expect(res.headers.get('content-disposition')).toBe('attachment; filename="propinas.csv"');
		const text = await res.text();
		const lines = text.replace('﻿', '').trim().split('\r\n');
		expect(lines).toHaveLength(3);
		expect(text).toContain(',Aprobada,2000,material,guia,Mensaje de prueba,1');
		expect(text).toContain(',Pendiente,1000,calendario,fiesta,,');
	});

	it('destino: totales separados, columna en la lista y filtro `?destino=`', async () => {
		await seed();
		const fondo = await seedFondo();
		const data = /** @type {any} */ (await page.load(fakeEvent()));
		expect(data.destination).toBeNull();
		expect(data.summary.total).toBe(7000);
		expect(data.summary.byDestination).toEqual({
			kinkyvibe: { count: 1, total: 2000 },
			fondo: { count: 1, total: 5000 }
		});
		expect(data.tips.map((/** @type {any} */ x) => x.destination)).toEqual(['fondo', 'kinkyvibe']);

		const onlyFondo = /** @type {any} */ (
			await page.load(fakeEvent({ path: '/admin/propinas?destino=fondo' }))
		);
		expect(onlyFondo.destination).toBe('fondo');
		expect(onlyFondo.tips.map((/** @type {any} */ x) => x.id)).toEqual([fondo.id]);
		// Los totales no se filtran.
		expect(onlyFondo.summary.total).toBe(7000);

		const onlyKv = /** @type {any} */ (
			await page.load(fakeEvent({ path: '/admin/propinas?destino=kinkyvibe' }))
		);
		expect(onlyKv.tips).toHaveLength(1);
		expect(onlyKv.tips[0]).toMatchObject({
			destination: 'kinkyvibe',
			message: 'Mensaje de prueba'
		});

		// Un valor raro en la URL: sin filtro.
		const odd = /** @type {any} */ (
			await page.load(fakeEvent({ path: "/admin/propinas?destino=fondo' OR 1=1" }))
		);
		expect(odd.destination).toBeNull();
		expect(odd.tips).toHaveLength(2);
	});

	it('CSV: columna destino', async () => {
		await seed();
		await seedFondo();
		const res = await csv.GET(fakeEvent({ path: '/admin/propinas/propinas.csv' }));
		const lines = (await res.text()).replace('\ufeff', '').trim().split('\r\n');
		expect(lines[0].split(',').at(-1)).toBe('destino');
		expect(lines).toHaveLength(4);
		const fondoRows = lines.filter(
			(l) => l.includes(',Aprobada,5000,') && l.endsWith(',2,Para el Fondo')
		);
		expect(fondoRows).toHaveLength(1);
		expect(lines.filter((l) => l.endsWith(',Para KinkyVibe'))).toHaveLength(2);
	});

	it('las propinas aprobadas aparecen en la actividad del Inicio (las pendientes no)', async () => {
		await seed();
		const items = await recentActivity(t.db, { limit: 10 });
		const tips = items.filter((i) => i.kind === 'tip');
		expect(tips).toEqual([
			expect.objectContaining({
				at: NOW + 60_000,
				title: `Propina de ${formatARS(2000)}`,
				who: 'guia',
				href: '/admin/propinas'
			})
		]);
		// Sin el mensaje (privado) en el feed.
		expect(JSON.stringify(items)).not.toContain('Mensaje de prueba');
	});
});
