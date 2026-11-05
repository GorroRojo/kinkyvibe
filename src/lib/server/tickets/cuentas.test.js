/**
 * La cuenta de cada evento en la base (cuentas.js, migración 0078): guardar sin pisar a otre
 * admin, cerrar (y no guardar más), reabrir, el resumen del año y la regla por defecto de un
 * lugar. Eventos, lugares y personas inventados.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import { saveObject } from '$lib/server/objects/save.js';
import { emptyAccount } from '$lib/admin/reparto.js';
import {
	ACCOUNT_TABLES,
	accountsReady,
	closeAccount,
	closingYears,
	getAccount,
	getClosing,
	getVenueRule,
	listClosings,
	reopenAccount,
	saveAccount,
	saveVenueRule
} from './cuentas.js';

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

const SLUG = 'taller-de-prueba';

const summary = {
	tickets: 20,
	presale: 140000,
	door: 40000,
	fondo_net: 15000,
	other_income: 0,
	income_total: 200000,
	venue: 60000,
	fees: 0,
	other_expenses: 10000,
	expenses_total: 70000,
	caja: 84500,
	profit: 130000
};

describe('cuentas', () => {
	it('guarda, y no pisa lo que guardó otre admin', async () => {
		expect(await getAccount(t.db, SLUG)).toBeNull();
		const data = { ...emptyAccount(), people: [{ id: 'a', name: 'Facilitadore A', team: false }] };
		expect(await saveAccount(t.db, { slug: SLUG, data, version: 0, by: 'admin-a' })).toEqual({
			ok: true,
			version: 1
		});
		// Otre admin que abrió antes (versión 0) no pisa.
		expect(await saveAccount(t.db, { slug: SLUG, data, version: 0, by: 'admin-b' })).toEqual({
			ok: false,
			reason: 'conflict'
		});
		expect(await saveAccount(t.db, { slug: SLUG, data, version: 1, by: 'admin-b' })).toEqual({
			ok: true,
			version: 2
		});
		const saved = await getAccount(t.db, SLUG);
		expect(saved?.version).toBe(2);
		expect(saved?.updatedBy).toBe('admin-b');
		expect(saved?.data.people[0].name).toBe('Facilitadore A');
	});

	it('cerrada no se guarda; reabierta sí', async () => {
		await saveAccount(t.db, { slug: SLUG, data: emptyAccount(), version: 0, by: 'admin-a' });
		const close = {
			slug: SLUG,
			title: 'Taller de prueba',
			date: '2026-03-14',
			summary,
			snapshot: { hola: 1 },
			by: 'admin-a'
		};
		expect(await closeAccount(t.db, close)).toBe(true);
		expect(await closeAccount(t.db, close)).toBe(false);
		const closing = await getClosing(t.db, SLUG);
		expect(closing).toMatchObject({ ...summary, event_date: '2026-03-14', snapshot: { hola: 1 } });
		expect(
			await saveAccount(t.db, { slug: SLUG, data: emptyAccount(), version: 1, by: 'admin-a' })
		).toEqual({ ok: false, reason: 'closed' });
		expect(await reopenAccount(t.db, SLUG)).toBe(true);
		expect(await getClosing(t.db, SLUG)).toBeNull();
		expect(
			(await saveAccount(t.db, { slug: SLUG, data: emptyAccount(), version: 1, by: 'admin-a' })).ok
		).toBe(true);
	});

	it('los cierres de un año y los años con cierres', async () => {
		for (const [slug, date] of [
			['a', '2025-12-30'],
			['b', '2026-01-10'],
			['c', '2026-11-02']
		]) {
			await closeAccount(t.db, { slug, title: slug, date, summary, snapshot: {}, by: 'x' });
		}
		expect((await listClosings(t.db, 2026)).map((r) => r.event_slug)).toEqual(['b', 'c']);
		expect(await closingYears(t.db)).toEqual([2026, 2025]);
	});

	it('la regla por defecto de un lugar, sin las horas', async () => {
		const venue = await saveObject(
			t.db,
			{ type: 'perfil', slug: 'sala-inventada', title: 'Sala Inventada', data: { kind: 'lugar' } },
			{ actor: 'admin-prueba' }
		);
		expect(await getVenueRule(t.db, venue.id)).toBeNull();
		await saveVenueRule(t.db, {
			venueId: venue.id,
			rule: { kind: 'porcentaje_minimo', pct: 25, minKind: 'hora', hours: 3, rate: 10000 },
			by: 'admin-prueba'
		});
		expect(await getVenueRule(t.db, venue.id)).toEqual({
			kind: 'porcentaje_minimo',
			pct: 25,
			minKind: 'hora',
			hours: 0,
			rate: 10000
		});
	});
});

describe('accountsReady', () => {
	it('con la migración 0078 aplicada, sí', async () => {
		expect(await accountsReady(t.db)).toBe(true);
	});

	it('si falta una de sus tablas (una base sin la migración), no', async () => {
		const missing = {
			prepare: () => ({ bind: () => ({ first: async () => ({ n: ACCOUNT_TABLES.length - 1 }) }) })
		};
		expect(await accountsReady(/** @type {any} */ (missing))).toBe(false);
	});
});
