/**
 * Permisos de «Seguir» y «Lo que sigo» en el bot (decisión 0034): solo por chat privado, con
 * «Lo que sigo» prendido y el chat vinculado. En un grupo nunca escribe ni muestra nada personal.
 * Cuentas de mentira (sin base): lo de la base está en seguir.test.js.
 */
import { describe, expect, it, vi } from 'vitest';
import { planUpdate } from './router.js';

const ORIGIN = 'https://ejemplo.test';
const EVENTS = [
	{ slug: 'fiesta-inventada', title: 'Fiesta inventada', start: '2031-01-10T23:00:00-03:00' }
];
const TARGETS = [
	{ key: 'Serie Inventada', title: 'Serie Inventada', series: true, hash: 'abc12' },
	{ key: 'cuerdas', title: '🪢 Cuerdas', series: false, hash: 'def34' }
];

/** @param {{ linked?: boolean, followResult?: any }} [o] */
function fakeFollows({ linked = true, followResult = 'created' } = {}) {
	return {
		accountFor: vi.fn(async () => (linked ? 'cuenta-inventada' : null)),
		targets: vi.fn(async () => TARGETS),
		following: vi.fn(async () => new Set(['cuerdas'])),
		follow: vi.fn(async () => followResult),
		titles: vi.fn(async () => ['Serie Inventada', '🪢 Cuerdas'])
	};
}

/** @param {ReturnType<typeof fakeFollows> | null} follows */
const deps = (follows) => ({
	listUpcoming: async () => EVENTS,
	origin: ORIGIN,
	botUsername: 'BotDePrueba',
	accounts: vi.fn(async () =>
		follows ? { link: vi.fn(), unlink: vi.fn(), setMuted: vi.fn(), follows } : null
	)
});

const PRIVATE = { id: 42, type: 'private' };
const GROUP = { id: -100, type: 'supergroup' };

/** @param {string} data @param {object} [chat] */
const tap = (data, chat = PRIVATE) => ({
	callback_query: { id: 'cb', from: { id: 77 }, data, message: { message_id: 9, chat } }
});
/** @param {string} text @param {object} [chat] */
const msg = (text, chat = PRIVATE) => ({ message: { chat, from: { id: 77 }, text } });

/** @param {any} plan */
const buttons = (plan) => plan?.steps[0]?.reply_markup?.inline_keyboard.flat() ?? [];

describe('el botón «Seguir» en la tarjeta', () => {
	it('en privado abre las opciones', async () => {
		const p = await planUpdate(tap('e:fiesta-inventada:p'), deps(fakeFollows()));
		expect(buttons(p)).toContainEqual({ text: '⭐ Seguir', callback_data: 'f:fiesta-inventada' });
	});

	it('en un grupo es un link al privado (?start=seguir-…)', async () => {
		const p = await planUpdate(tap('e:fiesta-inventada:p', GROUP), deps(fakeFollows()));
		expect(buttons(p)).toContainEqual({
			text: '⭐ Seguir ↗',
			url: 'https://t.me/BotDePrueba?start=seguir-fiesta-inventada'
		});
		expect(JSON.stringify(p)).not.toContain('f:fiesta-inventada');
	});

	it('con «Lo que sigo» apagado no aparece', async () => {
		const p = await planUpdate(tap('e:fiesta-inventada:p'), deps(null));
		expect(JSON.stringify(p)).not.toContain('Seguir');
	});
});

