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
				// Solo los campos que vinieron en el formulario (ver el test de abajo).
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

	it('un formulario con solo algunos ajustes no borra los demás', async () => {
		const full = /** @type {any} */ (
			validateSalesSettings({
				...FORM,
				fondo_percent_override: '40',
				from_email: 'Ejemplo <entradas@example.com>',
				reply_to_email: 'respuestas@example.com',
				reminder_kind_0: 'hours_before',
				reminder_amount_0: '24',
				reminder_enabled_0: 'on'
			})
		).value;
		await saveSalesSettings(t.db, full, { by: 'admin', now: 10 });
		const before = await getSalesSettings(t.db);
		expect(before.reminders).toBe('[{"kind":"hours_before","hours":24,"enabled":true}]');

		// Otro formulario (p. ej. una sección del panel) que solo manda los datos de transferencia.
		const partial = validateSalesSettings({
			transfer_alias: 'OTRO.ALIAS.PRUEBA',
			transfer_cbu: ''
		});
		expect(partial).toEqual({
			ok: true,
			value: { transfer_alias: 'OTRO.ALIAS.PRUEBA', transfer_cbu: '' }
		});
		await saveSalesSettings(t.db, /** @type {any} */ (partial).value, { by: 'otre', now: 20 });
		const after = await getSalesSettings(t.db);
		expect(after.transfer_alias).toBe('OTRO.ALIAS.PRUEBA');
		expect(after.transfer_cbu).toBe('');
		expect(after).toMatchObject({
			transfer_holder: 'Nombre de ejemplo',
			mp_fee_percent: '7,73',
			fondo_percent_override: '40',
			from_email: 'Ejemplo <entradas@example.com>',
			reply_to_email: 'respuestas@example.com',
			reminders: before.reminders
		});
	});

	it('sin nada cargado no hay datos de transferencia (se usa la variable de entorno)', async () => {
		expect(transferInfoFromSettings(await getSalesSettings(t.db))).toBeNull();
		expect(transferInfoFromSettings(await getSalesSettings(null))).toBeNull();
	});
});
