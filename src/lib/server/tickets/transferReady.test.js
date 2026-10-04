/**
 * ¿Hay datos para transferir? (`transferReady`, `transferReadyFromSettings`): lo que usan los
 * avisos del editor de eventos y del Inicio cuando «Transferencia» está tildada. Solo sí/no.
 * Datos INVENTADOS (el repo es público).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDB, resetDB } from '$lib/server/db/testing.js';

const env = vi.hoisted(() => /** @type {Record<string, string | undefined>} */ ({}));
vi.mock('$env/dynamic/private', () => ({ env }));

const { transferReady, transferReadyFromSettings } = await import('./index.js');
const { getSalesSettings, saveSalesSettings } = await import('./settings.js');

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
	delete env.TICKETS_TRANSFER_INFO;
});

describe('transferReady', () => {
	it('sin Ajustes → Cobros ni TICKETS_TRANSFER_INFO: no', async () => {
		expect(await transferReady(t.db)).toBe(false);
		expect(await transferReady(null)).toBe(false);
		expect(transferReadyFromSettings(await getSalesSettings(t.db))).toBe(false);
		expect(transferReadyFromSettings(null)).toBe(false);
	});

	it('con un dato en Ajustes → Cobros: sí (y devuelve solo un booleano)', async () => {
		await saveSalesSettings(t.db, { transfer_alias: 'EJEMPLO.ALIAS' }, { by: 'prueba' });
		expect(await transferReady(t.db)).toBe(true);
		expect(transferReadyFromSettings(await getSalesSettings(t.db))).toBe(true);
	});

	it('con TICKETS_TRANSFER_INFO: sí, aunque los ajustes no se hayan podido leer', async () => {
		env.TICKETS_TRANSFER_INFO = 'Alias: EJEMPLO.VARIABLE';
		expect(await transferReady(t.db)).toBe(true);
		expect(transferReadyFromSettings(null)).toBe(true);
		expect(transferReadyFromSettings(await getSalesSettings(t.db))).toBe(true);
	});
});
