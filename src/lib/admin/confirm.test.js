import { afterEach, describe, expect, it, vi } from 'vitest';
import { askConfirm, askConfirmCheck, registerConfirm } from './confirm.js';

afterEach(() => {
	registerConfirm(null);
	vi.unstubAllGlobals();
});

describe('askConfirm', () => {
	it('usa el diálogo registrado y devuelve su respuesta', async () => {
		const handler = vi.fn(async () => true);
		registerConfirm(handler);
		const opts = { title: '¿Borrar esta nota?', confirmLabel: 'Borrar', tone: 'danger' };
		await expect(askConfirm(/** @type {any} */ (opts))).resolves.toBe(true);
		expect(handler).toHaveBeenCalledWith(opts);
	});

	it('sin diálogo montado cae en window.confirm con título y texto', async () => {
		const confirm = vi.fn(() => false);
		vi.stubGlobal('window', { confirm });
		await expect(
			askConfirm({ title: '¿Cancelar KV-1?', text: 'Se libera el cupo.' })
		).resolves.toBe(false);
		expect(confirm).toHaveBeenCalledWith('¿Cancelar KV-1?\n\nSe libera el cupo.');
	});

	it('en el servidor (sin window) no confirma nada', async () => {
		vi.stubGlobal('window', undefined);
		await expect(askConfirm({ title: 'x' })).resolves.toBe(false);
	});
});

describe('askConfirmCheck (con casilla)', () => {
	const opts = { title: '¿Terminar?', check: { label: 'Mandarle un mail', checked: true } };

	it('devuelve lo que contestó el diálogo, casilla incluida', async () => {
		registerConfirm(async () => ({ ok: true, checked: false }));
		await expect(askConfirmCheck(opts)).resolves.toEqual({ ok: true, checked: false });
		registerConfirm(async () => ({ ok: true, checked: true }));
		await expect(askConfirmCheck(opts)).resolves.toEqual({ ok: true, checked: true });
		await expect(askConfirm(opts)).resolves.toBe(true);
	});

	it('si se cancela, la casilla no cuenta', async () => {
		registerConfirm(async () => ({ ok: false, checked: true }));
		await expect(askConfirmCheck(opts)).resolves.toEqual({ ok: false, checked: false });
		await expect(askConfirm(opts)).resolves.toBe(false);
	});

	it('sin diálogo montado, la casilla queda como arranca', async () => {
		vi.stubGlobal('window', { confirm: () => true });
		await expect(askConfirmCheck(opts)).resolves.toEqual({ ok: true, checked: true });
		await expect(askConfirmCheck({ title: 'x' })).resolves.toEqual({ ok: true, checked: false });
	});
});
