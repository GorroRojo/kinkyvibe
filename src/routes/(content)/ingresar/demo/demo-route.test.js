/**
 * /ingresar/demo («Entrar como persona de prueba»): 404 en producción (este build no es un
 * preview, como producción) y para cuentas que no son del seed (el caso «interruptor `cuentas`
 * apagado» se fue con el interruptor, que quedó prendido para siempre). En un preview
 * (simulado), entra con la sesión normal y lleva a Mi rincón.
 * D1 de miniflare; datos inventados.
 */
import { readFile } from 'node:fs/promises';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { unstable_splitSqlQuery } from 'wrangler';
import { createTestDB, resetDB } from '$lib/server/db/testing.js';

/** @type {Awaited<ReturnType<typeof createTestDB>>} */
let t;
beforeAll(async () => {
	t = await createTestDB();
}, 60_000);
afterAll(async () => {
	await t?.dispose();
});
beforeEach(async () => {
	await resetDB(t.db);
	for (const file of ['n3-personas.sql', 'n3-cuentas.sql']) {
		const sql = await readFile(
			new URL(`../../../../../scripts/demo/${file}`, import.meta.url),
			'utf8'
		);
		const statements = unstable_splitSqlQuery(sql).filter((s) => s.trim());
		await t.db.batch(statements.map((s) => t.db.prepare(s)));
	}
});
afterEach(() => {
	vi.doUnmock('$env/dynamic/private');
	vi.doUnmock('$lib/server/deploy.js');
	vi.resetModules();
});

/**
 * La ruta (sin variables de entorno) y, si `preview`, simulando un deploy de preview.
 * @param {{ preview?: boolean }} [o]
 */
async function route({ preview = false } = {}) {
	vi.resetModules();
	vi.doMock('$env/dynamic/private', () => ({ env: {} }));
	if (preview) {
		vi.doMock('$lib/server/deploy.js', async (orig) => ({
			.../** @type {object} */ (await orig()),
			isPreviewDeploy: () => true
		}));
	}
	return {
		page: await import('./+page.server.js'),
		accounts: await import('$lib/server/cuentas/accounts.js'),
		session: await import('$lib/server/cuentas/session.js')
	};
}

/** @param {Record<string, string>} [form] */
function fakeEvent(form) {
	const url = new URL('/ingresar/demo', 'https://kinkyvibe.ar');
	/** @type {Record<string, string>} */
	const jar = {};
	return /** @type {any} */ ({
		url,
		platform: t.platform,
		locals: { user: undefined, user_token: '', member: undefined },
		setHeaders: () => {},
		request: new Request(url, {
			method: form ? 'POST' : 'GET',
			body: form ? new URLSearchParams(form) : undefined
		}),
		cookies: {
			get: (/** @type {string} */ k) => jar[k],
			set: (/** @type {string} */ k, /** @type {string} */ v) => {
				jar[k] = v;
			},
			delete: (/** @type {string} */ k) => {
				delete jar[k];
			}
		},
		jar
	});
}

/** @param {() => unknown} fn */
async function thrown(fn) {
	try {
		await fn();
		return null;
	} catch (e) {
		return /** @type {any} */ (e);
	}
}

const sessionCount = async () =>
	Number((await t.db.prepare('SELECT COUNT(*) AS n FROM account_sessions').first())?.n);

describe('/ingresar/demo en producción', () => {
	it('la página y la action dan 404 y no abren ninguna sesión, aunque el seed esté cargado', async () => {
		const m = await route();
		expect((await thrown(() => m.page.load(fakeEvent())))?.status).toBe(404);
		for (const persona of ['con-entradas', 'gestiona-perfil', 'nueva']) {
			const event = fakeEvent({ persona });
			expect((await thrown(() => m.page.actions.default(event)))?.status).toBe(404);
			expect(event.jar).toEqual({});
		}
		expect(await sessionCount()).toBe(0);
	});
});

describe('/ingresar/demo en un preview', () => {
	it('muestra las personas y entra con la sesión normal', async () => {
		const m = await route({ preview: true });
		const data = /** @type {any} */ (await m.page.load(fakeEvent()));
		expect(data.personas.map((/** @type {any} */ p) => [p.key, p.ready])).toEqual([
			['con-entradas', true],
			['gestiona-perfil', true],
			['nueva', true]
		]);
		const event = fakeEvent({ persona: 'gestiona-perfil' });
		const r = await thrown(() => m.page.actions.default(event));
		expect([r?.status, r?.location]).toEqual([303, '/mi-rincon']);
		const found = await m.session.getSessionAccount(t.db, event.jar[m.session.SESSION_COOKIE]);
		expect(found?.email).toBe('demo.gestiona@example.invalid');
	});

	it('con una cuenta que no es del seed da 404', async () => {
		const m = await route({ preview: true });
		const real = await m.accounts.upsertVerifiedAccount(t.db, 'persona.real@example.com');
		for (const persona of [real.id, real.email, 'otra', '']) {
			const event = fakeEvent({ persona });
			expect((await thrown(() => m.page.actions.default(event)))?.status).toBe(404);
			expect(event.jar).toEqual({});
		}
		// Sin campo.
		expect((await thrown(() => m.page.actions.default(fakeEvent({}))))?.status).toBe(404);
		expect(await sessionCount()).toBe(0);
	});
});
