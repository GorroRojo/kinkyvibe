/**
 * El aviso de «muchos cambios» del conector de Claude (./avisoCambios.js). D1 de miniflare; datos
 * INVENTADOS (el repo es público).
 *
 * - sale una vez cuando los cambios aplicados en la última hora llegan al umbral, y no otra vez en
 *   la misma hora (aunque sigan llegando cambios); pasada la hora, puede volver a salir;
 * - cuentan solo los aplicados de la última hora (no los rechazados ni los viejos);
 * - a quién: les admins vinculades que prendieron «Cambios de Claude» (como los otros avisos);
 * - el texto: cuántos, quién autorizó y quién confirmó; nada del pedido;
 * - sin Telegram, con el bot apagado o si Telegram falla, nada se traba (y si no le llegó a nadie,
 *   el próximo cambio reintenta).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const env = vi.hoisted(() => /** @type {Record<string, string | undefined>} */ ({}));
vi.mock('$env/dynamic/private', () => ({ env }));

import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import { ADMINS } from '$lib/server/auth';
import { clearFlagCache, setFlag } from '$lib/server/flags.js';
import { logAdminAction } from '$lib/server/admin/audit.js';
import { setAdminNotice } from '$lib/server/telegram/adminData.js';

const { BURST_THRESHOLD, notifyBurst, queueBurstAlert, recentApplies } =
	await import('./avisoCambios.js');
const { connectorBurstText } = await import('$lib/server/telegram/adminNotify.js');

vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

const ORIGIN = 'https://ejemplo.test';
/** 8/1/2031 a las 15:00 de Argentina (fuera del horario de silencio). */
const T0 = Date.parse('2031-01-08T15:00:00-03:00');
const MIN = 60 * 1000;
const ADMIN = { id: ADMINS[0].id, login: ADMINS[0].login };
const OTHER_ADMIN = { id: ADMINS[1].id, login: ADMINS[1].login };
const ADMIN_TG = 5001;
const OTHER_TG = 5002;

/** @type {Awaited<ReturnType<typeof createTestDB>>} */
let t;
beforeAll(async () => {
	t = await createTestDB();
});
afterAll(async () => {
	await t?.dispose();
});

/** @param {number} telegramUserId @param {{ id: number, login: string }} who */
async function link(telegramUserId, who) {
	await t.db
		.prepare(
			'INSERT INTO telegram_admin_links (telegram_user_id, github_id, github_login, linked_at) VALUES (?1, ?2, ?3, ?4)'
		)
		.bind(String(telegramUserId), who.id, who.login, T0 - 86_400_000)
		.run();
}

/**
 * Un `aplicar` anotado en Actividad como lo anota ./rpc.js.
 * @param {number} at
 * @param {{ who?: { id: number, login: string }, confirmedBy?: string | null, ok?: boolean }} [o]
 */
async function applied(at, { who = ADMIN, confirmedBy = null, ok = true } = {}) {
	await logAdminAction(
		t.db,
		{ user: who },
		{
			action: 'conector.aplicar',
			summary: ok ? 'Claude: editó el evento «Fiesta Inventada»' : 'Claude: no se aplicó (cambió)',
			detail: ok
				? {
						operacion: 'editar_evento',
						aplicado: true,
						campos: ['título'],
						confirmado_por: confirmedBy,
						pedido_largo: 30
					}
				: { operacion: 'editar_evento', motivo: 'cambió' }
		},
		{ now: at }
	);
}

/** Un Telegram de mentira. @param {'sent' | 'failed' | 'blocked'} [result] */
function telegram(result = 'sent') {
	/** @type {{ chatId: string, text: string, panelUrl: string | null, silent?: boolean }[]} */
	const sent = [];
	return {
		sent,
		/** @type {import('$lib/server/telegram/adminNotify.js').AdminSend} */
		send: async (chatId, message) => {
			sent.push({ chatId, ...message });
			return result;
		}
	};
}

