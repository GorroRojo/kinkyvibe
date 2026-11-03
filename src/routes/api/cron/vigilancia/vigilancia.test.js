/**
 * POST /api/cron/vigilancia: protegido con CRON_SECRET; mira las tareas programadas y borra los
 * conteos de errores viejos (D1 de miniflare).
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createTestDB } from '$lib/server/db/testing.js';
import { recordServerError } from '$lib/server/vigilancia/errores.js';

vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

const SECRET = 's'.repeat(32);
const DAY = 24 * 60 * 60 * 1000;

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

/**
 * @param {{ env: Record<string, string>, header?: string, platform?: any }} o
 */
async function call({ env, header, platform }) {
	vi.resetModules();
	vi.doMock('$env/dynamic/private', () => ({ env }));
	const { POST } = await import('./+server.js');
	/** @type {Record<string, string>} */
	const headers = header === undefined ? {} : { 'x-cron-secret': header };
	const request = new Request('https://kinkyvibe.ar/api/cron/vigilancia', {
		method: 'POST',
		headers
	});
	return POST(/** @type {any} */ ({ request, platform, fetch }));
}

describe('POST /api/cron/vigilancia', () => {
	it('sin CRON_SECRET configurado: 503; con el secreto equivocado o sin header: 401', async () => {
		expect((await call({ env: {}, header: SECRET, platform: t.platform })).status).toBe(503);
		expect(
			(await call({ env: { CRON_SECRET: SECRET }, header: 'x'.repeat(32), platform: t.platform }))
				.status
		).toBe(401);
		expect((await call({ env: { CRON_SECRET: SECRET }, platform: t.platform })).status).toBe(401);
	});

	it('empieza a mirar los crons y borra los conteos de más de 7 días', async () => {
		await recordServerError(t.db, { now: Date.now() - 8 * DAY, route: '/', status: 500 });
		await recordServerError(t.db, { now: Date.now(), route: '/', status: 500 });
		const res = await call({
			env: { CRON_SECRET: SECRET },
			header: SECRET,
			platform: { env: { DB: t.db } }
		});
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ crons: { stale: [] }, errorRowsDeleted: 1 });
		const { results } = await t.db.prepare('SELECT cron FROM cron_heartbeats ORDER BY cron').all();
		expect(results.map((r) => r.cron)).toEqual([
			'*/15 * * * *',
			'0 6 * * *',
			'15 21 * * *',
			'41 * * * *'
		]);
	});
});
