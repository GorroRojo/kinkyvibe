/**
 * Los comandos de la cuenta (fase 2): /vincular, /desvincular, /silenciar y /reanudar, solo por
 * chat privado y con la fase 2 prendida. Cuentas de mentira (sin base): lo de la base se prueba
 * en link.test.js.
 */
import { describe, expect, it, vi } from 'vitest';
import { handleUpdate } from './router.js';

const ORIGIN = 'https://ejemplo.test';

/**
 * @param {string} text
 * @param {string} [type]
 */
const update = (text, type = 'private') => ({
	update_id: 1,
	message: { chat: { id: 42, type }, text }
});

/** @param {{ link?: 'linked' | 'invalid' | 'too_many', linked?: boolean }} [o] */
function fakeAccounts({ link = 'linked', linked = true } = {}) {
	return {
		link: vi.fn(async () => link),
		unlink: vi.fn(async () => linked),
		setMuted: vi.fn(async () => linked)
	};
}

/** @param {ReturnType<typeof fakeAccounts> | null} accounts */
const deps = (accounts) => ({
	listUpcoming: async () => [],
	origin: ORIGIN,
	accounts: vi.fn(async () => accounts)
});

describe('/vincular', () => {
	it('con un código bueno conecta el chat y manda a Lo que sigo', async () => {
		const accounts = fakeAccounts();
		const res = await handleUpdate(update('/vincular abcd-2345'), deps(accounts));
		expect(accounts.link).toHaveBeenCalledWith('abcd-2345', 42);
		expect(res?.text).toContain('quedó conectado');
		expect(res?.text).toContain('https://ejemplo.test/mi-rincon/sigo');
		expect(res?.text).toContain('/silenciar');
	});

	it('código malo, vencido o usado: lo dice sin dar detalles', async () => {
		const res = await handleUpdate(
			update('/vincular ZZZZ-ZZZZ'),
			deps(fakeAccounts({ link: 'invalid' }))
		);
		expect(res?.text).toContain('Ese código no sirve');
		expect(res?.text).toContain('15 minutos');
	});

	it('muchos intentos: pide esperar', async () => {
		const res = await handleUpdate(
			update('/vincular ZZZZ-ZZZZ'),
			deps(fakeAccounts({ link: 'too_many' }))
		);
		expect(res?.text).toContain('Esperá un rato');
	});

	it('sin código: explica dónde está', async () => {
		const accounts = fakeAccounts();
		const res = await handleUpdate(update('/vincular'), deps(accounts));
		expect(res?.text).toContain('Mi rincón → Lo que sigo');
		expect(accounts.link).not.toHaveBeenCalled();
	});

	it('el link t.me/<bot>?start=<código> llega como /start <código> y también vincula', async () => {
		const accounts = fakeAccounts();
		const res = await handleUpdate(update('/start ABCD2345'), deps(accounts));
		expect(accounts.link).toHaveBeenCalledWith('ABCD2345', 42);
		expect(res?.text).toContain('quedó conectado');
	});

	it('/start sin código sigue siendo la ayuda', async () => {
		const accounts = fakeAccounts();
		const res = await handleUpdate(update('/start'), deps(accounts));
		expect(res?.text).toContain('Podés pedirme');
		expect(accounts.link).not.toHaveBeenCalled();
	});
});

describe('solo por chat privado', () => {
	for (const type of ['group', 'supergroup', 'channel']) {
		it(`en un ${type} no vincula ni toca nada`, async () => {
			const accounts = fakeAccounts();
			const d = deps(accounts);
			for (const cmd of [
				'/vincular ABCD-2345',
				'/desvincular',
				'/silenciar',
				'/reanudar',
				'/start ABCD2345'
			]) {
				const res = await handleUpdate(update(cmd, type), d);
				expect(res?.text).toContain('chat privado');
			}
			expect(accounts.link).not.toHaveBeenCalled();
			expect(accounts.unlink).not.toHaveBeenCalled();
			expect(accounts.setMuted).not.toHaveBeenCalled();
		});
	}
});

describe('/desvincular, /silenciar, /reanudar', () => {
	it('con el chat vinculado', async () => {
		const accounts = fakeAccounts();
		const d = deps(accounts);
		expect((await handleUpdate(update('/silenciar'), d))?.text).toContain('pausé');
		expect(accounts.setMuted).toHaveBeenLastCalledWith(42, true);
		expect((await handleUpdate(update('/reanudar'), d))?.text).toContain('volver a recibir');
		expect(accounts.setMuted).toHaveBeenLastCalledWith(42, false);
		expect((await handleUpdate(update('/desvincular'), d))?.text).toContain('desconecté');
		expect(accounts.unlink).toHaveBeenCalledWith(42);
	});

	it('sin chat vinculado: cómo vincularlo', async () => {
		const d = deps(fakeAccounts({ linked: false }));
		for (const cmd of ['/silenciar', '/reanudar', '/desvincular']) {
			expect((await handleUpdate(update(cmd), d))?.text).toContain('no está conectado');
		}
	});
});

describe('con la fase 2 apagada', () => {
	it('los comandos de la cuenta avisan que todavía no se puede', async () => {
		for (const cmd of ['/vincular ABCD-2345', '/desvincular', '/silenciar', '/reanudar']) {
			const res = await handleUpdate(update(cmd), deps(null));
			expect(res?.text).toContain('Todavía no se puede conectar');
		}
	});

	it('sin `accounts` (como en la fase 1) tampoco', async () => {
		const res = await handleUpdate(update('/vincular ABCD-2345'), {
			listUpcoming: async () => [],
			origin: ORIGIN
		});
		expect(res?.text).toContain('Todavía no se puede conectar');
	});

	it('la ayuda nombra los comandos de la cuenta solo con la fase 2 prendida', async () => {
		const on = await handleUpdate(update('/ayuda'), deps(fakeAccounts()));
		expect(on?.text).toContain('/vincular &lt;código&gt;');
		expect(on?.text).toContain('/silenciar');
		const off = await handleUpdate(update('/ayuda'), deps(null));
		expect(off?.text).not.toContain('/vincular');
	});
});

describe('errores', () => {
	it('si falla la base, contesta un error sin detalles', async () => {
		const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
		const accounts = fakeAccounts();
		accounts.link.mockRejectedValueOnce(new Error('secreto interno'));
		const res = await handleUpdate(update('/vincular ABCD-2345'), deps(accounts));
		expect(res?.text).toContain('Algo salió mal');
		expect(res?.text).not.toContain('secreto interno');
		spy.mockRestore();
	});
});
