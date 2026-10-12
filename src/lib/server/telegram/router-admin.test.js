/**
 * «📊 Estado» y «🔔 Mis avisos» en el router (decisión 0041), con dependencias de mentira: solo
 * une admin vinculade, por chat privado, mirado **en cada mensaje y cada botón**. A cualquier otra
 * persona (sin vincular, vinculade pero que ya no es admin, en un grupo, con el interruptor
 * apagado) el bot le contesta exactamente lo mismo que a un comando o un botón que no existen,
 * también con un botón armado a mano. Usuarios y datos inventados.
 */
import { describe, expect, it, vi } from 'vitest';
import { ADMIN_COMMAND_NAMES, HANDLED_COMMANDS, commandPayloads } from './commands.js';
import { shortHash } from './nav.js';
import { planUpdate } from './router.js';

const ORIGIN = 'https://ejemplo.test';
const NOW = Date.parse('2031-01-08T12:00:00-03:00');
const ADMIN_TG = 5001;
const OTHER_TG = 6002;
const WHO = { id: 1, login: 'admin-inventade' };

const CHOICES = [
	{
		slug: 'fiesta-inventada',
		hash: shortHash('fiesta-inventada'),
		title: 'Fiesta inventada',
		start: '2031-01-10T23:00:00.000Z',
		today: false,
		cancelled: false
	}
];

const STATUS = {
	types: [{ id: 'general', name: 'General', sold: 7, held: 1, capacity: 20, tiers: [] }],
	sold: 7,
	capacity: 20,
	held: 1,
	expiring: 0,
	transfers: 1,
	review: 0,
	waitlist: null
};

/** @param {{ events?: any[], admins?: number[], fail?: boolean }} [o] */
function fakeAdmin({ events = CHOICES, admins = [ADMIN_TG], fail = false } = {}) {
	/** @type {Set<any>} */
	let on = new Set();
	return {
		who: vi.fn(async (/** @type {number} */ id) => {
			if (fail) throw new Error('sin base');
			return admins.includes(id) ? WHO : null;
		}),
		events: vi.fn(async () => events),
		status: vi.fn(async () => STATUS),
		notices: vi.fn(async () => new Set(on)),
		setNotice: vi.fn(
			async (/** @type {number} */ _id, /** @type {any} */ kind, /** @type {boolean} */ value) => {
				on = new Set(on);
				if (value) on.add(kind);
				else on.delete(kind);
				return new Set(on);
			}
		)
	};
}

/** @param {object} [over] */
const deps = (over = {}) => ({
	listUpcoming: async () => [],
	origin: ORIGIN,
	now: () => NOW,
	botUsername: 'BotDePrueba',
	...over
});

/**
 * @param {string} text
 * @param {{ type?: string, from?: number, chat?: number }} [o]
 */
const msg = (text, { type = 'private', from = ADMIN_TG, chat = from } = {}) => ({
	update_id: 1,
	message: { chat: { id: chat, type }, from: { id: from, is_bot: false }, text }
});

/**
 * @param {string} data
 * @param {{ type?: string, from?: number, chat?: number }} [o]
 */
const tap = (data, { type = 'private', from = ADMIN_TG, chat = from } = {}) => ({
	update_id: 1,
	callback_query: {
		id: 'cb',
		from: { id: from },
		data,
		message: { message_id: 9, chat: { id: chat, type } }
	}
});

/** Todo lo de admins que se puede tocar o escribir. */
const ADMIN_TAPS = ['ax:0', 'ax:3', `ae:${CHOICES[0].hash}`, 'ae:zzzz', 'an', 'an:d', 'an:r'];
const ADMIN_TEXTS = ['/estado', '/avisos', '/estado fiesta', '/avisos@BotDePrueba'];

/** El plan de algo que no existe: el mismo para comparar. */
const unknownCommand = (/** @type {any} */ d, /** @type {object} */ o = {}) =>
	planUpdate(msg('/inventado', o), d);
const unknownTap = (/** @type {any} */ d, /** @type {object} */ o = {}) =>
	planUpdate(tap('zzz', o), d);

