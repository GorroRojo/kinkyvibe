/**
 * POST /api/visto: aviso anónimo de los pasos «Tus datos» y «Pagar». Datos inventados.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const UA =
	'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

/**
 * @param {string} body
 * @param {Record<string, string>} [headers]
 */
function event(body, headers = {}, env = /** @type {any} */ (undefined)) {
	const url = new URL('https://kinkyvibe.ar/api/visto');
	const request = new Request(url, {
		method: 'POST',
		body,
		headers: {
			'content-type': 'application/json',
			origin: url.origin,
			'sec-fetch-site': 'same-origin',
			'user-agent': UA,
			...headers
		}
	});
	return /** @type {any} */ ({ request, url, platform: env ? { env } : undefined });
}

/** @type {typeof import('./+server.js').POST} */
let POST;
beforeEach(async () => {
	// Módulo nuevo en cada test: el límite por isolate arranca de cero.
	vi.resetModules();
	({ POST } = await import('./+server.js'));
});

const ok = '{"step":"datos","slug":"fiesta-rara"}';

describe('POST /api/visto', () => {
	it('escribe un punto del embudo sin nada de quien manda', async () => {
		/** @type {any[]} */
		const points = [];
		const env = { ANALYTICS: { writeDataPoint: (/** @type {any} */ p) => points.push(p) } };
		const res = await POST(
			event(ok, { cookie: 'kv_session=cookie-falsa', 'cf-connecting-ip': '203.0.113.7' }, env)
		);
		expect(res.status).toBe(204);
		expect(points).toEqual([
			{
				indexes: ['funnel'],
				blobs: ['funnel', '', '', '', '', 'fiesta-rara', 'datos', ''],
				doubles: [1]
			}
		]);
	});

	it('sin binding (dev, tests, Previews) contesta 204 y no hace nada', async () => {
		const res = await POST(event(ok));
		expect(res.status).toBe(204);
	});

	it('rechaza lo que no está en la lista', async () => {
		expect((await POST(event('{"step":"aprobada","slug":"fiesta-rara"}'))).status).toBe(400);
		expect((await POST(event('hola'))).status).toBe(400);
	});

	it('rechaza avisos de otro sitio', async () => {
		expect((await POST(event(ok, { origin: 'https://otro.example' }))).status).toBe(403);
		expect((await POST(event(ok, { 'sec-fetch-site': 'cross-site' }))).status).toBe(403);
	});

	it('los bots no cuentan', async () => {
		/** @type {any[]} */
		const points = [];
		const env = { ANALYTICS: { writeDataPoint: (/** @type {any} */ p) => points.push(p) } };
		const res = await POST(event(ok, { 'user-agent': 'curl/8.4.0' }, env));
		expect(res.status).toBe(204);
		expect(points).toEqual([]);
	});

	it('límite por isolate: después de 300 por minuto, 429', async () => {
		/** @type {any[]} */
		const points = [];
		const env = { ANALYTICS: { writeDataPoint: (/** @type {any} */ p) => points.push(p) } };
		for (let i = 0; i < 300; i++) {
			expect((await POST(event(ok, {}, env))).status).toBe(204);
		}
		expect((await POST(event(ok, {}, env))).status).toBe(429);
		expect(points).toHaveLength(300);
	});
});
