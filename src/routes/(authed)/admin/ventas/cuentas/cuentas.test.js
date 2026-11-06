/**
 * Ventas › Cuentas del año: solo admins y con el interruptor `gastos_reparto`; «Lo que le tocó a
 * cada parte» sale de la foto de cada cierre y nunca en el CSV («Descargar CSV» arma las filas de
 * `events`, que no tienen partes). D1 de miniflare; eventos y personas inventados.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const flag = vi.hoisted(() => ({ on: true }));
vi.mock('$env/dynamic/private', () => ({ env: {} }));
vi.mock('$lib/server/flags.js', async (importOriginal) => ({
	.../** @type {object} */ (await importOriginal()),
	gastosRepartoEnabled: async () => flag.on
}));

import { render } from 'svelte/server';
import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import { ADMINS } from '$lib/server/auth.js';
import { cajaPart, emptyAccount, eventIncome, newPart } from '$lib/admin/reparto.js';
import { closeAccount } from '$lib/server/tickets/cuentas.js';
import { textOf } from '$lib/testing/html.js';
import { load } from './+page.server.js';
import Page from './+page.svelte';

vi.setConfig({ testTimeout: 60_000, hookTimeout: 30_000 });

const admin = { user: { id: ADMINS[0].id, login: ADMINS[0].login }, user_token: 'prueba' };
const notAdmin = { user: { id: 1, login: 'persona-de-prueba' }, user_token: 'prueba' };

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
	flag.on = true;
	const data = {
		...emptyAccount(),
		venue: { ...emptyAccount().venue, kind: 'fijo', amount: 20000 },
		parts: [
			cajaPart({ rule: 'resto' }),
			newPart({ id: 'a', name: 'Facilitadore Inventade', rule: 'pct', pct: 30 })
		]
	};
	await closeAccount(t.db, {
		slug: 'taller-de-prueba',
		title: 'Taller de prueba',
		date: '2026-09-20',
		summary: {
			tickets: 10,
			presale: 120000,
			door: 0,
			fondo_net: 0,
			extras: 0,
			other_income: 0,
			income_total: 120000,
			venue: 20000,
			fees: 0,
			other_expenses: 0,
			expenses_total: 20000,
			caja: 70000,
			profit: 100000
		},
		snapshot: { income: { ...eventIncome([]), presale: 120000 }, data },
		by: 'admin-de-prueba'
	});
});

/** @param {any} locals */
const call = (locals) =>
	/** @type {Promise<any>} */ (
		load(
			/** @type {any} */ ({
				locals,
				url: new URL('https://kinkyvibe.test/admin/ventas/cuentas?anio=2026'),
				platform: { env: { DB: t.db } },
				setHeaders: () => {}
			})
		)
	);

describe('Cuentas del año', () => {
	it('solo admins, y con el interruptor apagado da 404', async () => {
		await expect(call(notAdmin)).rejects.toMatchObject({ status: 403 });
		await expect(call({})).rejects.toMatchObject({ status: 303 });
		flag.on = false;
		await expect(call(admin)).rejects.toMatchObject({ status: 404 });
	});

	it('suma lo de cada parte y lo muestra; las filas del CSV no tienen partes', async () => {
		const data = await call(admin);
		expect(data.shares.rows).toEqual([
			{ name: 'Caja KV', team: true, events: 1, amount: 70000 },
			{ name: 'Facilitadore Inventade', team: false, events: 1, amount: 30000 }
		]);
		expect(JSON.stringify(data.events)).not.toContain('Facilitadore Inventade');
		const html = render(Page, { props: { data } }).body;
		const text = textOf(html).replace(/\s+/g, ' ');
		expect(text).toContain('Lo que le tocó a cada parte');
		expect(text).toContain('Facilitadore Inventade');
		expect(text).toContain('Descargar CSV');
	});
});