describe('/estado y /avisos', () => {
	it('no están en el menú «/» de nadie ni entre los comandos de todes', () => {
		for (const name of ADMIN_COMMAND_NAMES) {
			expect(HANDLED_COMMANDS.has(name), name).toBe(false);
			for (const accounts of [true, false]) {
				for (const p of commandPayloads({ accounts })) {
					expect(
						p.commands.some((c) => c.command === name),
						name
					).toBe(false);
				}
			}
		}
	});

	it('une admin vinculade: la lista de eventos y sus avisos', async () => {
		const admin = fakeAdmin();
		const estado = /** @type {any} */ (await planUpdate(msg('/estado'), deps({ admin })));
		expect(estado.steps[0].method).toBe('sendMessage');
		expect(estado.steps[0].text).toContain('Estado de la venta');
		expect(estado.steps[0].text).toContain('<b>Fiesta inventada</b>');
		expect(estado.steps[0].reply_markup.inline_keyboard[0][0]).toEqual({
			text: '📊 Fiesta inventada',
			callback_data: `ae:${CHOICES[0].hash}`
		});
		const avisos = /** @type {any} */ (await planUpdate(msg('/avisos'), deps({ admin })));
		expect(avisos.steps[0].text).toContain('Tus avisos de admin');
		expect(admin.who).toHaveBeenCalledTimes(2);
		expect(admin.who).toHaveBeenCalledWith(ADMIN_TG);
	});

	it('sin próximos eventos con entradas: lo dice', async () => {
		const admin = fakeAdmin({ events: [] });
		const r = /** @type {any} */ (await planUpdate(msg('/estado'), deps({ admin })));
		expect(r.steps[0].text).toContain('No hay eventos con venta de entradas');
	});

	it('cualquier otra persona: lo mismo que un comando que no existe', async () => {
		const admin = fakeAdmin();
		/** @type {[string, any, object][]} */
		const cases = [
			['sin vincular (o vinculade pero ya no admin)', deps({ admin }), { from: OTHER_TG }],
			['interruptor apagado', deps({ admin: null }), {}],
			['sin la dependencia', deps(), {}],
			['en un grupo', deps({ admin }), { type: 'group', chat: -100 }],
			['en un supergrupo', deps({ admin }), { type: 'supergroup', chat: -100 }],
			['en un canal', deps({ admin }), { type: 'channel', chat: -100 }],
			['un chat privado de otra persona', deps({ admin }), { chat: OTHER_TG }],
			['si no se puede mirar', deps({ admin: fakeAdmin({ fail: true }) }), {}]
		];
		for (const [name, d, o] of cases) {
			const expected = await unknownCommand(d, o);
			for (const text of ADMIN_TEXTS) {
				expect(await planUpdate(msg(text, o), d), `${name}: ${text}`).toEqual(expected);
			}
		}
		expect(admin.events).not.toHaveBeenCalled();
		expect(admin.notices).not.toHaveBeenCalled();
	});
});

describe('los botones de admins', () => {
	it('une admin: el estado del evento, solo con cantidades, y el permiso se mira en cada botón', async () => {
		const admin = fakeAdmin();
		const d = deps({ admin });
		const r = /** @type {any} */ (await planUpdate(tap(`ae:${CHOICES[0].hash}`), d));
		expect(r.steps[0].method).toBe('editMessageText');
		expect(r.steps[0].text).toContain('🎟 <b>General</b>: 7 de 20 vendidas');
		expect(r.steps[0].text).toContain('💸 Transferencias por confirmar: 1');
		expect(r.steps[0].reply_markup.inline_keyboard[0][1]).toEqual({
			text: 'Ver en el panel ↗',
			url: `${ORIGIN}/admin/eventos/fiesta-inventada`
		});
		await planUpdate(tap('ax:0'), d);
		await planUpdate(tap('an'), d);
		expect(admin.who).toHaveBeenCalledTimes(3);
	});

	it('un evento que ya no está (o un hash armado a mano): aviso, sin cambiar el mensaje', async () => {
		const r = await planUpdate(tap('ae:zzzz'), deps({ admin: fakeAdmin() }));
		expect(r).toEqual({
			steps: [],
			callback: { id: 'cb', text: 'Ese evento ya no está disponible.' }
		});
	});

	it('prender y apagar un aviso', async () => {
		const admin = fakeAdmin();
		const d = deps({ admin });
		const on = /** @type {any} */ (await planUpdate(tap('an:t'), d));
		expect(on.callback).toEqual({ id: 'cb', text: 'Prendido: Cada transferencia' });
		expect(on.steps[0].reply_markup.inline_keyboard[2][0].text).toBe('✅ Cada transferencia');
		expect(admin.setNotice).toHaveBeenCalledWith(WHO.id, 'transferencia', true);
		const off = /** @type {any} */ (await planUpdate(tap('an:t'), d));
		expect(off.callback.text).toBe('Apagado: Cada transferencia');
		expect(admin.setNotice).toHaveBeenLastCalledWith(WHO.id, 'transferencia', false);
	});

	it('botones armados a mano por quien no es admin: lo mismo que un botón roto, sin tocar nada', async () => {
		const admin = fakeAdmin();
		/** @type {[string, any, object][]} */
		const cases = [
			['sin vincular (o vinculade pero ya no admin)', deps({ admin }), { from: OTHER_TG }],
			['interruptor apagado', deps({ admin: null }), {}],
			['sin la dependencia', deps(), {}],
			['en un grupo', deps({ admin }), { type: 'group', chat: -100 }],
			['un chat privado de otra persona', deps({ admin }), { chat: OTHER_TG }],
			['si no se puede mirar', deps({ admin: fakeAdmin({ fail: true }) }), {}]
		];
		for (const [name, d, o] of cases) {
			const expected = await unknownTap(d, o);
			expect(expected).toEqual({ steps: [], callback: { id: 'cb', text: expect.any(String) } });
			for (const data of ADMIN_TAPS) {
				expect(await planUpdate(tap(data, o), d), `${name}: ${data}`).toEqual(expected);
			}
		}
		expect(admin.events).not.toHaveBeenCalled();
		expect(admin.status).not.toHaveBeenCalled();
		expect(admin.notices).not.toHaveBeenCalled();
		expect(admin.setNotice).not.toHaveBeenCalled();
	});

	it('si sacan a le admin de la lista, el próximo botón ya no anda', async () => {
		const admin = fakeAdmin();
		const d = deps({ admin });
		const ok = /** @type {any} */ (await planUpdate(tap('ax:0'), d));
		expect(ok.steps[0].text).toContain('Estado de la venta');
		admin.who.mockResolvedValue(null);
		expect(await planUpdate(tap('ax:0'), d)).toEqual(await unknownTap(d));
	});

	it('si falla la base en el medio: «algo salió mal», sin datos', async () => {
		const admin = fakeAdmin();
		admin.status.mockRejectedValue(new Error('D1 caída'));
		const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
		const r = await planUpdate(tap(`ae:${CHOICES[0].hash}`), deps({ admin }));
		expect(r).toEqual({
			steps: [],
			callback: { id: 'cb', text: 'Algo salió mal de nuestro lado. Probá de nuevo en un rato.' }
		});
		expect(JSON.stringify(spy.mock.calls)).not.toContain('D1 caída');
		spy.mockRestore();
	});
});

