/**
 * POST /api/fondo/mi-link (docs/mails.md, «Mail del Fondo (tu link)»): secreto, validación, tope,
 * envío por `deliver()` (Resend falso) y respuestas. D1 de miniflare; direcciones inventadas.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import { textOf } from '$lib/testing/html.js';
import { FONDO_MAIL_CAP } from '$lib/server/fondo/miLink.js';

vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

const SECRET = 'fondo-secreto-de-prueba-0123456789';
const TO = 'persona@example.com';
const URL_A = 'https://fondo.kinkyvibe.ar/gracias?preapproval_id=0a1b2c3d';
const URL_B = 'https://fondo.kinkyvibe.ar/gracias?preapproval_id=ff00ee11';
const VALID = { to: TO, links: [{ tier: 'Casual', url: URL_A }] };

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
afterEach(() => {
	vi.doUnmock('$env/dynamic/private');
	vi.doUnmock('$lib/server/deploy.js');
	vi.resetModules();
	vi.restoreAllMocks();
});

/**
 * @param {{ env?: Record<string, string>, preview?: boolean }} [o]
 */
async function endpoint({
	env = { FONDO_MAIL_SECRET: SECRET, RESEND_API_KEY: 're_inventada' },
	preview = false
} = {}) {
	vi.resetModules();
	vi.doMock('$env/dynamic/private', () => ({ env }));
	if (preview) {
		vi.doMock('$lib/server/deploy.js', async (orig) => ({
			.../** @type {object} */ (await orig()),
			isPreviewDeploy: () => true
		}));
	}
	return await import('./+server.js');
}

/** Resend falso: guarda cada pedido. @param {{ status?: number }} [o] */
function resend({ status = 200 } = {}) {
	/** @type {any[]} */
	const sent = [];
	/** @type {typeof fetch} */
	const fetchFn = async (input, init) => {
		const url = new URL(String(input));
		if (url.host !== 'api.resend.com') throw new Error(`fetch inesperado a ${url.host}`);
		sent.push(JSON.parse(String(init?.body)));
		return status === 200
			? new Response(JSON.stringify({ id: 'resend-id' }), { status })
			: new Response('{"message":"falló"}', { status });
	};
	return { fetchFn, sent };
}

/**
 * @param {{
 *   body?: unknown, raw?: BodyInit, secret?: string | null, contentType?: string | null,
 *   env?: Record<string, string>, fetchFn?: typeof fetch, preview?: boolean, platform?: any
 * }} [o]
 */
async function call({
	body = VALID,
	raw,
	secret = SECRET,
	contentType = 'application/json',
	env,
	fetchFn = resend().fetchFn,
	preview,
	platform = t.platform
} = {}) {
	const { POST } = await endpoint({ env, preview });
	/** @type {Record<string, string>} */
	const headers = {};
	if (secret !== null) headers['x-fondo-secret'] = secret;
	if (contentType !== null) headers['content-type'] = contentType;
	const request = new Request('https://kinkyvibe.ar/api/fondo/mi-link', {
		method: 'POST',
		headers,
		body: raw ?? JSON.stringify(body)
	});
	return POST(
		/** @type {any} */ ({
			request,
			platform,
			url: new URL(request.url),
			fetch: fetchFn
		})
	);
}

/**
 * Los botones del mail (`<a href="…">`, menos el `mailto:` del pie), sin regex sobre etiquetas.
 * @param {string} html
 */
function buttons(html) {
	return html
		.split('<a href="')
		.slice(1)
		.map((part) => ({
			href: part.slice(0, part.indexOf('"')).replaceAll('&amp;', '&'),
			label: textOf(part.slice(part.indexOf('>') + 1, part.indexOf('</a>')))
		}))
		.filter((b) => new URL(b.href).protocol === 'https:');
}

/** Respuesta sin detalles: a lo sumo un código corto. @param {Response} res */
async function shortBody(res) {
	const text = await res.text();
	expect(text.length).toBeLessThan(20);
	expect(text).not.toContain('@');
	return text;
}