beforeEach(async () => {
	await resetDB(t.db);
	clearFlagCache();
	for (const k of Object.keys(env)) delete env[k];
	await setFlag(t.db, 'telegram_bot', true, { by: 'prueba' });
	await setFlag(t.db, 'telegram_admin', true, { by: 'prueba' });
	clearFlagCache();
	await link(ADMIN_TG, ADMIN);
	await link(OTHER_TG, OTHER_ADMIN);
	// Solo ADMIN prendió «Cambios de Claude»; OTHER_ADMIN, otro aviso.
	await setAdminNotice(t.db, ADMIN.id, 'conector_claude', true);
	await setAdminNotice(t.db, OTHER_ADMIN.id, 'cada_venta', true);
});

describe('cuenta los cambios aplicados de la última hora', () => {
	it('sin los rechazados ni los de hace más de una hora; con quién autorizó y confirmó', async () => {
		await applied(T0 - 61 * MIN);
		await applied(T0 - 30 * MIN, { confirmedBy: 'Mel' });
		await applied(T0 - 20 * MIN, { ok: false });
		await applied(T0 - 10 * MIN, { who: OTHER_ADMIN, confirmedBy: 'Juan' });
		await applied(T0 - 5 * MIN, { confirmedBy: 'Mel' });
		expect(await recentApplies(t.db, T0)).toEqual({
			count: 3,
			admins: [ADMIN.login, OTHER_ADMIN.login],
			confirmedBy: ['Mel', 'Juan']
		});
	});

	it('el texto: cuántos, quién autorizó y quién confirmó', () => {
		expect(
			connectorBurstText({ count: 20, admins: ['admin-inventade'], confirmedBy: ['Mel', 'Juan'] })
		).toBe(
			'⚠️ Claude aplicó 20 cambios en la última hora desde el conector.\n' +
				'Autorizó: @admin-inventade\nConfirmado por: Mel, Juan'
		);
		expect(connectorBurstText({ count: 21, admins: ['a'], confirmedBy: [] })).toBe(
			'⚠️ Claude aplicó 21 cambios en la última hora desde el conector.\nAutorizó: @a'
		);
	});
});

describe('el aviso', () => {
	it(`sale una vez al llegar a ${BURST_THRESHOLD} en una hora, solo a quien lo prendió`, async () => {
		const tg = telegram();
		// 19 cambios en los últimos 50 minutos: todavía no.
		for (let i = 0; i < BURST_THRESHOLD - 1; i++) {
			await applied(T0 - 50 * MIN + i * MIN, { confirmedBy: i % 2 ? 'Mel' : null });
		}
		expect(await notifyBurst({ db: t.db, send: tg.send, origin: ORIGIN, now: T0 })).toBeNull();
		expect(tg.sent).toHaveLength(0);

		// El 20: sale.
		await applied(T0 + MIN, { who: OTHER_ADMIN });
		const r = await notifyBurst({ db: t.db, send: tg.send, origin: ORIGIN, now: T0 + MIN });
		expect(r).toEqual({ sent: 1, failed: 0 });
		expect(tg.sent).toHaveLength(1);
		expect(tg.sent[0].chatId).toBe(String(ADMIN_TG));
		expect(tg.sent[0].text).toContain(
			`⚠️ Claude aplicó ${BURST_THRESHOLD} cambios en la última hora desde el conector.`
		);
		expect(tg.sent[0].text).toContain(`@${ADMIN.login}, @${OTHER_ADMIN.login}`);
		expect(tg.sent[0].text).toContain('Confirmado por: Mel');
		expect(tg.sent[0].panelUrl).toBe(`${ORIGIN}/admin/ajustes/actividad`);
		expect(tg.sent[0].silent).toBe(false);

		// Más cambios en la misma hora: no vuelve a salir.
		for (let i = 2; i < 12; i++) {
			await applied(T0 + i * MIN);
			expect(
				await notifyBurst({ db: t.db, send: tg.send, origin: ORIGIN, now: T0 + i * MIN })
			).toBeNull();
		}
		expect(tg.sent).toHaveLength(1);

		// Pasada la hora del aviso, con otros 20 en la última hora, puede volver a salir.
		const later = T0 + 2 * 60 * MIN;
		for (let i = 0; i < BURST_THRESHOLD; i++) await applied(later - 30 * MIN + i * MIN);
		expect(await notifyBurst({ db: t.db, send: tg.send, origin: ORIGIN, now: later })).toEqual({
			sent: 1,
			failed: 0
		});
		expect(tg.sent).toHaveLength(2);
	});

	it('sin nadie que lo haya prendido, no sale (ni gasta el aviso de la hora)', async () => {
		await setAdminNotice(t.db, ADMIN.id, 'conector_claude', false);
		for (let i = 0; i < BURST_THRESHOLD; i++) await applied(T0 - i * MIN);
		const tg = telegram();
		expect(await notifyBurst({ db: t.db, send: tg.send, origin: ORIGIN, now: T0 })).toBeNull();
		await setAdminNotice(t.db, ADMIN.id, 'conector_claude', true);
		expect(await notifyBurst({ db: t.db, send: tg.send, origin: ORIGIN, now: T0 + MIN })).toEqual({
			sent: 1,
			failed: 0
		});
	});

	it('si Telegram falla, se suelta y el próximo cambio reintenta', async () => {
		for (let i = 0; i < BURST_THRESHOLD; i++) await applied(T0 - i * MIN);
		const broken = telegram('failed');
		expect(await notifyBurst({ db: t.db, send: broken.send, origin: ORIGIN, now: T0 })).toEqual({
			sent: 0,
			failed: 1
		});
		const tg = telegram();
		await applied(T0 + MIN);
		expect(await notifyBurst({ db: t.db, send: tg.send, origin: ORIGIN, now: T0 + MIN })).toEqual({
			sent: 1,
			failed: 0
		});
	});
});

