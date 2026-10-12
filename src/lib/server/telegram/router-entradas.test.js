/**
 * «🎟 Mis entradas» en el bot: la lista, la tarjeta con el QR, sin vincular, en grupos, con las
 * cuentas o el bot apagados, la paginación y los botones armados a mano (nunca la entrada de otra
 * cuenta). Cuentas y entradas de mentira (sin base): lo de la base está en
 * `entradas-privacy.test.js`. Datos inventados.
 */
import { inflateSync } from 'node:zlib';
import { describe, expect, it, vi } from 'vitest';
import { planUpdate } from './router.js';
import { runPlan } from './run.js';
import { handleWebhook } from './webhook.js';
import { encodeNav, decodeNav } from './nav.js';
import { TICKETS } from './bot.fixtures.js';
import { isPastTicket, ticketsForView } from './misEntradas.js';

const ORIGIN = 'https://ejemplo.test';
const NOW = Date.parse('2031-01-08T12:00:00-03:00');
const PRIVATE = { id: 42, type: 'private' };
const GROUP = { id: -100, type: 'supergroup' };

/** @typedef {import('./tickets.js').BotTicket} BotTicket */
/** @typedef {import('./tickets.js').BotTickets} BotTickets */

/** @param {{ linked?: boolean, tickets?: BotTicket[] }} [o] */
function fakeTickets({ linked = true, tickets = TICKETS } = {}) {
	return {
		accountFor: vi.fn(
			/** @type {BotTickets['accountFor']} */ (async () => (linked ? 'cuenta-inventada' : null))
		),
		list: vi.fn(/** @type {BotTickets['list']} */ (async () => tickets))
	};
}

/**
 * @param {ReturnType<typeof fakeTickets> | null} tickets `null`: «Lo que sigo» apagado (sin cuentas)
 * @param {{ media?: boolean }} [o]
 */
const deps = (tickets, { media = false } = {}) => ({
	listUpcoming: async () => [],
	origin: ORIGIN,
	now: () => NOW,
	botUsername: 'BotDePrueba',
	media,
	accounts: vi.fn(async () =>
		tickets ? { link: vi.fn(), unlink: vi.fn(), setMuted: vi.fn(), tickets } : null
	)
});

/** @param {string} data @param {object} [chat] @param {object} [extra] */
const tap = (data, chat = PRIVATE, extra = {}) => ({
	callback_query: {
		id: 'cb',
		from: { id: 77 },
		data,
		message: { message_id: 9, chat, ...extra }
	}
});
/** @param {string} text @param {object} [chat] */
const msg = (text, chat = PRIVATE) => ({ message: { chat, from: { id: 77 }, text } });

/** @param {any} plan @returns {any[]} */
const buttons = (plan) => plan?.steps.at(-1)?.reply_markup?.inline_keyboard?.flat() ?? [];

/** Lo que dice el plan (texto o pie de foto). @param {any} plan */
const said = (plan) => {
	const s = plan?.steps.at(-1);
	return String(s?.text ?? s?.caption ?? s?.media?.caption ?? '');
};

