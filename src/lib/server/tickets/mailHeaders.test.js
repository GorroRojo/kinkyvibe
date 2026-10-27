/**
 * Remitente y cabeceras por mail: el remitente guardado solo vale si es @kinkyvibe.ar (si no, el
 * de siempre); cada código para entrar lleva su propio `X-Entity-Ref-ID` (Gmail no los junta en un
 * hilo) y los mails de tanda llevan `Auto-Submitted`. Lo que se le manda a Resend se captura (no
 * sale nada). D1 de miniflare; direcciones inventadas.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest';
import { createTestDB, resetDB } from '$lib/server/db/testing.js';

vi.mock('$env/dynamic/private', () => ({ env: { RESEND_API_KEY: 're_inventada' } }));

const { deliverEmail, emailSettings } = await import('./index.js');
const { AUTO_SUBMITTED_HEADERS, MAIL_HEADERS, autoSubmitted, sendWithResend } =
	await import('./email.js');
const { DEFAULT_FROM_EMAIL, saveSalesSettings } = await import('./settings.js');
const { requestCode } = await import('$lib/server/cuentas/index.js');

/** @type {Awaited<ReturnType<typeof createTestDB>>} */
let t;
beforeAll(async () => {
	t = await createTestDB();
});
afterAll(async () => {
	await t?.dispose();
});
beforeEach(async () => {
	await resetDB(t.db);
});

/** Un fetch falso para Resend que guarda el cuerpo de cada POST. */
function resend() {
	/** @type {any[]} */
	const bodies = [];
	const fetch = /** @type {any} */ (
		async (/** @type {string} */ _url, /** @type {RequestInit} */ init) => {
			bodies.push(JSON.parse(String(init.body)));
			return Response.json({ id: 'x' });
		}
	);
	return { bodies, fetch };
}

const MESSAGE = { subject: 'Prueba', html: '<p>Hola</p>', text: 'Hola' };

describe('remitente solo @kinkyvibe.ar', () => {
	it('un remitente guardado de otro dominio no se usa: sale con el de siempre', async () => {
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		onTestFinished(() => error.mockRestore());
		await saveSalesSettings(t.db, { from_email: 'Otro <otro@gmail.com>' }, { by: 'prueba' });
		expect((await emailSettings(t.db)).from).toBe(DEFAULT_FROM_EMAIL);
		const r = resend();
		await deliverEmail({ db: t.db, fetch: r.fetch, to: 'persona@example.com', message: MESSAGE });
		expect(r.bodies[0].from).toBe(DEFAULT_FROM_EMAIL);
		// El error en la consola no lleva el valor guardado.
		expect(JSON.stringify(error.mock.calls)).not.toContain('gmail');
	});

	it('uno del dominio verificado se usa tal cual', async () => {
		await saveSalesSettings(t.db, { from_email: 'Kinky Vibe <hola@kinkyvibe.ar>' }, { by: 'x' });
		expect((await emailSettings(t.db)).from).toBe('Kinky Vibe <hola@kinkyvibe.ar>');
	});
});

describe('cabeceras por mail', () => {
	it('sendWithResend suma las cabeceras del mail a las de siempre', async () => {
		const r = resend();
		await sendWithResend({
			fetch: r.fetch,
			apiKey: 're_inventada',
			from: DEFAULT_FROM_EMAIL,
			to: 'persona@example.com',
			message: autoSubmitted(MESSAGE)
		});
		expect(r.bodies[0].headers).toEqual({ ...MAIL_HEADERS, ...AUTO_SUBMITTED_HEADERS });
		expect(AUTO_SUBMITTED_HEADERS).toEqual({ 'Auto-Submitted': 'auto-generated' });
	});

	it('cada código para entrar lleva un X-Entity-Ref-ID distinto', async () => {
		/** @type {Record<string, string>[]} */
		const headers = [];
		/** @type {import('$lib/server/cuentas/index.js').SendMail} */
		const send = async (_to, message) => {
			headers.push(message.headers ?? {});
			return 'sent';
		};
		const now = Date.parse('2026-10-01T12:00:00Z');
		for (const at of [now, now + 60_000]) {
			const r = await requestCode({
				db: t.db,
				email: 'persona.prueba@example.com',
				client: 'cliente-de-prueba',
				send,
				now: at
			});
			expect(r).toMatchObject({ ok: true });
		}
		expect(headers).toHaveLength(2);
		const [a, b] = headers.map((h) => h['X-Entity-Ref-ID']);
		expect(a).toMatch(/^[0-9a-f-]{36}$/);
		expect(b).toMatch(/^[0-9a-f-]{36}$/);
		expect(a).not.toBe(b);
	});
});