describe('queueBurstAlert (lo que llama el conector) nunca traba nada', () => {
	/** @param {number} now */
	const ctx = (now) => ({ db: t.db, origin: ORIGIN, now });

	it('sin TELEGRAM_BOT_TOKEN, no hace nada', async () => {
		for (let i = 0; i < BURST_THRESHOLD; i++) await applied(T0 - i * MIN);
		const fetchFn = vi.fn();
		await queueBurstAlert({ ...ctx(T0), fetch: fetchFn });
		expect(fetchFn).not.toHaveBeenCalled();
	});

	it('con «Telegram para admins» apagado, no manda nada', async () => {
		for (let i = 0; i < BURST_THRESHOLD; i++) await applied(T0 - i * MIN);
		await setFlag(t.db, 'telegram_admin', false, { by: 'prueba' });
		clearFlagCache();
		const tg = telegram();
		await queueBurstAlert(ctx(T0), { send: tg.send });
		expect(tg.sent).toHaveLength(0);
	});

	it('si mandar tira un error, no tira (solo lo anota en el log)', async () => {
		for (let i = 0; i < BURST_THRESHOLD; i++) await applied(T0 - i * MIN);
		const log = vi.spyOn(console, 'error').mockImplementation(() => {});
		await expect(
			queueBurstAlert(ctx(T0), {
				send: async () => {
					throw new Error('Telegram caído');
				}
			})
		).resolves.toBeUndefined();
		expect(log).toHaveBeenCalled();
		log.mockRestore();
	});

	it('con token y el bot prendido, el aviso sale por sendMessage', async () => {
		env.TELEGRAM_BOT_TOKEN = 'token-de-prueba';
		for (let i = 0; i < BURST_THRESHOLD; i++) await applied(T0 - i * MIN);
		/** @type {any[]} */
		const bodies = [];
		const fetchFn = /** @type {typeof fetch} */ (
			/** @type {unknown} */ (
				vi.fn(async (/** @type {string} */ _url, /** @type {RequestInit} */ init) => {
					bodies.push(JSON.parse(String(init.body)));
					return new Response(JSON.stringify({ ok: true, result: {} }), { status: 200 });
				})
			)
		);
		await queueBurstAlert({ ...ctx(T0), fetch: fetchFn });
		expect(bodies).toHaveLength(1);
		expect(bodies[0].chat_id).toBe(String(ADMIN_TG));
		expect(bodies[0].text).toContain(`Claude aplicó ${BURST_THRESHOLD} cambios`);
	});
});