describe('POST /api/fondo/mi-link: secreto', () => {
	it('sin FONDO_MAIL_SECRET configurado: 401 aunque el header venga', async () => {
		const r = resend();
		const res = await call({ env: { RESEND_API_KEY: 're_inventada' }, fetchFn: r.fetchFn });
		expect(res.status).toBe(401);
		expect(r.sent).toHaveLength(0);
	});

	it('con FONDO_MAIL_SECRET vacío: 401, también con el header vacío', async () => {
		const env = { FONDO_MAIL_SECRET: '', RESEND_API_KEY: 're_inventada' };
		expect((await call({ env })).status).toBe(401);
		expect((await call({ env, secret: '' })).status).toBe(401);
	});

	it('sin header o con el secreto equivocado: 401', async () => {
		const r = resend();
		expect((await call({ secret: null, fetchFn: r.fetchFn })).status).toBe(401);
		expect((await call({ secret: 'x'.repeat(SECRET.length), fetchFn: r.fetchFn })).status).toBe(
			401
		);
		expect((await call({ secret: SECRET.toUpperCase(), fetchFn: r.fetchFn })).status).toBe(401);
		const res = await call({ secret: `${SECRET}x`, fetchFn: r.fetchFn });
		expect(res.status).toBe(401);
		expect(await shortBody(res)).toBe('unauthorized');
		expect(r.sent).toHaveLength(0);
	});

	it('chequea el secreto antes de leer el body', async () => {
		const res = await call({ secret: 'mal', raw: 'esto no es json', contentType: 'text/plain' });
		expect(res.status).toBe(401);
	});
});

describe('POST /api/fondo/mi-link: validación', () => {
	/** @param {Parameters<typeof call>[0]} o */
	async function expect400(o) {
		const r = resend();
		const res = await call({ ...o, fetchFn: r.fetchFn });
		expect(res.status).toBe(400);
		expect(await shortBody(res)).toBe('bad_request');
		expect(r.sent).toHaveLength(0);
	}
	const link = (/** @type {string} */ url, tier = 'Casual') => ({ to: TO, links: [{ tier, url }] });

	it('mail inválido', async () => {
		await expect400({ body: { ...VALID, to: 'persona-sin-arroba' } });
		await expect400({ body: { ...VALID, to: 'a@example.com,b@example.com' } });
		await expect400({ body: { ...VALID, to: `${'a'.repeat(260)}@example.com` } });
	});

	it('0 o 6 links', async () => {
		await expect400({ body: { to: TO, links: [] } });
		await expect400({
			body: { to: TO, links: Array.from({ length: 6 }, () => ({ tier: 'Casual', url: URL_A })) }
		});
	});

	it('nivel que no existe', async () => {
		await expect400({ body: link(URL_A, 'Platino') });
		await expect400({ body: link(URL_A, 'casual') });
	});

	it('links fuera de la página de gracias del Fondo', async () => {
		await expect400({ body: link('https://evil.example/gracias?preapproval_id=0a1b') });
		await expect400({ body: link('http://fondo.kinkyvibe.ar/gracias?preapproval_id=0a1b') });
		await expect400({
			body: link('https://fondo.kinkyvibe.ar.evil.com/gracias?preapproval_id=0a1b')
		});
		await expect400({ body: link('https://fondo.kinkyvibe.ar/gracias?preapproval_id=0a1z') });
		await expect400({
			body: link(
				'https://fondo.kinkyvibe.ar/gracias?preapproval_id=0a1b&redirect=https://evil.example'
			)
		});
	});

	it('claves de más (asunto, remitente, HTML)', async () => {
		await expect400({ body: { ...VALID, subject: 'Otro asunto' } });
		await expect400({ body: { ...VALID, from: 'otra@example.com' } });
		await expect400({
			body: { to: TO, links: [{ tier: 'Casual', url: URL_A, html: '<b>x</b>' }] }
		});
	});

	it('body de más de 4 KB', async () => {
		await expect400({ body: { ...VALID, relleno: 'x'.repeat(5000) } });
		await expect400({ raw: JSON.stringify(VALID).padEnd(5000, ' ') });
	});

	it('body que no es JSON, o sin content-type JSON', async () => {
		await expect400({ raw: 'to=persona@example.com' });
		await expect400({ raw: '' });
		await expect400({ contentType: 'text/plain' });
		await expect400({ contentType: 'application/x-www-form-urlencoded' });
		await expect400({ contentType: null });
	});
});

