/**
 * La página del link «No fui yo» (/mails/no-fui-yo/<hash>.<firma>): el GET solo muestra el botón
 * (no cambia nada), el POST anota la dirección, y un link tocado no sirve. D1 de miniflare.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import { fakeRequestEvent, thrown } from '$lib/server/series/fixtures.js';
import { OPT_OUT_PATH, isSuppressed, optOutUrl } from '$lib/server/email/suppressions.js';
import { actions, load } from './no-fui-yo/[token]/+page.server.js';

vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

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

const EMAIL = 'persona.prueba@example.com';

/** @param {Parameters<typeof fakeRequestEvent>[0] extends infer O ? Omit<O, 'platform'> : never} o */
const ev = (o) => fakeRequestEvent({ platform: t.platform, ...o });

async function token() {
	const url = String(await optOutUrl(t.db, 'https://kinkyvibe.ar', EMAIL));
	return url.slice(url.indexOf(OPT_OUT_PATH) + OPT_OUT_PATH.length);
}

describe('/mails/no-fui-yo/[token]', () => {
	it('GET: muestra el botón, con same-origin (nunca no-referrer) y sin cambiar nada', async () => {
		/** @type {Record<string, string>} */
		const headers = {};
		const event = ev({ params: { token: await token() } });
		event.setHeaders = (/** @type {Record<string, string>} */ h) => Object.assign(headers, h);
		expect(await load(event)).toEqual({ valid: true });
		expect(headers['referrer-policy']).toBe('same-origin');
		expect(headers['cache-control']).toBe('private, no-store');
		expect(headers['x-robots-tag']).toBe('noindex');
		expect(await isSuppressed(t.db, EMAIL)).toBe(false);
	});

	it('POST: anota la dirección; otra vez, lo mismo', async () => {
		const tk = await token();
		expect(await actions.default(ev({ params: { token: tk }, form: {} }))).toEqual({ ok: true });
		expect(await isSuppressed(t.db, EMAIL)).toBe(true);
		expect(await actions.default(ev({ params: { token: tk }, form: {} }))).toEqual({ ok: true });
	});

	it('un link tocado no sirve: GET inválido, POST 400 y nada anotado', async () => {
		const tk = await token();
		const bad = `${tk.slice(0, -1)}${tk.endsWith('A') ? 'B' : 'A'}`;
		expect(await load(ev({ params: { token: bad } }))).toEqual({ valid: false });
		expect(await load(ev({ params: { token: 'cualquier-cosa' } }))).toEqual({ valid: false });
		const r = /** @type {any} */ (await actions.default(ev({ params: { token: bad }, form: {} })));
		expect(r.status).toBe(400);
		expect(r.data).toEqual({ error: 'Este link no es válido.' });
		expect(await isSuppressed(t.db, EMAIL)).toBe(false);
	});

	it('sin base: 503', async () => {
		const e = await thrown(() =>
			load(
				fakeRequestEvent({
					platform: /** @type {any} */ (undefined),
					params: { token: 'x' }
				})
			)
		);
		expect(e?.status).toBe(503);
	});
});
