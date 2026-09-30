/**
 * El checkout simulado de Mercado Pago solo existe en `vite dev` con el mock activo: en el build
 * de producción (`dev === false`) o con credenciales reales, responde 404 (y no aprueba nada).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

const ORDER = '11111111-1111-4111-8111-111111111111';

/** @param {{ dev: boolean, env: Record<string, string> }} o */
async function importPage({ dev, env }) {
	vi.resetModules();
	vi.doMock('$app/environment', () => ({ dev, browser: false, building: false, version: 'test' }));
	vi.doMock('$env/dynamic/private', () => ({ env }));
	return await import('./+page.server.js');
}

/** @param {() => unknown} fn */
async function status(fn) {
	try {
		await fn();
	} catch (e) {
		return /** @type {any} */ (e).status;
	}
	return 200;
}

const event = /** @type {any} */ ({
	params: { order: ORDER },
	platform: undefined,
	request: new Request('http://localhost/x', { method: 'POST', body: new FormData() }),
	fetch
});

afterEach(() => {
	vi.doUnmock('$app/environment');
	vi.doUnmock('$env/dynamic/private');
	vi.resetModules();
});

describe('/entradas/simular-pago/<orden>', () => {
	it('en producción (dev = false) responde 404, aunque MP_MOCK=1', async () => {
		const page = await importPage({ dev: false, env: { MP_MOCK: '1' } });
		expect(await status(() => page.load(event))).toBe(404);
		expect(await status(() => page.actions.default(event))).toBe(404);
	});

	it('en dev con credenciales reales y sin MP_MOCK, también 404', async () => {
		const page = await importPage({ dev: true, env: { MP_ACCESS_TOKEN: 'APP_USR-x' } });
		expect(await status(() => page.load(event))).toBe(404);
		expect(await status(() => page.actions.default(event))).toBe(404);
	});
});
