/**
 * Los avisos para admins, PR 2 (decisión 0041): el resumen diario y los avisos de cada venta y
 * cada transferencia. D1 de miniflare; datos INVENTADOS (el repo es público).
 *
 * - a quién: solo admins vinculades, todavía en `ADMINS`, que prendieron ese aviso;
 * - los textos: solo cantidades, el evento, el tipo y el tramo; ningún dato de quien compra
 *   (aunque estén todos en la base y en la orden);
 * - nada dos veces (`telegram_admin_sent`), y si Telegram falla se suelta para reintentar;
 * - los interruptores, el token, la hora del resumen y el horario de silencio.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const env = vi.hoisted(() => /** @type {Record<string, string | undefined>} */ ({}));
vi.mock('$env/dynamic/private', () => ({ env }));

import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import { ADMINS } from '$lib/server/auth';
import { clearFlagCache, setFlag } from '$lib/server/flags.js';
import { setAdminNotice } from './adminData.js';

const {
	ADMIN_DAILY_HOUR,
	SENT_KEEP_MS,
	argentinaDate,
	claimNotice,
	dailySummaryText,
	dailyWindow,
	isDailyTime,
	notifyOrder,
	orderSummary,
	queueOrderNotice,
	runAdminNoticesCron,
	saleNoticeText,
	transferNoticeText
} = await import('./adminNotify.js');

vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

const ORIGIN = 'https://ejemplo.test';
const SLUG = 'fiesta-inventada';
/** 8/1/2031 a las 9:05 de Argentina: ya es hora del resumen. */
const MORNING = Date.parse('2031-01-08T09:05:00-03:00');
/** 8/1/2031 a las 15:00 de Argentina. */
const AFTERNOON = Date.parse('2031-01-08T15:00:00-03:00');
const ADMIN = { id: ADMINS[0].id, login: ADMINS[0].login };
const OTHER_ADMIN = { id: ADMINS[1].id, login: ADMINS[1].login };
/** Une vinculade que no está (o ya no está) en ADMINS. */
const EX_ADMIN = { id: Math.max(...ADMINS.map((a) => a.id)) + 12_345, login: 'ex-admin-inventade' };
const ADMIN_TG = 5001;
const OTHER_TG = 5002;
const EX_TG = 6002;

/** Lo que nunca puede salir por Telegram. */
const SECRETS = [
	'Persona Secreta',
	'secreta@example.com',
	'30111222',
	'Titular Secreto',
	'he/him-secreto',
	'pago-secreto',
	'hash-secreto',
	'detalle-secreto',
	'nota-secreta',
	'tokensecreto',
	'QRS234'
];

const CONFIG = {
	title: 'Fiesta inventada',
	start: '2031-01-10T23:00:00-03:00',
	types: [
		{
			id: 'general',
			name: 'General',
			price: 1000,
			fondo: 0,
			capacity: 50,
			gorra: null,
			tiers: [
				{ id: 'p1', name: 'Preventa 1', price: 800, fondo: 0, quantity: 10, until: null },
				{ id: 'final', name: 'Final', price: 1000, fondo: 0, quantity: null, until: null }
			]
		},
		{ id: 'gorra', name: 'A la gorra', price: 0, fondo: 0, capacity: null, gorra: null }
	]
};
const config = async (/** @type {string} */ slug) =>
	slug === SLUG ? /** @type {any} */ (CONFIG) : null;
const list = async () => [{ slug: SLUG, config: /** @type {any} */ (CONFIG) }];

/** @type {Awaited<ReturnType<typeof createTestDB>>} */
let t;
beforeAll(async () => {
	t = await createTestDB();
});
afterAll(async () => {
	await t?.dispose();
});

let seq = 0;
/**
 * Una orden con todos los datos personales inventados (que nunca tienen que salir).
 *
 * @param {{ type?: string, tier?: string | null, quantity?: number, status: string,
 *   method?: string, at: number, createdAt?: number, expiresAt?: number, channel?: string }} o
 */
