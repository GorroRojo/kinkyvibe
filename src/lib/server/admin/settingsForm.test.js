import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import { getSalesSettings, saveSalesSettings } from '$lib/server/tickets/settings.js';
import { SECTIONS, pickSectionFields, saveSectionAction } from './settingsForm.js';

describe('pickSectionFields', () => {
	const form = {
		transfer_alias: 'A',
		mp_fee_percent: '3',
		fondo_percent_override: '10',
		from_email: 'x@example.com',
		reminder_kind_0: 'hours_before',
		reminder_amount_0: '24'
	};
	it('cada página toma solo sus campos', () => {
		expect(pickSectionFields(form, 'cobros')).toEqual({ transfer_alias: 'A', mp_fee_percent: '3' });
		expect(pickSectionFields(form, 'fondo')).toEqual({ fondo_percent_override: '10' });
		expect(pickSectionFields(form, 'mails')).toEqual({
			from_email: 'x@example.com',
			reminder_kind_0: 'hours_before',
			reminder_amount_0: '24'
		});
	});
	it('entre las tres páginas cubren todas las claves editables', () => {
		const keys = Object.values(SECTIONS).flatMap((s) => s.keys);
		expect(new Set(keys).size).toBe(keys.length);
		expect(keys).toHaveLength(9);
	});
});

describe('saveSectionAction', () => {
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

	/** @param {Record<string, string>} fields */
	function event(fields) {
		const body = new FormData();
		for (const [k, v] of Object.entries(fields)) body.set(k, v);
		return /** @type {any} */ ({
			locals: { user: { id: 4594048, login: 'GorroRojo' }, user_token: 'x' },
			url: new URL('http://localhost/admin/ajustes/cobros'),
			platform: t.platform,
			request: new Request('http://localhost', { method: 'POST', body })
		});
	}

	it('guardar una página no borra los ajustes de las otras, y queda en el registro', async () => {
		await saveSalesSettings(t.db, { from_email: 'entradas@example.com' }, { by: 'x' });
		// Un formulario de cobros "con de más" (from_email vacío) no toca los mails.
		const r = await saveSectionAction('cobros')(
			event({ transfer_alias: 'ALIAS.PRUEBA', mp_fee_percent: '', from_email: '' })
		);
		expect(r).toMatchObject({ ok: true });
		const s = await getSalesSettings(t.db);
		expect(s.transfer_alias).toBe('ALIAS.PRUEBA');
		expect(s.from_email).toBe('entradas@example.com');
		const { results } = await t.db.prepare('SELECT action, detail FROM admin_audit').all();
		expect(results).toHaveLength(1);
		expect(results[0].action).toBe('settings.save');
		// Nunca los valores (datos bancarios), solo qué campos.
		expect(String(results[0].detail)).not.toContain('ALIAS.PRUEBA');
	});

	it('un valor inválido no guarda nada', async () => {
		const r = /** @type {any} */ (
			await saveSectionAction('fondo')(event({ fondo_percent_override: '500' }))
		);
		expect(r.status).toBe(400);
		expect(r.data.errors.fondo_percent_override).toBeTruthy();
		expect((await getSalesSettings(t.db)).fondo_percent_override).toBe('');
	});

	it('sin admin, redirige o rechaza', async () => {
		const e = event({ fondo_percent_override: '5' });
		e.locals = { user: null };
		await expect(saveSectionAction('fondo')(e)).rejects.toBeTruthy();
	});
});
