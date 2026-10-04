import { afterEach, describe, expect, it, vi } from 'vitest';
import { askConfirm, registerConfirm } from './confirm.js';

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