async function order({
	type = 'general',
	tier = null,
	quantity = 1,
	status,
	method = 'mercadopago',
	at,
	createdAt = at,
	expiresAt = at + 86_400_000,
	channel = 'online'
}) {
	const id = `00000000-0000-4000-9000-${String(++seq).padStart(12, '0')}`;
	await t.db
		.prepare(
			`INSERT INTO orders (id, event_slug, ticket_type, ticket_tier, quantity, unit_price, subtotal,
				total, buyer_name, buyer_pronouns, buyer_email, buyer_dni, holders, status,
				payment_method, mp_payment_id, review_detail, client_hash, admin_note, channel,
				created_at, updated_at, expires_at)
			VALUES (?1, ?2, ?3, ?4, ?5, 1000, ?6, ?6, 'Persona Secreta', 'he/him-secreto',
				'secreta@example.com', '30111222', '[{"name":"Titular Secreto","pronouns":""}]', ?7, ?8,
				'pago-secreto', 'detalle-secreto', 'hash-secreto', 'nota-secreta', ?9, ?10, ?11, ?12)`
		)
		.bind(
			id,
			SLUG,
			type,
			tier,
			quantity,
			1000 * quantity,
			status,
			method,
			channel,
			createdAt,
			at,
			expiresAt
		)
		.run();
	const row = await t.db.prepare('SELECT * FROM orders WHERE id = ?1').bind(id).first();
	return /** @type {any} */ (row);
}

/** @param {number} telegramUserId @param {{ id: number, login: string }} who */
async function link(telegramUserId, who) {
	await t.db
		.prepare(
			'INSERT INTO telegram_admin_links (telegram_user_id, github_id, github_login, linked_at) VALUES (?1, ?2, ?3, ?4)'
		)
		.bind(String(telegramUserId), who.id, who.login, MORNING - 86_400_000)
		.run();
}

/** Un Telegram de mentira: guarda lo que se mandó a cada chat. */
function telegram(result = /** @type {'sent' | 'failed' | 'blocked'} */ ('sent')) {
	/** @type {{ chatId: string, text: string, panelUrl: string | null, silent?: boolean }[]} */
	const sent = [];
	return {
		sent,
		/** @type {import('./adminNotify.js').AdminSend} */
		send: async (chatId, message) => {
			sent.push({ chatId, ...message });
			return result;
		}
	};
}

/** @param {string} text */
function expectNoSecrets(text) {
	for (const s of SECRETS) expect(text, s).not.toContain(s);
}

async function flagsOn() {
	await setFlag(t.db, 'telegram_bot', true, { by: 'prueba' });
	await setFlag(t.db, 'telegram_admin', true, { by: 'prueba' });
	clearFlagCache();
}

beforeEach(async () => {
	await resetDB(t.db);
	clearFlagCache();
	seq = 0;
	for (const k of Object.keys(env)) delete env[k];
	await link(ADMIN_TG, ADMIN);
	await link(OTHER_TG, OTHER_ADMIN);
	await link(EX_TG, EX_ADMIN);
});

// ---------------------------------------------------------------------------------------------

describe('la hora del resumen', () => {
	it(`sale desde las ${ADMIN_DAILY_HOUR} de Argentina y hasta el horario de silencio`, () => {
		expect(isDailyTime(Date.parse('2031-01-08T08:59:00-03:00'))).toBe(false);
		expect(isDailyTime(Date.parse('2031-01-08T09:00:00-03:00'))).toBe(true);
		expect(isDailyTime(AFTERNOON)).toBe(true);
		expect(isDailyTime(Date.parse('2031-01-08T23:10:00-03:00'))).toBe(false);
	});

	it('la ventana va de las 9 de ayer a las 9 de hoy (hora de Argentina)', () => {
		const w = dailyWindow(AFTERNOON);
		expect(w.date).toBe('2031-01-08');
		expect(w.to).toBe(Date.parse('2031-01-08T09:00:00-03:00'));
		expect(w.from).toBe(Date.parse('2031-01-07T09:00:00-03:00'));
		// A las 2 de la mañana de Argentina ya es otro día en UTC, pero no en Argentina.
		expect(argentinaDate(Date.parse('2031-01-08T23:30:00-03:00'))).toBe('2031-01-08');
	});
});