describe('el inicio', () => {
	/** @param {any} plan */
	const rows = (plan) => plan.steps[0].reply_markup.inline_keyboard;
	const ADMIN_ROW = [
		{ text: '📊 Estado', callback_data: 'ax:0' },
		{ text: '🔔 Mis avisos', callback_data: 'an' }
	];

	it('une admin vinculade, por privado: «📊 Estado · 🔔 Mis avisos»', async () => {
		const r = await planUpdate(msg('/start'), deps({ admin: fakeAdmin() }));
		expect(rows(r)).toContainEqual(ADMIN_ROW);
		const tapHome = await planUpdate(tap('h'), deps({ admin: fakeAdmin() }));
		expect(rows(tapHome)).toContainEqual(ADMIN_ROW);
	});

	it('nadie más lo ve (y el inicio queda igual que sin esto)', async () => {
		const plain = await planUpdate(msg('/start'), deps());
		for (const [d, o] of /** @type {[any, object][]} */ ([
			[deps({ admin: fakeAdmin() }), { from: OTHER_TG }],
			[deps({ admin: null }), {}],
			[deps({ admin: fakeAdmin({ fail: true }) }), {}]
		])) {
			expect(await planUpdate(msg('/start', o), d)).toEqual(
				await planUpdate(msg('/start', o), deps())
			);
		}
		expect(JSON.stringify(plain)).not.toContain('ax:0');
		const group = await planUpdate(
			msg('/start', { type: 'group', chat: -100 }),
			deps({ admin: fakeAdmin() })
		);
		expect(JSON.stringify(group)).not.toContain('ax:0');
	});

	it('vincular con solo «Telegram para admins» prendido (sin la puerta): sin el botón de la puerta', async () => {
		const r = /** @type {any} */ (
			await planUpdate(
				msg('/start adm_ABCD2345'),
				deps({
					adminLink: async () => ({ linked: 'admin-inventade' }),
					door: null,
					admin: fakeAdmin()
				})
			)
		);
		expect(r.steps[0].text).toContain('quedó vinculado');
		expect(rows(r)).toEqual([ADMIN_ROW]);
	});

	it('con la puerta y «Telegram para admins»: los dos', async () => {
		const r = /** @type {any} */ (
			await planUpdate(
				msg('/start adm_ABCD2345'),
				deps({
					adminLink: async () => ({ linked: 'admin-inventade' }),
					door: async () => true,
					admin: fakeAdmin()
				})
			)
		);
		expect(rows(r)).toEqual([
			[{ text: '🚪 Abrir la puerta', web_app: { url: `${ORIGIN}/telegram/puerta` } }],
			ADMIN_ROW
		]);
	});
});
