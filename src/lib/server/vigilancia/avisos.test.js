/**
 * Los avisos «Fallas del sitio» (./avisos.js). D1 de miniflare; datos INVENTADOS (el repo es
 * público).
 *
 * - errores: sale cuando la última hora llega a un umbral (10 en el sitio, 2 en compras), una vez
 *   por hora como mucho; si Telegram falla, se suelta y el próximo error reintenta;
 * - tareas programadas: sale si alguna no terminó bien en su plazo, una vez cada 6 horas;
 * - a quién: les admins vinculades que prendieron «Fallas del sitio»;
 * - el texto: rutas como patrón, estados, cantidades y códigos; nunca la query ni el mensaje;
 * - sin Telegram, con el bot apagado o sin la tabla, nada se traba;
 * - el `handle` envuelto cuenta las respuestas 5xx (y las tiradas), no las 4xx, y respeta lo
 *   que marcó una acción con `markFailure`.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const env = vi.hoisted(() => /** @type {Record<string, string | undefined>} */ ({}));
vi.mock('$env/dynamic/private', () => ({ env }));

import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import { ADMINS } from '$lib/server/auth';
import { clearFlagCache, setFlag } from '$lib/server/flags.js';
import { setAdminNotice } from '$lib/server/telegram/adminData.js';
import { markFailure } from '$lib/server/errorLog.js';
import { recordServerError } from './errores.js';
import { WATCHED_CRONS, recordCronOk, staleCrons } from './crons.js';

const { CRON_ALERT_WINDOW_MS, countServerErrors, notifyErrors, queueErrorAlert, runCronWatch } =
	await import('./avisos.js');
const { agoText, errorBurstText, staleCronsText } =
	await import('$lib/server/telegram/adminNotify.js');

vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

/** 8/1/2031 a las 15:00 de Argentina (fuera del horario de silencio). */
const T0 = Date.parse('2031-01-08T15:00:00-03:00');
/** La misma noche, a las 3 de Argentina (horario de silencio). */
const NIGHT = Date.parse('2031-01-09T03:00:00-03:00');
const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const ADMIN = { id: ADMINS[0].id, login: ADMINS[0].login };
const OTHER_ADMIN = { id: ADMINS[1].id, login: ADMINS[1].login };
const ADMIN_TG = 5001;
const OTHER_TG = 5002;
const WEBHOOK = '/api/mercadopago/webhook';