describe('los textos: solo cantidades', () => {
	const summary = orderSummary(
		/** @type {any} */ ({
			quantity: 1,
			ticket_type: 'general',
			ticket_tier: 'p1',
			buyer_name: 'Persona Secreta',
			buyer_email: 'secreta@example.com',
			buyer_dni: '30111222',
			holders: '[{"name":"Titular Secreto"}]'
		}),
		/** @type {any} */ (CONFIG.types[0])
	);

	it('el resumen de la orden solo lleva cantidad, tipo y tramo', () => {
		expect(summary).toEqual({ quantity: 1, typeName: 'General', tierName: 'Preventa 1' });
	});

	it('cada venta', () => {
		const text = saleNoticeText({ summary, eventTitle: 'Fiesta X', sold: 23, capacity: 50 });
		expect(text).toBe('🎟 Se vendió 1 General (Preventa 1) de <b>Fiesta X</b> · 23/50');
		expect(
			saleNoticeText({
				summary: { quantity: 3, typeName: 'A la gorra', tierName: null },
				eventTitle: 'Fiesta X',
				sold: 7,
				capacity: null
			})
		).toBe('🎟 Se vendieron 3 A la gorra de <b>Fiesta X</b> · 7');
	});

	it('cada transferencia', () => {
		expect(
			transferNoticeText({
				summary: { quantity: 2, typeName: 'General', tierName: null },
				eventTitle: 'Fiesta X',
				pending: 3
			})
		).toBe('💸 Transferencia para confirmar: 2 General de <b>Fiesta X</b> · 3 por confirmar');
	});

	it('escapa el título del evento', () => {
		const text = saleNoticeText({
			summary,
			eventTitle: '<b>Fiesta</b> & más',
			sold: 1,
			capacity: null
		});
		expect(text).toContain('&lt;b&gt;Fiesta&lt;/b&gt; &amp; más');
	});
});

