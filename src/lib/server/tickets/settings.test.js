import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import {
	getSalesSettings,
	saveSalesSettings,
	transferInfoFromSettings,
	validateSalesSettings
} from './settings.js';

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

// Datos INVENTADOS (el repo es público).
const FORM = {
	transfer_alias: ' EJEMPLO.ALIAS.PRUEBA ',
	transfer_cbu: '0000000000000000000000',
	transfer_holder: 'Nombre   de ejemplo',
	transfer_bank: '',
	mp_fee_percent: '7,73'
};

describe('ajustes de venta', () => {
	it('valida y normaliza el formulario', () => {
		const r = validateSalesSettings(FORM);
		expect(r).toEqual({
			ok: true,
			value: {
				transfer_alias: 'EJEMPLO.ALIAS.PRUEBA',
				transfer_cbu: '0000000000000000000000',
				transfer_holder: 'Nombre de ejemplo',
				transfer_bank: '',
				mp_fee_percent: '7,73'
			}
		});
		const bad = /** @type {any} */ (
			validateSalesSettings({ ...FORM, mp_fee_percent: '80', transfer_alias: 'x'.repeat(61) })
		);
		expect(bad.ok).toBe(false);
		expect(Object.keys(bad.errors).sort()).toEqual(['mp_fee_percent', 'transfer_alias']);
	});

	it('se guardan, se leen y un campo vacío se borra', async () => {
		expect(await getSalesSettings(t.db)).toMatchObject({ transfer_alias: '', updatedAt: null });
		const v = /** @type {any} */ (validateSalesSettings(FORM)).value;
		await saveSalesSettings(t.db, v, { by: 'admin', now: 10 });
		const s = await getSalesSettings(t.db);
		expect(s).toMatchObject({ ...v, updatedAt: 10, updatedBy: 'admin' });
		expect(transferInfoFromSettings(s)).toBe(
			'Alias: EJEMPLO.ALIAS.PRUEBA\nCBU/CVU: 0000000000000000000000\nTitular: Nombre de ejemplo'
		);
		await saveSalesSettings(
			t.db,
			{ ...v, transfer_cbu: '', mp_fee_percent: '' },
			{ by: 'otre', now: 20 }
		);
		const s2 = await getSalesSettings(t.db);
		expect(s2.transfer_cbu).toBe('');
		expect(s2.mp_fee_percent).toBe('');
		expect(s2.transfer_alias).toBe('EJEMPLO.ALIAS.PRUEBA');
	});

	it('sin nada cargado no hay datos de transferencia (se usa la variable de entorno)', async () => {
		expect(transferInfoFromSettings(await getSalesSettings(t.db))).toBeNull();
		expect(transferInfoFromSettings(await getSalesSettings(null))).toBeNull();
	});
});