describe('la lista', () => {
	it('/entradas: las de los próximos eventos, por evento, con un botón por entrada', async () => {
		const t = fakeTickets();
		const p = await planUpdate(msg('/entradas'), deps(t));
		expect(p?.steps[0].method).toBe('sendMessage');
		expect(said(p)).toContain('Tus entradas');
		expect(said(p)).toContain('Taller de cuerdas</b> · 2 entradas');
		expect(said(p)).toContain('Charla inventada</b> · 1 entrada');
		// La del evento que ya pasó, no.
		expect(said(p)).not.toContain('Fiesta pasada');
		expect(buttons(p).map((b) => b.callback_data)).toEqual([
			'tk:tk1:u',
			'tk:tk2:u',
			'tk:tk3:u',
			't:o:0',
			'h'
		]);
		// La cuenta se mira con el chat de este mensaje, en cada mensaje.
		expect(t.accountFor).toHaveBeenCalledWith(42);
		expect(t.list).toHaveBeenCalledWith('cuenta-inventada');
	});

	it('el botón «🎟 Mis entradas» del inicio abre lo mismo (y edita el mensaje)', async () => {
		const home = await planUpdate(tap('h'), deps(fakeTickets()));
		expect(buttons(home)).toContainEqual({ text: '🎟 Mis entradas', callback_data: 't:u:0' });
		const p = await planUpdate(tap('t:u:0'), deps(fakeTickets()));
		expect(p?.steps[0].method).toBe('editMessageText');
		expect(said(p)).toContain('Taller de cuerdas');
	});

	it('«🕘 Pasadas»: las de eventos que ya pasaron, con «🎟 Próximas»', async () => {
		const p = await planUpdate(tap('t:o:0'), deps(fakeTickets()));
		expect(said(p)).toContain('Tus entradas pasadas');
		expect(said(p)).toContain('Fiesta pasada');
		expect(said(p)).not.toContain('Taller de cuerdas');
		expect(buttons(p)).toContainEqual({ text: '🎟 Próximas', callback_data: 't:u:0' });
	});

	it('sin entradas: lo dice, con «🕘 Pasadas» e «🏠 Inicio»', async () => {
		const p = await planUpdate(msg('/entradas'), deps(fakeTickets({ tickets: [] })));
		expect(said(p)).toContain('No tenés entradas para los próximos eventos');
		expect(buttons(p).map((b) => b.callback_data)).toEqual(['t:o:0', 'h']);
		const past = await planUpdate(tap('t:o:0'), deps(fakeTickets({ tickets: [] })));
		expect(said(past)).toContain('No tenés entradas de eventos que ya pasaron');
	});

	it('muchas: de a 5, con «‹ 2/3 ›», y una página de más va a la última', async () => {
		const many = Array.from({ length: 12 }, (_, i) => ({
			...TICKETS[0],
			id: `m${i}`,
			holder: `Persona ${i}`
		}));
		const p0 = await planUpdate(tap('t:u:0'), deps(fakeTickets({ tickets: many })));
		expect(said(p0)).toContain('· 1/3');
		expect(said(p0)).toContain('· 12 entradas');
		expect(buttons(p0).filter((b) => b.callback_data?.startsWith('tk:'))).toHaveLength(5);
		expect(buttons(p0)).toContainEqual({ text: '1/3', disabled: {} });
		expect(buttons(p0)).toContainEqual({ text: '›', callback_data: 't:u:1' });
		const p2 = await planUpdate(tap('t:u:2'), deps(fakeTickets({ tickets: many })));
		expect(buttons(p2).filter((b) => b.callback_data?.startsWith('tk:'))).toHaveLength(2);
		expect(buttons(p2)).toContainEqual({ text: '‹', callback_data: 't:u:1' });
		const p9 = await planUpdate(tap('t:u:99'), deps(fakeTickets({ tickets: many })));
		expect(said(p9)).toContain('· 3/3');
	});

	it('`/start mis-entradas` (el link desde un grupo) abre la lista', async () => {
		const p = await planUpdate(msg('/start mis-entradas'), deps(fakeTickets()));
		expect(said(p)).toContain('Tus entradas');
	});
});

