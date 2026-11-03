/**
 * Remitentes (docs/mails.md, «Remitentes»): los avisos (series, «Lo que sigo», lista de espera)
 * salen de avisos@ (`AVISOS_FROM_EMAIL`), así una queja por spam a un aviso no les pega a los
 * mails de entradas; los de entradas, los códigos para ingresar y los reembolsos siguen con el de
 * los ajustes (entradas@). La respuesta es la misma para todos. Lo que se le manda a Resend se
 * captura (no sale nada). D1 de miniflare; datos inventados.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { createTestDB, resetDB } from '$lib/server/db/testing.js';

vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

const vars = vi.hoisted(() => /** @type {Record<string, string | undefined>} */ ({}));
vi.mock('$env/dynamic/private', () => ({ env: vars }));

const { AVISOS_FROM_EMAIL, DEFAULT_FROM_EMAIL, DEFAULT_REPLY_TO, isAllowedFrom } =
	await import('$lib/server/tickets/settings.js');
const { deliverEmail } = await import('$lib/server/tickets/index.js');
const { seriesSender } = await import('$lib/server/series/web.js');
const { waitlistSender } = await import('$lib/server/tickets/waitlistMail.js');
const { mailSender } = await import('$lib/server/cuentas/web.js');

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
	for (const key of Object.keys(vars)) delete vars[key];
	vars.RESEND_API_KEY = 're_inventada';
	for (const level of /** @type {const} */ (['log', 'warn', 'error'])) {
		const spy = vi.spyOn(console, level).mockImplementation(() => {});
		onTestFinished(() => spy.mockRestore());
	}
});

const TO = 'persona.prueba@example.com';
const MESSAGE = { subject: 'Prueba', html: '<p>Hola</p>', text: 'Hola' };

/** Un fetch falso que contesta como Resend y guarda cada POST. */
function resend() {
	/** @type {any[]} */
	const posts = [];
	const fetch = /** @type {any} */ (
		async (/** @type {string} */ _url, /** @type {RequestInit} */ init) => {
			posts.push(JSON.parse(String(init.body)));
			return new Response('{"id":"x"}', { status: 200 });
		}
	);
	return { posts, fetch };
}

describe('el remitente de los avisos', () => {
	it('es otra dirección de kinkyvibe.ar, con el mismo nombre que el de entradas', () => {
		expect(AVISOS_FROM_EMAIL).toBe('KinkyVibe <avisos@kinkyvibe.ar>');
		expect(AVISOS_FROM_EMAIL).not.toBe(DEFAULT_FROM_EMAIL);
		expect(isAllowedFrom(AVISOS_FROM_EMAIL)).toBe(true);
		expect(AVISOS_FROM_EMAIL.split('<')[0]).toBe(DEFAULT_FROM_EMAIL.split('<')[0]);
	});

	it('series y «Lo que sigo» (seriesSender) salen de avisos@, con la respuesta de siempre', async () => {
		const r = resend();
		expect(await seriesSender(t.db, r.fetch)(TO, MESSAGE, 'series-x')).toBe('sent');
		expect(r.posts).toHaveLength(1);
		expect(r.posts[0].from).toBe(AVISOS_FROM_EMAIL);
		expect(r.posts[0].reply_to).toBe(DEFAULT_REPLY_TO);
	});

	it('la lista de espera (waitlistSender) sale de avisos@, con la respuesta de siempre', async () => {
		const r = resend();
		expect(await waitlistSender(t.db, r.fetch)(TO, MESSAGE, 'waitlist-x')).toBe('sent');
		expect(r.posts).toHaveLength(1);
		expect(r.posts[0].from).toBe(AVISOS_FROM_EMAIL);
		expect(r.posts[0].reply_to).toBe(DEFAULT_REPLY_TO);
	});
});

describe('lo transaccional sigue con el remitente de los ajustes', () => {
	it('el código para ingresar (mailSender de cuentas) sale de entradas@', async () => {
		const r = resend();
		const event = /** @type {any} */ ({ fetch: r.fetch });
		expect(await mailSender(event, t.db)(TO, MESSAGE, '')).toBe('sent');
		expect(r.posts[0].from).toBe(DEFAULT_FROM_EMAIL);
		expect(r.posts[0].reply_to).toBe(DEFAULT_REPLY_TO);
	});

	it('un mail sin remitente fijo (entradas, reembolsos…) sale de entradas@', async () => {
		const r = resend();
		expect(await deliverEmail({ db: t.db, fetch: r.fetch, to: TO, message: MESSAGE })).toBe('sent');
		expect(r.posts[0].from).toBe(DEFAULT_FROM_EMAIL);
	});

	it('los mails de entradas (tickets/index.js) nunca usan el remitente de los avisos', () => {
		const index = readFileSync(new URL('../tickets/index.js', import.meta.url), 'utf8');
		expect(index).not.toMatch(/import[^;]*AVISOS_FROM_EMAIL/);
		expect(index).not.toMatch(/from: AVISOS_FROM_EMAIL/);
		expect(index).not.toContain('avisos@');
		const cuentas = readFileSync(new URL('../cuentas/web.js', import.meta.url), 'utf8');
		expect(cuentas).not.toContain('AVISOS_FROM_EMAIL');
	});
});