describe('cada venta y cada transferencia', () => {
	beforeEach(async () => {
		await setAdminNotice(t.db, ADMIN.id, 'cada_venta', true);
		await setAdminNotice(t.db, EX_ADMIN.id, 'cada_venta', true);
		await setAdminNotice(t.db, OTHER_ADMIN.id, 'transferencia', true);
	});

	it('la venta llega solo a quien la prendió y sigue en ADMINS, una sola vez', async () => {
		await order({ tier: 'p1', quantity: 2, status: 'approved', at: AFTERNOON - 60_000 });
		const sold = await order({ tier: 'p1', status: 'approved', at: AFTERNOON });
		const tg = telegram();
		const r = await notifyOrder({
			db: t.db,
			kind: 'cada_venta',
			order: sold,
			origin: ORIGIN,
			send: tg.send,
			now: AFTERNOON,
			config
		});
		expect(r).toEqual({ sent: 1, failed: 0, skipped: 0 });
		expect(tg.sent).toEqual([
			{
				chatId: String(ADMIN_TG),
				text: '🎟 Se vendió 1 General (Preventa 1) de <b>Fiesta inventada</b> · 3/50',
				panelUrl: `${ORIGIN}/admin/eventos/${SLUG}`,
				silent: false
			}
		]);
		// Otra vez la misma orden (un webhook repetido, dos clicks): no sale de nuevo.
		const again = await notifyOrder({
			db: t.db,
			kind: 'cada_venta',
			order: sold,
			origin: ORIGIN,
			send: tg.send,
			now: AFTERNOON,
			config
		});
		expect(again).toEqual({ sent: 0, failed: 0, skipped: 1 });
		expect(tg.sent).toHaveLength(1);
	});

	it('la transferencia llega a quien prendió «Cada transferencia», sin datos de quien compra', async () => {
		await order({ status: 'awaiting_transfer', method: 'transferencia', at: AFTERNOON - 1 });
		const tr = await order({
			quantity: 2,
			status: 'awaiting_transfer',
			method: 'transferencia',
			at: AFTERNOON
		});
		const tg = telegram();
		await notifyOrder({
			db: t.db,
			kind: 'transferencia',
			order: tr,
			origin: ORIGIN,
			send: tg.send,
			now: AFTERNOON,
			config
		});
		expect(tg.sent.map((m) => m.chatId)).toEqual([String(OTHER_TG)]);
		expect(tg.sent[0].text).toBe(
			'💸 Transferencia para confirmar: 2 General de <b>Fiesta inventada</b> · 2 por confirmar'
		);
		expectNoSecrets(JSON.stringify(tg.sent));
	});

	it('si Telegram falla, se suelta (puede reintentarse); si bloqueó al bot, no', async () => {
		const sold = await order({ status: 'approved', at: AFTERNOON });
		const failing = telegram('failed');
		const args = {
			db: t.db,
			kind: /** @type {const} */ ('cada_venta'),
			order: sold,
			origin: ORIGIN,
			now: AFTERNOON,
			config
		};
		expect(await notifyOrder({ ...args, send: failing.send })).toEqual({
			sent: 0,
			failed: 1,
			skipped: 0
		});
		const ok = telegram();
		expect(await notifyOrder({ ...args, send: ok.send })).toEqual({
			sent: 1,
			failed: 0,
			skipped: 0
		});
		const other = await order({ status: 'approved', at: AFTERNOON });
		const blocked = telegram('blocked');
		await notifyOrder({ ...args, order: other, send: blocked.send });
		await notifyOrder({ ...args, order: other, send: ok.send });
		expect(ok.sent).toHaveLength(1);
	});

	it('las ventas de la puerta y las cargadas a mano no avisan', async () => {
		const tg = telegram();
		for (const channel of ['puerta', 'manual']) {
			const o = await order({
				status: 'approved',
				method: channel === 'puerta' ? 'efectivo' : 'otro',
				channel,
				at: AFTERNOON
			});
			expect(
				await notifyOrder({
					db: t.db,
					kind: 'cada_venta',
					order: o,
					origin: ORIGIN,
					send: tg.send,
					now: AFTERNOON,
					config
				})
			).toBeNull();
		}
		expect(tg.sent).toEqual([]);
	});

	it('en el horario de silencio sale igual, pero sin sonido', async () => {
		const night = Date.parse('2031-01-09T02:00:00-03:00');
		const sold = await order({ status: 'approved', at: night });
		const tg = telegram();
		await notifyOrder({
			db: t.db,
			kind: 'cada_venta',
			order: sold,
			origin: ORIGIN,
			send: tg.send,
			now: night,
			config
		});
		expect(tg.sent[0].silent).toBe(true);
	});

	it('sin nadie que lo prendió, ni consulta el evento', async () => {
		await setAdminNotice(t.db, ADMIN.id, 'cada_venta', false);
		const sold = await order({ status: 'approved', at: AFTERNOON });
		const spy = vi.fn(/** @type {any} */ (config));
		expect(
			await notifyOrder({
				db: t.db,
				kind: 'cada_venta',
				order: sold,
				origin: ORIGIN,
				send: telegram().send,
				config: spy
			})
		).toBeNull();
		expect(spy).not.toHaveBeenCalled();
	});
});