describe('la tarjeta de una entrada', () => {
	it('sin token del bot: el texto, sin foto, con «Ver la entrada» a su página', async () => {
		const p = await planUpdate(tap('tk:tk1:u'), deps(fakeTickets()));
		expect(p?.steps[0].method).toBe('editMessageText');
		expect(said(p)).toContain('Persona Inventada (elle)');
		expect(said(p)).toContain('código <b>ABC 234</b>');
		expect(said(p)).toContain('Válida');
		expect(said(p)).toContain('Tocá «Ver la entrada» para ver el QR.');
		expect(buttons(p)).toContainEqual({
			text: '🔗 Ver la entrada',
			url: `${ORIGIN}/entradas/t/${'A'.repeat(43)}`
		});
		expect(buttons(p)).toContainEqual({ text: '1/3', disabled: {} });
		expect(buttons(p)).toContainEqual({ text: '‹ Volver', callback_data: 't:u:0' });
	});

	it('con token: el QR como foto subida, el mismo que el de su página (editMessageMedia)', async () => {
		const p = await planUpdate(tap('tk:tk1:u'), deps(fakeTickets(), { media: true }));
		const step = /** @type {any} */ (p?.steps[0]);
		expect(step.method).toBe('editMessageMedia');
		expect(step.media).toMatchObject({ type: 'photo', media: 'attach://qr', parse_mode: 'HTML' });
		expect(step.media.caption).toContain('Válida');
		expect(step.media.caption).not.toContain('Tocá «Ver la entrada»');
		expect(step.qr).toMatchObject({ filename: 'entrada.png', type: 'image/png' });
		const png = Buffer.from(step.qr.upload);
		expect(png.subarray(1, 4).toString('latin1')).toBe('PNG');
		// Un PNG que se lee (el contenido del QR lo prueba qr.test.js).
		const idat = png.indexOf('IDAT');
		const len = png.readUInt32BE(idat - 4);
		expect(() => inflateSync(png.subarray(idat + 4, idat + 4 + len))).not.toThrow();
		// Si Telegram no la acepta: la misma tarjeta como texto (sin foto).
		expect(p?.fallback?.[0].method).toBe('editMessageText');
	});

	it('con token, por comando nuevo o sin mensaje que editar: sendPhoto con el archivo', async () => {
		const p = await planUpdate(
			{
				callback_query: { id: 'cb', from: { id: 77 }, data: 'tk:tk1:u', message: { chat: PRIVATE } }
			},
			deps(fakeTickets(), { media: true })
		);
		const step = /** @type {any} */ (p?.steps[0]);
		expect(step.method).toBe('sendPhoto');
		expect(step.photo).toMatchObject({ filename: 'entrada.png', type: 'image/png' });
	});

	it('de la foto a la lista: borra la foto y manda la lista', async () => {
		const p = await planUpdate(
			tap('t:u:0', PRIVATE, { photo: [{ file_id: 'x' }] }),
			deps(fakeTickets(), { media: true })
		);
		expect(p?.steps.map((s) => s.method)).toEqual(['deleteMessage', 'sendMessage']);
	});

	it('una entrada ya usada dice cuándo ingresó; una online, sin QR', async () => {
		const used = await planUpdate(tap('tk:tk2:u'), deps(fakeTickets(), { media: true }));
		expect(said(used)).toContain('Ya se usó');
		const online = await planUpdate(tap('tk:tk3:u'), deps(fakeTickets(), { media: true }));
		expect(online?.steps[0].method).toBe('editMessageText');
		expect(said(online)).toContain('Es online');
		expect(JSON.stringify(online)).not.toContain('attach://');
	});

	it('un botón viejo de una entrada que ya pasó abre la tarjeta y vuelve a «Pasadas»', async () => {
		const p = await planUpdate(tap('tk:tk4:u'), deps(fakeTickets()));
		expect(said(p)).toContain('Fiesta pasada');
		expect(buttons(p)).toContainEqual({ text: '‹ Volver', callback_data: 't:o:0' });
	});

	it('nunca loguea el token de una entrada', async () => {
		const log = vi.spyOn(console, 'log').mockImplementation(() => {});
		const err = vi.spyOn(console, 'error').mockImplementation(() => {});
		const plan = await planUpdate(tap('tk:tk1:u'), deps(fakeTickets(), { media: true }));
		await runPlan(plan, async () => ({ ok: false, status: 400, description: 'x' }));
		const logged = JSON.stringify([...log.mock.calls, ...err.mock.calls]);
		expect(logged).not.toContain('A'.repeat(20));
		log.mockRestore();
		err.mockRestore();
	});
});

describe('privacidad: solo las entradas de la cuenta de este chat', () => {
	it('un botón armado a mano con el id de otra entrada: el aviso de siempre, nada más', async () => {
		const t = fakeTickets();
		for (const data of ['tk:otra1:u', 'tk:otra1:o', 'tk:zzzzzzz:u']) {
			const p = await planUpdate(tap(data), deps(t));
			expect(p).toEqual({ steps: [], callback: { id: 'cb', text: 'Esa entrada ya no está acá.' } });
		}
	});

	it('el botón de una entrada, en un chat vinculado a otra cuenta, no la muestra', async () => {
		// La cuenta del chat 43 no tiene la entrada tk1 (es de la cuenta del chat 42).
		const t = {
			accountFor: vi.fn(
				/** @type {BotTickets['accountFor']} */ (
					async (chat) => (chat === 42 ? 'cuenta-inventada' : 'otra-cuenta-inventada')
				)
			),
			list: vi.fn(
				/** @type {BotTickets['list']} */ (
					async (account) => (account === 'cuenta-inventada' ? TICKETS : [])
				)
			)
		};
		const p = await planUpdate(tap('tk:tk1:u', { id: 43, type: 'private' }), deps(t));
		expect(p).toEqual({ steps: [], callback: { id: 'cb', text: 'Esa entrada ya no está acá.' } });
		expect(t.list).toHaveBeenCalledWith('otra-cuenta-inventada');
		expect(t.list).not.toHaveBeenCalledWith('cuenta-inventada');
	});

	it('callback_data roto o de otra forma: no se entiende, sin mirar ninguna cuenta', async () => {
		const t = fakeTickets();
		for (const data of [
			'tk:tk1',
			'tk:tk1:x',
			'tk::u',
			'tk:TK1:u',
			'tk:tk1:u:extra',
			`tk:${'A'.repeat(43)}:u`,
			't:x:0',
			't:u:-1',
			't:u:1000',
			'tk:../../u'
		]) {
			expect(decodeNav(data), data).toBeNull();
			const p = await planUpdate(tap(data), deps(t));
			expect(p?.steps).toEqual([]);
		}
		expect(t.accountFor).not.toHaveBeenCalled();
		expect(t.list).not.toHaveBeenCalled();
	});

	it('sin vincular: cómo conectar la cuenta, sin leer entradas', async () => {
		const t = fakeTickets({ linked: false });
		for (const update of [msg('/entradas'), tap('t:u:0'), tap('tk:tk1:u')]) {
			const p = await planUpdate(update, deps(t));
			expect(said(p)).toContain('conectá este chat con tu cuenta');
			expect(buttons(p)).toContainEqual({
				text: 'Abrir Mi rincón → Lo que sigo ↗',
				url: `${ORIGIN}/mi-rincon/sigo`
			});
		}
		expect(t.list).not.toHaveBeenCalled();
	});

	it('en un grupo: link al privado, sin mirar ninguna cuenta ni mostrar nada', async () => {
		const t = fakeTickets();
		const home = await planUpdate(msg('/start', GROUP), deps(t));
		expect(buttons(home)).toContainEqual({
			text: '🎟 Mis entradas ↗',
			url: 'https://t.me/BotDePrueba?start=mis-entradas'
		});
		for (const update of [msg('/entradas', GROUP), tap('t:u:0', GROUP), tap('tk:tk1:u', GROUP)]) {
			const p = await planUpdate(update, deps(t));
			expect(JSON.stringify(p)).not.toContain('Taller de cuerdas');
			expect(JSON.stringify(p)).not.toContain('/entradas/t/');
		}
		expect(t.accountFor).not.toHaveBeenCalled();
		expect(t.list).not.toHaveBeenCalled();
	});
});