/** @type {Awaited<ReturnType<typeof createTestDB>>} */
let t;
/** @type {Awaited<ReturnType<typeof createTestDB>>} */
let bare;
beforeAll(async () => {
	[t, bare] = await Promise.all([createTestDB(), createTestDB({ migrate: false })]);
});
afterAll(async () => {
	await Promise.all([t?.dispose(), bare?.dispose()]);
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

/**
 * `n` errores 5xx en `route`, el último a `at`.
 * @param {number} n @param {string} route @param {number} at @param {number} [status]
 */
async function errors(n, route, at, status = 500) {
	for (let i = 0; i < n; i++) {
		await recordServerError(t.db, {
			now: at - (n - 1 - i) * 1000,
			route,
			status,
			errorId: `c0de${String(i).padStart(4, '0')}`
		});
	}
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
	// Solo ADMIN prendió «Fallas del sitio»; OTHER_ADMIN, otro aviso.
	await setAdminNotice(t.db, ADMIN.id, 'fallas_sitio', true);
	await setAdminNotice(t.db, OTHER_ADMIN.id, 'cada_venta', true);
});

describe('los textos', () => {
	it('errores del sitio: cuántos, una línea por ruta y estado con el último código', () => {
		expect(
			errorBurstText({
				kind: 'site',
				total: 12,
				purchase: 0,
				rows: [
					{ route: '/calendario/[event]', status: 500, hits: 9, lastErrorId: '0f1e2d3c' },
					{ route: '/admin/<x>', status: 503, hits: 3, lastErrorId: null }
				]
			})
		).toBe(
			[
				'⚠️ El sitio dio 12 errores en la última hora.',
				'',
				'• <code>/calendario/[event]</code> · 500 × 9 · <code>0f1e2d3c</code>',
				'• <code>/admin/&lt;x&gt;</code> · 503 × 3',
				'',
				'Cada código se busca en los registros del Worker en Cloudflare (Observability → Logs).'
			].join('\n')
		);
	});

	it('compras: cuántos en las páginas de compra; más de 8 rutas, «y N más»', () => {
		const rows = Array.from({ length: 10 }, (_, i) => ({
			route: `/r${i}`,
			status: 500,
			hits: 1,
			lastErrorId: null
		}));
		const text = errorBurstText({ kind: 'purchase', total: 10, purchase: 3, rows });
		expect(text.split('\n')[0]).toBe(
			'🛒 Puede que haya fallado una compra: 3 errores en la última hora en las páginas de compra.'
		);
		expect(text).toContain('<code>/r7</code>');
		expect(text).not.toContain('<code>/r8</code>');
		expect(text).toContain('• y 2 más');
	});

	it('tareas programadas: una línea por tarea y qué mirar', () => {
		expect(
			staleCronsText([
				{ label: 'Todas las noches: backup de la base', silentMs: 27 * HOUR + 5 * MIN },
				{ label: 'Cada 15 minutos: recordatorios, mails y conciliación', silentMs: 75 * MIN }
			])
		).toBe(
			[
				'⏰ La tarea programada «Todas las noches: backup de la base» no termina bien desde hace 27 horas.',
				'⏰ La tarea programada «Cada 15 minutos: recordatorios, mails y conciliación» no termina bien desde hace 75 minutos.',
				'',
				'Puede que no esté corriendo o que falle cada vez: mirá Cron Events y los registros del Worker en Cloudflare.'
			].join('\n')
		);
		expect(agoText(MIN)).toBe('hace 1 minuto');
		expect(agoText(119 * MIN)).toBe('hace 119 minutos');
		expect(agoText(120 * MIN)).toBe('hace 2 horas');
	});
});

describe('notifyErrors', () => {
	it('debajo de los umbrales no sale', async () => {
		await errors(9, '/calendario/[event]', T0);
		await errors(1, WEBHOOK, T0);
		// 10 en total, pero uno es de compra: 9 + 1 = 10 llega al del sitio. Con 9, no.
		await t.db.prepare('DELETE FROM error_counts WHERE route = ?1').bind(WEBHOOK).run();
		const tg = telegram();
		expect(await notifyErrors({ db: t.db, send: tg.send, now: T0 })).toBeNull();
		expect(tg.sent).toEqual([]);
	});

	it('10 en el sitio: sale una vez, solo a quien lo prendió, y no otra vez en la hora', async () => {
		await errors(10, '/calendario/[event]', T0);
		const tg = telegram();
		expect(await notifyErrors({ db: t.db, send: tg.send, now: T0 })).toEqual({
			sent: 1,
			failed: 0
		});
		expect(tg.sent).toHaveLength(1);
		expect(tg.sent[0]).toMatchObject({ chatId: String(ADMIN_TG), panelUrl: null, silent: false });
		expect(tg.sent[0].text).toContain('⚠️ El sitio dio 10 errores en la última hora.');
		expect(tg.sent[0].text).toContain('<code>/calendario/[event]</code> · 500 × 10');
		await errors(5, '/calendario/[event]', T0 + 30 * MIN);
		expect(await notifyErrors({ db: t.db, send: tg.send, now: T0 + 30 * MIN })).toBeNull();
		expect(tg.sent).toHaveLength(1);
		// Pasada la hora, puede volver a salir.
		await errors(10, '/', T0 + 61 * MIN);
		expect(await notifyErrors({ db: t.db, send: tg.send, now: T0 + 61 * MIN })).toEqual({
			sent: 1,
			failed: 0
		});
	});

	it('2 en las compras alcanzan; de noche sale sin sonido', async () => {
		await errors(2, WEBHOOK, NIGHT);
		const tg = telegram();
		await notifyErrors({ db: t.db, send: tg.send, now: NIGHT });
		expect(tg.sent).toHaveLength(1);
		expect(tg.sent[0].silent).toBe(true);
		expect(tg.sent[0].text.split('\n')[0]).toBe(
			'🛒 Puede que haya fallado una compra: 2 errores en la última hora en las páginas de compra.'
		);
		expect(tg.sent[0].text).toContain('<code>c0de0001</code>');
	});

	it('si Telegram falla, se suelta y el próximo reintenta', async () => {
		await errors(2, WEBHOOK, T0);
		const down = telegram('failed');
		expect(await notifyErrors({ db: t.db, send: down.send, now: T0 })).toEqual({
			sent: 0,
			failed: 1
		});
		const up = telegram();
		expect(await notifyErrors({ db: t.db, send: up.send, now: T0 + MIN })).toEqual({
			sent: 1,
			failed: 0
		});
	});

	it('sin nadie que lo haya prendido, no sale ni toma el aviso', async () => {
		await setAdminNotice(t.db, ADMIN.id, 'fallas_sitio', false);
		await errors(2, WEBHOOK, T0);
		const tg = telegram();
		expect(await notifyErrors({ db: t.db, send: tg.send, now: T0 })).toBeNull();
		await setAdminNotice(t.db, ADMIN.id, 'fallas_sitio', true);
		expect(await notifyErrors({ db: t.db, send: tg.send, now: T0 })).toEqual({
			sent: 1,
			failed: 0
		});
	});
});

describe('queueErrorAlert', () => {
	it('cuenta el error y avisa cuando llega al umbral (con waitUntil)', async () => {
		await errors(1, WEBHOOK, T0 - MIN);
		const tg = telegram();
		/** @type {Promise<unknown>[]} */
		const tasks = [];
		const platform = /** @type {any} */ ({
			ctx: { waitUntil: (/** @type {any} */ p) => tasks.push(p) }
		});
		await queueErrorAlert(
			{ db: t.db, now: T0, status: 502, route: WEBHOOK, errorId: 'abcd1234', platform },
			{ send: tg.send }
		);
		expect(tasks).toHaveLength(1);
		await Promise.all(tasks);
		expect(tg.sent).toHaveLength(1);
		expect(tg.sent[0].text).toContain(
			'<code>/api/mercadopago/webhook</code> · 502 × 1 · <code>abcd1234</code>'
		);
	});

	it('sin token ni bot, solo cuenta; sin la tabla o sin base, no tira', async () => {
		await queueErrorAlert({ db: t.db, now: T0, status: 500, route: '/', errorId: null });
		const row = await t.db.prepare('SELECT hits FROM error_counts').first();
		expect(row?.hits).toBe(1);
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		try {
			await expect(
				queueErrorAlert(
					{ db: bare.db, now: T0, status: 500, route: '/' },
					{ send: telegram().send }
				)
			).resolves.toBeUndefined();
			await expect(
				queueErrorAlert({ db: null, now: T0, status: 500, route: '/' })
			).resolves.toBeUndefined();
		} finally {
			warn.mockRestore();
		}
	});

	it('con el bot de admins apagado no manda', async () => {
		await setFlag(t.db, 'telegram_admin', false, { by: 'prueba' });
		clearFlagCache();
		await errors(1, WEBHOOK, T0 - MIN);
		const tg = telegram();
		await queueErrorAlert({ db: t.db, now: T0, status: 500, route: WEBHOOK }, { send: tg.send });
		expect(tg.sent).toEqual([]);
	});
});

describe('runCronWatch', () => {
	it('todas al día: nada; una parada: avisa una vez cada 6 horas', async () => {
		const tg = telegram();
		const log = vi.spyOn(console, 'error').mockImplementation(() => {});
		try {
			await staleCrons(t.db, T0);
			for (const w of WATCHED_CRONS) await recordCronOk(t.db, w.cron, T0);
			expect(await runCronWatch({ db: t.db, now: T0 + 30 * MIN, send: tg.send })).toBeNull();
			// El backup no termina bien por más de 26 horas; los demás siguen andando.
			for (const w of WATCHED_CRONS) {
				if (w.cron !== '0 6 * * *') await recordCronOk(t.db, w.cron, T0 + 26 * HOUR);
			}
			const at = T0 + 26 * HOUR + 30 * MIN;
			expect(await runCronWatch({ db: t.db, now: at, send: tg.send })).toEqual({
				stale: ['0 6 * * *'],
				sent: 1,
				failed: 0
			});
			expect(tg.sent[0].text).toBe(
				[
					'⏰ La tarea programada «Todas las noches: backup de la base» no termina bien desde hace 26 horas.',
					'',
					'Puede que no esté corriendo o que falle cada vez: mirá Cron Events y los registros del Worker en Cloudflare.'
				].join('\n')
			);
			for (const w of WATCHED_CRONS) {
				if (w.cron !== '0 6 * * *') await recordCronOk(t.db, w.cron, at + HOUR);
			}
			expect(await runCronWatch({ db: t.db, now: at + HOUR, send: tg.send })).toMatchObject({
				sent: 0
			});
			expect(tg.sent).toHaveLength(1);
			for (const w of WATCHED_CRONS) {
				if (w.cron !== '0 6 * * *') {
					await recordCronOk(t.db, w.cron, at + CRON_ALERT_WINDOW_MS + MIN);
				}
			}
			await runCronWatch({ db: t.db, now: at + CRON_ALERT_WINDOW_MS + MIN, send: tg.send });
			expect(tg.sent).toHaveLength(2);
		} finally {
			log.mockRestore();
		}
	});

	it('sin Telegram revisa igual y lo deja en el log; sin la tabla no tira', async () => {
		const log = vi.spyOn(console, 'error').mockImplementation(() => {});
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		try {
			await staleCrons(t.db, T0);
			const r = await runCronWatch({ db: t.db, now: T0 + 2 * HOUR });
			expect(r).toEqual({ stale: ['*/15 * * * *'], sent: 0, failed: 0 });
			expect(log).toHaveBeenCalledWith(expect.stringContaining('sin aviso por Telegram'));
			expect(await runCronWatch({ db: bare.db, now: T0, send: telegram().send })).toBeNull();
			expect(warn).toHaveBeenCalled();
		} finally {
			log.mockRestore();
			warn.mockRestore();
		}
	});
});

describe('countServerErrors', () => {
	/**
	 * @param {{ status?: number, throws?: unknown, routeId?: string | null,
	 *   before?: (event: any) => void }} o
	 */
	async function run({ status = 200, throws, routeId = '/(content)/calendario/[event]', before }) {
		const queue = vi.fn(async () => {});
		const event = /** @type {any} */ ({
			locals: {},
			route: { id: routeId },
			platform: undefined,
			url: new URL('https://ejemplo.test/calendario/fiesta?mail=alguien@ejemplo.test')
		});
		const handle = countServerErrors(
			async () => {
				before?.(event);
				if (throws) throw throws;
				return new Response('x', { status });
			},
			{ queue, now: () => T0 }
		);
		/** @type {Response | null} */
		let response = null;
		/** @type {unknown} */
		let thrown = null;
		try {
			response = await handle(/** @type {any} */ ({ event, resolve: async () => new Response() }));
		} catch (error) {
			thrown = error;
		}
		return { queue, response, thrown };
	}

	it('una respuesta 5xx cuenta, con la ruta como patrón (sin la dirección ni la query) y el código', async () => {
		const { queue, response } = await run({
			status: 500,
			before: (event) => (event.locals.errorId = 'feed1234')
		});
		expect(response?.status).toBe(500);
		expect(queue).toHaveBeenCalledWith(
			expect.objectContaining({
				now: T0,
				status: 500,
				route: '/calendario/[event]',
				errorId: 'feed1234'
			})
		);
		expect(JSON.stringify(queue.mock.calls)).not.toContain('alguien');
	});

	it('las 2xx, 3xx y 4xx no cuentan', async () => {
		for (const status of [200, 303, 404, 429]) {
			const { queue } = await run({ status });
			expect(queue, String(status)).not.toHaveBeenCalled();
		}
	});

	it('un error tirado cuenta (500, o su estado si es un 5xx) y sigue su camino; un 4xx tirado no', async () => {
		const boom = new Error('se rompió');
		let r = await run({ throws: boom });
		expect(r.thrown).toBe(boom);
		expect(r.queue).toHaveBeenCalledWith(expect.objectContaining({ status: 500 }));
		r = await run({ throws: { status: 503, body: { message: 'x' } } });
		expect(r.queue).toHaveBeenCalledWith(expect.objectContaining({ status: 503 }));
		r = await run({ throws: { status: 404, body: { message: 'x' } } });
		expect(r.queue).not.toHaveBeenCalled();
	});

	it('markFailure: una acción que falló con 502 cuenta aunque la respuesta sea 200; con 0, no cuenta', async () => {
		let r = await run({
			status: 200,
			routeId: '/(content)/calendario/[event]/entradas',
			before: (event) => markFailure(event, 502)
		});
		expect(r.queue).toHaveBeenCalledWith(
			expect.objectContaining({ status: 502, route: '/calendario/[event]/entradas' })
		);
		r = await run({ status: 503, before: (event) => markFailure(event, 0) });
		expect(r.queue).not.toHaveBeenCalled();
	});

	it('sin ruta elegida, «(sin ruta)»', async () => {
		const { queue } = await run({ status: 500, routeId: null });
		expect(queue).toHaveBeenCalledWith(expect.objectContaining({ route: '(sin ruta)' }));
	});
});