describe('POST /api/fondo/mi-link: envío', () => {
	it('204 y manda el mail armado acá, con el remitente del Fondo', async () => {
		const r = resend();
		const log = vi.spyOn(console, 'log').mockImplementation(() => {});
		const res = await call({
			body: {
				to: TO,
				links: [
					{ tier: 'Casual', url: URL_A },
					{ tier: 'Estrella', url: URL_B }
				]
			},
			fetchFn: r.fetchFn
		});
		expect(res.status).toBe(204);
		expect(await res.text()).toBe('');
		expect(r.sent).toHaveLength(1);
		const [mail] = r.sent;
		expect(mail.from).toBe('Fondo KinkyVibe <fondo@kinkyvibe.ar>');
		expect(mail.to).toEqual([TO]);
		expect(mail.subject).toBe('Tu link para elegir cómo aparecés en el Fondo Kinky Vibe');
		const found = buttons(mail.html);
		expect(found.map((b) => b.label)).toEqual([
			'Mecenas Casual: elegir cómo aparezco',
			'Mecenas Estrella: elegir cómo aparezco'
		]);
		for (const [i, b] of found.entries()) {
			const href = new URL(b.href);
			expect(href.origin).toBe('https://fondo.kinkyvibe.ar');
			expect(href.pathname).toBe('/gracias');
			expect(href.searchParams.get('preapproval_id')).toBe(['0a1b2c3d', 'ff00ee11'][i]);
		}
		expect(textOf(mail.html)).toContain(
			'No compartas este mail: cualquiera que tenga el link puede cambiar cómo aparecés. Si no lo pediste, podés ignorarlo.'
		);
		expect(mail.text).toContain(`Mecenas Estrella: elegir cómo aparezco\n${URL_B}`);
		// El log no lleva la dirección ni los links.
		const logged = log.mock.calls.flat().join('\n');
		expect(logged).toContain('mi-link');
		expect(logged).not.toContain(TO);
		expect(logged).not.toContain('preapproval_id');
	});

	it('normaliza la dirección (espacios, mayúsculas)', async () => {
		const r = resend();
		vi.spyOn(console, 'log').mockImplementation(() => {});
		const res = await call({ body: { ...VALID, to: ' Persona@Example.COM ' }, fetchFn: r.fetchFn });
		expect(res.status).toBe(204);
		expect(r.sent[0].to).toEqual([TO]);
	});

	it('en un preview pasa por el filtro de EMAIL_ALLOWLIST', async () => {
		const r = resend();
		vi.spyOn(console, 'log').mockImplementation(() => {});
		const env = {
			FONDO_MAIL_SECRET: SECRET,
			RESEND_API_KEY: 're_inventada',
			EMAIL_ALLOWLIST: 'equipo@example.org'
		};
		const res = await call({ env, preview: true, fetchFn: r.fetchFn });
		expect(res.status).toBe(204);
		expect(r.sent[0].to).toEqual(['equipo@example.org']);
		expect(r.sent[0].subject.startsWith('[DEMO]')).toBe(true);
	});

	it('502 si Resend falla, sin loguear la dirección', async () => {
		const r = resend({ status: 500 });
		const logs = [
			vi.spyOn(console, 'log').mockImplementation(() => {}),
			vi.spyOn(console, 'error').mockImplementation(() => {}),
			vi.spyOn(console, 'warn').mockImplementation(() => {})
		];
		const res = await call({ fetchFn: r.fetchFn });
		expect(res.status).toBe(502);
		expect(await shortBody(res)).toBe('send_failed');
		const logged = logs
			.flatMap((l) => l.mock.calls.flat())
			.map(String)
			.join('\n');
		expect(logged).not.toContain(TO);
		expect(logged).not.toContain('preapproval_id');
	});

	it('sin RESEND_API_KEY en dev, deliver() lo simula: 204 sin llamar a Resend', async () => {
		// En producción, sin clave, deliver() da «failed» → 502 (miLink.test.js).
		const r = resend();
		vi.spyOn(console, 'log').mockImplementation(() => {});
		const res = await call({ env: { FONDO_MAIL_SECRET: SECRET }, fetchFn: r.fetchFn });
		expect(res.status).toBe(204);
		expect(r.sent).toHaveLength(0);
	});

	it('429 al pasar el tope por hora, con Retry-After', async () => {
		vi.spyOn(console, 'log').mockImplementation(() => {});
		vi.spyOn(console, 'warn').mockImplementation(() => {});
		const r = resend();
		for (let i = 0; i < FONDO_MAIL_CAP.limit; i++) {
			expect((await call({ fetchFn: r.fetchFn })).status).toBe(204);
		}
		const res = await call({ fetchFn: r.fetchFn });
		expect(res.status).toBe(429);
		expect(await shortBody(res)).toBe('rate_limited');
		expect(Number(res.headers.get('retry-after'))).toBeGreaterThan(0);
		expect(r.sent).toHaveLength(FONDO_MAIL_CAP.limit);
	});

	it('los pedidos rechazados no gastan el tope', async () => {
		vi.spyOn(console, 'log').mockImplementation(() => {});
		for (let i = 0; i < FONDO_MAIL_CAP.limit + 5; i++) {
			expect((await call({ body: { to: TO, links: [] } })).status).toBe(400);
		}
		expect((await call()).status).toBe(204);
	});

	it('sin base (no hay tope): 503 y no manda', async () => {
		const r = resend();
		const res = await call({ platform: { env: {} }, fetchFn: r.fetchFn });
		expect(res.status).toBe(503);
		expect(r.sent).toHaveLength(0);
	});
});
