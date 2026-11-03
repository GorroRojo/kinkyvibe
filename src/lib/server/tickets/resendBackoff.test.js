/**
 * Los «ahora no» de Resend (429 por cupo o por tasa, 5xx): `sendWithResend` tira un `ResendError`
 * que dice qué pasó, reintenta una sola vez el 429 por tasa (con la espera de `retry-after`, con
 * tope) y nunca el cupo ni el 5xx; el aviso de cupo se ve en «Para revisar» un día. Lo que se le
 * manda a Resend se captura (no sale nada); datos inventados.
 */
import { describe, expect, it } from 'vitest';
import { RESEND_RETRY_MAX_WAIT_MS, ResendError, resendBackoff, sendWithResend } from './email.js';
import { RESEND_QUOTA_SHOW_MS, readResendQuota, resendQuotaItem } from './resendQuota.js';

/**
 * Un fetch falso que contesta en orden las respuestas de `replies` y guarda cada POST.
 * @param {{ status: number, body?: string, headers?: Record<string, string> }[]} replies
 */
function resend(replies) {
	/** @type {any[]} */
	const posts = [];
	const fetch = /** @type {any} */ (
		async (/** @type {string} */ _url, /** @type {RequestInit} */ init) => {
			posts.push(JSON.parse(String(init.body)));
			const r = replies[Math.min(posts.length - 1, replies.length - 1)];
			return new Response(r.body ?? '{"id":"x"}', { status: r.status, headers: r.headers });
		}
	);
	return { posts, fetch };
}

/** @param {number} status @param {string} name */
const error = (status, name, headers = {}) => ({
	status,
	body: JSON.stringify({ statusCode: status, name, message: 'inventado' }),
	headers
});

const MESSAGE = { subject: 'Prueba', html: '<p>Hola</p>', text: 'Hola' };
const BASE = {
	apiKey: 're_inventada',
	from: 'KinkyVibe <entradas@kinkyvibe.ar>',
	to: 'persona@example.com',
	message: MESSAGE
};

/**
 * `sendWithResend` con una espera falsa que anota cuánto se esperó.
 * @param {ReturnType<typeof resend>} r
 * @param {string} [idempotencyKey]
 */
async function send(r, idempotencyKey) {
	/** @type {number[]} */
	const waits = [];
	try {
		const out = await sendWithResend({
			...BASE,
			fetch: r.fetch,
			idempotencyKey,
			wait: async (ms) => waits.push(ms)
		});
		return { out, waits, error: null };
	} catch (e) {
		return { out: null, waits, error: e };
	}
}

describe('sendWithResend ante errores de Resend', () => {
	it('un 429 por tasa se reintenta una sola vez, esperando `retry-after`', async () => {
		const r = resend([error(429, 'rate_limit_exceeded', { 'retry-after': '1' }), { status: 200 }]);
		const { out, waits } = await send(r, 'tickets-x');
		expect(out).toEqual({ id: 'x' });
		expect(waits).toEqual([1000]);
		expect(r.posts).toHaveLength(2);
	});

	it('la espera tiene tope, y si vuelve a dar 429 tira un error de tasa', async () => {
		const r = resend([error(429, 'rate_limit_exceeded', { 'retry-after': '30' })]);
		const { waits, error: e } = await send(r);
		expect(waits).toEqual([RESEND_RETRY_MAX_WAIT_MS]);
		expect(r.posts).toHaveLength(2);
		expect(e).toBeInstanceOf(ResendError);
		expect(resendBackoff(e)).toBe('rate');
	});

	it('el cupo terminado (diario o mensual) no se reintenta', async () => {
		for (const name of ['daily_quota_exceeded', 'monthly_quota_exceeded']) {
			const r = resend([error(429, name)]);
			const { waits, error: e } = await send(r, 'tickets-x');
			expect(r.posts).toHaveLength(1);
			expect(waits).toEqual([]);
			expect(e).toMatchObject({ status: 429, code: name });
			expect(resendBackoff(e)).toBe('quota');
		}
	});

	it('un 5xx no se reintenta ahí (lo hace la próxima corrida) y es «ahora no»', async () => {
		const r = resend([{ status: 503, body: 'caído' }]);
		const { error: e } = await send(r, 'tickets-x');
		expect(r.posts).toHaveLength(1);
		expect(e).toMatchObject({ status: 503, code: '' });
		expect(resendBackoff(e)).toBe('server');
	});

	it('los demás errores no son «ahora no»: gastan el intento como siempre', async () => {
		const r = resend([error(422, 'validation_error')]);
		const { error: e } = await send(r);
		expect(r.posts).toHaveLength(1);
		expect(e).toBeInstanceOf(ResendError);
		expect(resendBackoff(e)).toBeNull();
		expect(resendBackoff(new Error('timeout'))).toBeNull();
		expect(resendBackoff(null)).toBeNull();
	});
});

describe('aviso de cupo en «Para revisar»', () => {
	const NOW = Date.parse('2099-11-10T12:00:00-03:00');
	const formatWhen = (/** @type {number} */ ms) => `hace ${(NOW - ms) / 60000} min`;

	it('se ve durante un día después del último 429 por cupo', () => {
		const value = JSON.stringify({ at: NOW - 30 * 60000, code: 'daily_quota_exceeded' });
		const hit = readResendQuota(value, NOW);
		expect(hit).toEqual({ at: NOW - 30 * 60000, code: 'daily_quota_exceeded' });
		expect(resendQuotaItem(hit, { formatWhen })).toMatchObject({
			id: 'resend-quota',
			tone: 'bad',
			title: 'Se terminó el cupo diario de mails de Resend',
			text: expect.stringContaining('hace 30 min')
		});
		expect(readResendQuota(value, NOW + RESEND_QUOTA_SHOW_MS)).toBeNull();
	});

	it('dice si fue el cupo mensual; sin dato o con basura, nada', () => {
		const hit = readResendQuota(JSON.stringify({ at: NOW, code: 'monthly_quota_exceeded' }), NOW);
		expect(resendQuotaItem(hit, { formatWhen })?.title).toBe(
			'Se terminó el cupo mensual de mails de Resend'
		);
		expect(readResendQuota(undefined, NOW)).toBeNull();
		expect(readResendQuota('no es json', NOW)).toBeNull();
		expect(resendQuotaItem(null, { formatWhen })).toBeNull();
	});
});
