/**
 * La cuenta de cada evento en la base (cuentas.js, migración 0078): guardar sin pisar a otre
 * admin, cerrar (y no guardar más), reabrir, el resumen del año y la regla por defecto de un
 * lugar. Eventos, lugares y personas inventados.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import { saveObject } from '$lib/server/objects/save.js';
import { emptyAccount, newPart } from '$lib/admin/reparto.js';
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
	extras: 0,
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
		const data = {
			...emptyAccount(),
			parts: [newPart({ id: 'a', name: 'Facilitadore A', role: 'facilita' })]
		};
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
		expect(saved?.data.parts[0].name).toBe('Facilitadore A');
	});

	it('una cuenta guardada con el reparto de antes se lee como partes', async () => {
		// Como quedó guardada antes de que el reparto fuera una lista de partes.
		const old = {
			...emptyAccount(),
			parts: undefined,
			loss: undefined,
			people: [{ id: 'a', name: 'Facilitadore A', team: false, pct: null }],
			coproducers: [],
			split: { productionPct: 30, mode: 'iguales', lossBy: 'todes' }
		};
		await t.db
			.prepare(
				`INSERT INTO event_accounts (event_slug, data, version, created_at, created_by, updated_at, updated_by)
				VALUES (?1, ?2, 1, 0, 'x', 0, 'x')`
			)
			.bind(SLUG, JSON.stringify(old))
			.run();
		const saved = await getAccount(t.db, SLUG);
		expect(saved?.data.loss).toBe('todes');
		expect(saved?.data.parts.map((p) => [p.id, p.rule, p.pct])).toEqual([
			['caja', 'pct', 30],
			['a', 'resto', 0]
		]);
		expect(saved?.data).not.toHaveProperty('people');
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

	it('los extras de un cierre salen de la foto (sin columna); los cierres de antes dan 0', async () => {
		await closeAccount(t.db, {
			slug: 'con-extras',
			title: 'Con extras',
			date: '2026-11-01',
			summary: { ...summary, extras: 6000, income_total: 206000 },
			snapshot: { income: { extras: 6000, rows: [] }, data: {} },
			by: 'x'
		});
		// Dos cerrados antes de los extras: su foto no los tiene (o ni tiene lo que entró).
		await closeAccount(t.db, {
			slug: 'de-antes',
			title: 'De antes',
			date: '2026-11-02',
			summary,
			snapshot: { income: { rows: [] }, data: {} },
			by: 'x'
		});
		await closeAccount(t.db, {
			slug: 'sin-ingresos',
			title: 'Sin ingresos',
			date: '2026-11-03',
			summary,
			snapshot: {},
			by: 'x'
		});
		expect(
			(await listClosings(t.db, 2026)).map((r) => [r.event_slug, r.extras, r.income_total])
		).toEqual([
			['con-extras', 6000, 206000],
			['de-antes', 0, 200000],
			['sin-ingresos', 0, 200000]
		]);
		expect((await getClosing(t.db, 'con-extras'))?.extras).toBe(6000);
		expect((await getClosing(t.db, 'de-antes'))?.extras).toBe(0);
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

describe('accountState, listClosingsBetween y listClosingSnapshots', async () => {
	const { accountState, listClosingsBetween, listClosingSnapshots } = await import('./cuentas.js');

	it('sin cuenta, empezada y cerrada', async () => {
		expect(await accountState(t.db, SLUG)).toEqual({ state: 'none' });
		await saveAccount(t.db, { slug: SLUG, data: emptyAccount(), version: 0, by: 'x' });
		expect(await accountState(t.db, SLUG)).toEqual({ state: 'open' });
		await closeAccount(t.db, {
			slug: SLUG,
			title: 'Taller de prueba',
			date: '2026-09-20',
			summary,
			snapshot: { income: { rows: [] }, data: {} },
			by: 'x'
		});
		const closed = await accountState(t.db, SLUG);
		expect(closed.state).toBe('closed');
		expect(closed.state === 'closed' && closed.closing.profit).toBe(130000);
	});

	it('los cierres entre dos fechas (o todos) y las fotos de un año', async () => {
		for (const [slug, date] of [
			['a-2025', '2025-12-31'],
			['b-2026', '2026-01-01'],
			['c-2026', '2026-06-15']
		]) {
			await closeAccount(t.db, {
				slug,
				title: slug,
				date,
				summary,
				snapshot: { income: { rows: [] } },
				by: 'x'
			});
		}
		expect((await listClosingsBetween(t.db, null, null)).map((r) => r.event_slug)).toEqual([
			'a-2025',
			'b-2026',
			'c-2026'
		]);
		expect(
			(await listClosingsBetween(t.db, '2026-01-01', '2026-06-15')).map((r) => r.event_slug)
		).toEqual(['b-2026']);
		expect(await listClosingSnapshots(t.db, 2026)).toEqual([
			{ event_slug: 'b-2026', caja: 84500, snapshot: { income: { rows: [] } } },
			{ event_slug: 'c-2026', caja: 84500, snapshot: { income: { rows: [] } } }
		]);
	});
});