describe('seguir', () => {
	it('privado y vinculado: opciones, con lo ya seguido deshabilitado', async () => {
		const f = fakeFollows();
		const p = await planUpdate(tap('f:fiesta-inventada'), deps(f));
		expect(p?.steps[0].method).toBe('editMessageText');
		expect(buttons(p)).toContainEqual({
			text: '⭐ Serie Inventada',
			callback_data: 'fy:fiesta-inventada:abc12'
		});
		expect(buttons(p)).toContainEqual({ text: '✓ Ya seguís 🪢 Cuerdas', disabled: {} });
		expect(f.accountFor).toHaveBeenCalledWith(42);
		expect(f.follow).not.toHaveBeenCalled();
	});

	it('tocar una etiqueta la sigue y lo dice en el aviso del botón', async () => {
		const f = fakeFollows();
		const p = await planUpdate(tap('fy:fiesta-inventada:abc12'), deps(f));
		expect(f.follow).toHaveBeenCalledWith('cuenta-inventada', 'Serie Inventada');
		expect(p?.callback?.text).toBe('Listo: ahora seguís Serie Inventada.');
	});

	it('si se prendieron los avisos por Telegram, lo dice en una línea más', async () => {
		const p = await planUpdate(
			tap('fy:fiesta-inventada:abc12'),
			deps(fakeFollows({ followResult: 'created_telegram' }))
		);
		expect(p?.callback?.text).toBe(
			'Listo: ahora seguís Serie Inventada.\n' +
				'Te aviso por acá cuando haya algo nuevo. Podés apagarlo en Mi rincón.'
		);
	});

	it('si no se prendieron (ya los tenía, /silenciar o ya lo seguía), no promete avisos', async () => {
		for (const followResult of ['created', 'already']) {
			const p = await planUpdate(
				tap('fy:fiesta-inventada:abc12'),
				deps(fakeFollows({ followResult }))
			);
			expect(p?.callback?.text).not.toContain('Te aviso');
		}
	});

	it('topes del sitio: muchos cambios o demasiadas cosas seguidas', async () => {
		const many = await planUpdate(
			tap('fy:fiesta-inventada:abc12'),
			deps(fakeFollows({ followResult: 'too_many' }))
		);
		expect(many?.callback?.text).toContain('Esperá un rato');
		const full = await planUpdate(
			tap('fy:fiesta-inventada:abc12'),
			deps(fakeFollows({ followResult: 'full' }))
		);
		expect(full?.callback?.text).toContain('máximo');
	});

	it('un hash de etiqueta que no es del evento no sigue nada', async () => {
		const f = fakeFollows();
		const p = await planUpdate(tap('fy:fiesta-inventada:zzz99'), deps(f));
		expect(f.follow).not.toHaveBeenCalled();
		expect(p?.steps).toEqual([]);
	});

	it('privado sin vincular: explica cómo conectar, no escribe', async () => {
		const f = fakeFollows({ linked: false });
		const p = await planUpdate(tap('fy:fiesta-inventada:abc12'), deps(f));
		expect(f.follow).not.toHaveBeenCalled();
		expect(p?.steps[0].text).toContain('/vincular');
	});

	it('en un grupo nunca escribe ni mira la cuenta: link al privado', async () => {
		const f = fakeFollows();
		for (const data of ['fy:fiesta-inventada:abc12', 'f:fiesta-inventada', 'g']) {
			const p = await planUpdate(tap(data, GROUP), deps(f));
			expect(JSON.stringify(p)).toContain('https://t.me/BotDePrueba?start=sigo');
			expect(JSON.stringify(p)).not.toContain('Cuerdas');
		}
		expect(f.follow).not.toHaveBeenCalled();
		expect(f.accountFor).not.toHaveBeenCalled();
		expect(f.titles).not.toHaveBeenCalled();
	});

	it('con «Lo que sigo» apagado: no se puede', async () => {
		const p = await planUpdate(tap('fy:fiesta-inventada:abc12'), deps(null));
		expect(p?.callback?.text).toContain('Todavía no se puede');
	});

	it('el deep link ?start=seguir-<id> abre las opciones en privado', async () => {
		const f = fakeFollows();
		const p = await planUpdate(msg('/start seguir-fiesta-inventada'), deps(f));
		expect(p?.steps[0].method).toBe('sendMessage');
		expect(p?.steps[0].text).toContain('⭐ Seguir');
		expect(f.follow).not.toHaveBeenCalled();
	});
});

describe('Lo que sigo', () => {
	it('/sigo en privado vinculado: lo que sigue la cuenta', async () => {
		const p = await planUpdate(msg('/sigo'), deps(fakeFollows()));
		expect(p?.steps[0].text).toContain('• 🪢 Cuerdas');
	});

	it('/sigo en un grupo: nada personal', async () => {
		const f = fakeFollows();
		const p = await planUpdate(msg('/sigo', GROUP), deps(f));
		expect(JSON.stringify(p)).not.toContain('Cuerdas');
		expect(f.titles).not.toHaveBeenCalled();
	});

	it('el inicio trae «Lo que sigo» solo con el interruptor; en grupos como link', async () => {
		const on = await planUpdate(msg('/start'), deps(fakeFollows()));
		expect(buttons(on)).toContainEqual({ text: '⭐ Lo que sigo', callback_data: 'g' });
		const group = await planUpdate(msg('/start', GROUP), deps(fakeFollows()));
		expect(buttons(group)).toContainEqual({
			text: '⭐ Lo que sigo ↗',
			url: 'https://t.me/BotDePrueba?start=sigo'
		});
		const off = await planUpdate(msg('/start'), deps(null));
		expect(JSON.stringify(off)).not.toContain('Lo que sigo');
	});
});