describe('queueOrderNotice (lo que llaman los flujos de compra)', () => {
	/** Telegram por fetch: guarda los cuerpos de sendMessage. */
	function telegramFetch(status = 200) {
		/** @type {any[]} */
		const bodies = [];
		/** @type {typeof fetch} */
		const fetchFn = async (input, init) => {
			expect(String(input)).toMatch(/^https:\/\/api\.telegram\.org\/bot.+\/sendMessage$/);
			bodies.push(JSON.parse(String(init?.body)));
			return new Response(JSON.stringify({ ok: status === 200 }), { status });
		};
		return { bodies, fetchFn };
	}

	beforeEach(async () => {
		await setAdminNotice(t.db, ADMIN.id, 'cada_venta', true);
	});

	it('con los interruptores apagados o sin token no manda nada', async () => {
		const sold = await order({ status: 'approved', at: Date.now() });
		const tg = telegramFetch();
		env.TELEGRAM_BOT_TOKEN = 'token-inventado';
		await queueOrderNotice({
			db: t.db,
			kind: 'cada_venta',
			order: sold,
			origin: ORIGIN,
			fetch: tg.fetchFn
		});
		await flagsOn();
		delete env.TELEGRAM_BOT_TOKEN;
		await queueOrderNotice({
			db: t.db,
			kind: 'cada_venta',
			order: sold,
			origin: ORIGIN,
			fetch: tg.fetchFn
		});
		expect(tg.bodies).toEqual([]);
	});

	it('prendido: un sendMessage al chat privado, con «Ver en el panel ↗»; nunca tira', async () => {
		await flagsOn();
		env.TELEGRAM_BOT_TOKEN = 'token-inventado';
		const sold = await order({ status: 'approved', at: Date.now() });
		const tg = telegramFetch();
		/** @type {Promise<unknown>[]} */
		const background = [];
		const platform = /** @type {any} */ ({
			ctx: { waitUntil: (/** @type {Promise<unknown>} */ p) => background.push(p) }
		});
		await queueOrderNotice({
			db: t.db,
			platform,
			kind: 'cada_venta',
			order: sold,
			origin: ORIGIN,
			fetch: tg.fetchFn,
			config
		});
		expect(background).toHaveLength(1);
		await Promise.all(background);
		expect(tg.bodies).toHaveLength(1);
		const body = tg.bodies[0];
		expect(body).toMatchObject({
			chat_id: String(ADMIN_TG),
			parse_mode: 'HTML',
			text: '🎟 Se vendió 1 General de <b>Fiesta inventada</b> · 1/50',
			reply_markup: {
				inline_keyboard: [[{ text: 'Ver en el panel ↗', url: `${ORIGIN}/admin/eventos/${SLUG}` }]]
			}
		});
		expectNoSecrets(JSON.stringify(tg.bodies));
		// Un evento que ya no vende entradas: nada, y no tira.
		await queueOrderNotice({
			db: t.db,
			kind: 'cada_venta',
			order: { ...sold, id: 'otra', event_slug: 'otro-evento' },
			origin: ORIGIN,
			fetch: tg.fetchFn,
			config
		});
		expect(tg.bodies).toHaveLength(1);
		// Una base rota tampoco tira.
		await expect(
			queueOrderNotice({
				db: /** @type {any} */ ({
					prepare: () => {
						throw new Error('base rota inventada');
					}
				}),
				kind: 'cada_venta',
				order: sold,
				origin: ORIGIN,
				fetch: tg.fetchFn
			})
		).resolves.toBeUndefined();
	});
});

