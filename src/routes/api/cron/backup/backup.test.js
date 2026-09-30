/**
 * POST /api/cron/backup: backup manual, protegido con CRON_SECRET (D1 y R2 de miniflare).
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createTestDB } from '$lib/server/db/testing.js';

const SECRET = 's'.repeat(32);

/** @type {Awaited<ReturnType<typeof createTestDB>>} */
let t;
beforeAll(async () => {
	t = await createTestDB();
});
afterAll(async () => {
	await t?.dispose();
});
afterEach(() => {
	vi.doUnmock('$env/dynamic/private');
	vi.resetModules();
});

/** @param {Record<string, string>} env */
async function importEndpoint(env) {
	vi.resetModules();
	vi.doMock('$env/dynamic/private', () => ({ env }));
	return await import('./+server.js');
}

/**
 * @param {{ env: Record<string, string>, header?: string, platform?: any }} o
 */
async function call({ env, header, platform }) {
	const { POST } = await importEndpoint(env);
	/** @type {Record<string, string>} */
	const headers = header === undefined ? {} : { 'x-cron-secret': header };
	const request = new Request('https://kinkyvibe.ar/api/cron/backup', { method: 'POST', headers });
	return POST(/** @type {any} */ ({ request, platform }));
}

describe('POST /api/cron/backup', () => {
	it('sin CRON_SECRET configurado: 503', async () => {
		const res = await call({ env: {}, header: SECRET, platform: t.platform });
		expect(res.status).toBe(503);
	});

	it('con el secreto equivocado o sin header: 401', async () => {
		expect((await call({ env: { CRON_SECRET: SECRET }, header: 'x'.repeat(32) })).status).toBe(401);
		expect((await call({ env: { CRON_SECRET: SECRET } })).status).toBe(401);
	});

	it('sin bucket (Pages, Previews): 503', async () => {
		const platform = { env: { DB: t.db } };
		const res = await call({ env: { CRON_SECRET: SECRET }, header: SECRET, platform });
		expect(res.status).toBe(503);
	});

	it('hace un backup manual en d1/manual/', async () => {
		const res = await call({ env: { CRON_SECRET: SECRET }, header: SECRET, platform: t.platform });
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.key).toMatch(/^d1\/manual\/\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}Z\.sql\.gz$/);
		const object = await /** @type {any} */ (t.env).BACKUPS.head(body.key);
		expect(object?.size).toBe(body.bytes);
	});
});