describe('interruptores', () => {
	it('con «Lo que sigo» apagado (sin cuentas): sin botón en el inicio y el aviso de siempre', async () => {
		const home = await planUpdate(tap('h'), deps(null));
		expect(JSON.stringify(home)).not.toContain('Mis entradas');
		const cmd = await planUpdate(msg('/entradas'), deps(null));
		expect(said(cmd)).toBe('Todavía no se puede conectar una cuenta con el bot.');
		const btn = await planUpdate(tap('tk:tk1:u'), deps(null));
		expect(btn).toEqual({
			steps: [],
			callback: { id: 'cb', text: 'Todavía no se puede conectar una cuenta con el bot.' }
		});
	});

	it('con el bot apagado (`telegram_bot`): 200 vacío, sin mirar cuentas ni entradas', async () => {
		const t = fakeTickets();
		const accounts = vi.fn(async () => ({
			link: vi.fn(),
			unlink: vi.fn(),
			setMuted: vi.fn(),
			tickets: t
		}));
		const secret = 'un-secreto-de-prueba-largo';
		const res = await handleWebhook({
			request: new Request(`${ORIGIN}/api/telegram`, {
				method: 'POST',
				headers: { 'x-telegram-bot-api-secret-token': secret },
				body: JSON.stringify(tap('tk:tk1:u'))
			}),
			secret,
			enabled: false,
			origin: ORIGIN,
			listUpcoming: async () => [],
			accounts
		});
		expect(res.status).toBe(200);
		expect(await res.text()).toBe('');
		expect(accounts).not.toHaveBeenCalled();
		expect(t.list).not.toHaveBeenCalled();
	});
});

describe('las listas y el callback_data', () => {
	it('próximas hasta 12 horas después del evento; sin fecha, pasadas', () => {
		const t = { ...TICKETS[0], start: '2031-01-08T20:00:00-03:00', end: null };
		expect(isPastTicket(t, Date.parse('2031-01-09T07:59:00-03:00'))).toBe(false);
		expect(isPastTicket(t, Date.parse('2031-01-09T08:01:00-03:00'))).toBe(true);
		const withEnd = { ...t, end: '2031-01-09T04:00:00-03:00' };
		expect(isPastTicket(withEnd, Date.parse('2031-01-09T15:00:00-03:00'))).toBe(false);
		expect(isPastTicket({ ...t, start: null }, NOW)).toBe(true);
	});

	it('las próximas, de la más cercana; las pasadas, de la más reciente', () => {
		expect(ticketsForView('u', TICKETS, NOW).map((t) => t.id)).toEqual(['tk1', 'tk2', 'tk3']);
		expect(ticketsForView('o', TICKETS, NOW).map((t) => t.id)).toEqual(['tk4']);
	});

	it('el callback_data entra en 64 bytes y se lee igual', () => {
		for (const state of /** @type {const} */ ([
			{ screen: 'tickets', view: 'u', page: 999 },
			{ screen: 'ticket', id: 'zzzzzzz', view: 'o' }
		])) {
			const data = encodeNav(state);
			expect(new TextEncoder().encode(data).length).toBeLessThanOrEqual(64);
			expect(decodeNav(data)).toEqual(state);
		}
	});
});