describe('el resumen diario (cron)', () => {
	beforeEach(async () => {
		await flagsOn();
		await setAdminNotice(t.db, ADMIN.id, 'resumen_diario', true);
		await setAdminNotice(t.db, EX_ADMIN.id, 'resumen_diario', true);
		const yesterday = Date.parse('2031-01-07T18:00:00-03:00');
		// Desde ayer a las 9: 2 vendidas en Preventa 1, 1 a la gorra y una transferencia nueva.
		await order({ tier: 'p1', quantity: 2, status: 'approved', at: yesterday });
		await order({ type: 'gorra', status: 'approved', at: yesterday + 1 });
		await order({
			status: 'awaiting_transfer',
			method: 'transferencia',
			at: yesterday + 2,
			expiresAt: MORNING + 3 * 3_600_000
		});
		// De antes (no cuenta como «desde ayer», sí en el total).
		await order({ tier: 'p1', status: 'approved', at: yesterday - 2 * 86_400_000 });
	});

	const run = (/** @type {object} */ over = {}) =>
		runAdminNoticesCron({ db: t.db, origin: ORIGIN, token: 'x', now: MORNING, list, ...over });

	it('a las 9: un resumen por evento con movimiento, solo a quien lo prendió', async () => {
		const tg = telegram();
		expect(await run({ send: tg.send })).toEqual({ sent: 1, failed: 0, events: 1 });
		expect(tg.sent).toHaveLength(1);
		expect(tg.sent[0].chatId).toBe(String(ADMIN_TG));
		expect(tg.sent[0].panelUrl).toBe(`${ORIGIN}/admin/eventos/${SLUG}`);
		const text = tg.sent[0].text;
		expect(text).toContain('☀️ <b>Resumen diario · Fiesta inventada</b>');
		expect(text).toContain('🎟 Desde ayer a las 9:00: 3 vendidas · en total: 4');
		expect(text).toContain('💸 Transferencias nuevas desde ayer: 1');
		expect(text).toContain('⏳ Reservas sin pagar: 1 · vencen en las próximas 24 horas: 1');
		expect(text).toContain('💸 Transferencias por confirmar: 1');
		expectNoSecrets(text);
	});

	it('no se repite en el día (ni en la corrida siguiente), y al otro día sí', async () => {
		const tg = telegram();
		await run({ send: tg.send });
		expect(await run({ send: tg.send, now: MORNING + 15 * 60_000 })).toEqual({
			sent: 0,
			failed: 0,
			events: 0
		});
		expect(tg.sent).toHaveLength(1);
		await order({ status: 'approved', at: MORNING + 3_600_000 });
		await run({ send: tg.send, now: MORNING + 86_400_000 });
		expect(tg.sent).toHaveLength(2);
	});

	it('si Telegram falla, se reintenta en la corrida siguiente', async () => {
		expect(await run({ send: telegram('failed').send })).toEqual({
			sent: 0,
			failed: 1,
			events: 1
		});
		const tg = telegram();
		await run({ send: tg.send, now: MORNING + 15 * 60_000 });
		expect(tg.sent).toHaveLength(1);
	});

	it('sin movimiento desde ayer, nada', async () => {
		await t.db.prepare('DELETE FROM orders').run();
		await order({ status: 'approved', at: MORNING - 5 * 86_400_000 });
		const tg = telegram();
		expect(await run({ send: tg.send })).toEqual({ sent: 0, failed: 0, events: 0 });
		expect(tg.sent).toEqual([]);
	});

	it('antes de las 9, con los interruptores apagados, sin token o sin nadie: nada', async () => {
		const tg = telegram();
		expect(await run({ send: tg.send, now: Date.parse('2031-01-08T08:50:00-03:00') })).toEqual({
			skipped: 'hour'
		});
		await setAdminNotice(t.db, ADMIN.id, 'resumen_diario', false);
		expect(await run({ send: tg.send })).toEqual({ skipped: 'nobody' });
		expect(await run({ token: undefined })).toEqual({ skipped: 'token' });
		await setFlag(t.db, 'telegram_admin', false, { by: 'prueba' });
		clearFlagCache();
		expect(await run({ send: tg.send })).toEqual({ skipped: 'off' });
		expect(tg.sent).toEqual([]);
	});

	it('borra lo enviado hace más de 30 días', async () => {
		await claimNotice(t.db, ADMIN.id, 'venta:vieja', MORNING - SENT_KEEP_MS - 1);
		await claimNotice(t.db, ADMIN.id, 'venta:nueva', MORNING - 1);
		await run({ send: telegram().send });
		const { results } = await t.db
			.prepare("SELECT notice_key FROM telegram_admin_sent WHERE notice_key LIKE 'venta:%'")
			.all();
		expect(results.map((r) => r.notice_key)).toEqual(['venta:nueva']);
	});

	it('el texto, sin lista de espera ni pendientes', () => {
		const text = dailySummaryText(
			{
				title: 'Fiesta X',
				start: 'no es una fecha',
				soldSince: 2,
				newTransfers: 0,
				status: {
					types: [],
					sold: 23,
					capacity: 50,
					held: 0,
					expiring: 0,
					transfers: 0,
					review: 0,
					waitlist: null
				}
			},
			MORNING
		);
		expect(text).toBe(
			[
				'☀️ <b>Resumen diario · Fiesta X</b>',
				'🎟 Desde ayer a las 9:00: 2 vendidas · en total: 23/50',
				'✅ Sin reservas sin pagar ni nada para revisar.',
				'Solo cantidades: lo de cada compra está en el panel.'
			].join('\n\n')
		);
	});
});
