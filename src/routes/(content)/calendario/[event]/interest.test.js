import { readdirSync, readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import { VISITOR_COOKIE } from '$lib/server/db/interest.js';
import { actions, load } from './+page.server.js';

// The page's load also computes related posts (from every post in the repo); that's covered
// elsewhere and is slow under vitest, so stub it here and only assert on `interest`.
vi.mock('$lib/utils', () => ({
	fetchPost: vi.fn(async () => ({ meta: {} })),
	fetchMarkdownPosts: vi.fn(async () => []),
	relatedPostsFor: vi.fn(() => []),
	currentRelated: vi.fn(() => ({ relatedPosts: [], relatedPastCount: 0 }))
}));

// Un evento publicado real del repo (el contenido cambia, así que lo buscamos).
const EVENTS_DIR = 'src/lib/posts/calendario';
const EVENT = /** @type {string} */ (
	readdirSync(EVENTS_DIR)
		.filter((f) => f.endsWith('.md') && !f.startsWith('_'))
		.find((f) => !/^force_unpublished:\s*true/m.test(readFileSync(`${EVENTS_DIR}/${f}`, 'utf8')))
		?.replace(/\.md$/, '')
);

/** Cookies mínimas compatibles con las de SvelteKit. */
function fakeCookies(initial = /** @type {Record<string, string>} */ ({})) {
	const jar = new Map(Object.entries(initial));
	/** @type {Record<string, any>} */
	const options = {};
	return {
		jar,
		options,
		get: (/** @type {string} */ name) => jar.get(name),
		set: (/** @type {string} */ name, /** @type {string} */ value, /** @type {any} */ opts) => {
			jar.set(name, value);
			options[name] = opts;
		}
	};
}

/**
 * @param {{ platform?: App.Platform, cookies?: ReturnType<typeof fakeCookies>, event?: string, interested?: string }} o
 */
function makeEvent({ platform, cookies = fakeCookies(), event = EVENT, interested = '1' }) {
	const body = new FormData();
	body.set('interested', interested);
	return /** @type {any} */ ({
		params: { event },
		platform,
		cookies,
		request: new Request(`http://localhost/calendario/${event}?/interest`, { method: 'POST', body })
	});
}

/** @param {any} event */
const runAction = (event) => /** @type {any} */ (actions.interest(event));

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

describe('/calendario/[event] con base de datos', () => {
	it('encontró un evento para probar', () => {
		expect(EVENT).toBeTruthy();
	});

	it('load muestra el contador en cero', async () => {
		const data = await load(makeEvent({ platform: t.platform }));
		expect(data).toMatchObject({ interest: { count: 0, interested: false } });
	});

	it('la action crea la cookie anónima, cuenta y es idempotente', async () => {
		const cookies = fakeCookies();
		const result = await runAction(makeEvent({ platform: t.platform, cookies }));
		expect(result).toEqual({ interest: { count: 1, interested: true } });

		const id = cookies.jar.get(VISITOR_COOKIE);
		expect(id).toMatch(/^[0-9a-f-]{36}$/);
		expect(cookies.options[VISITOR_COOKIE]).toMatchObject({
			httpOnly: true,
			sameSite: 'lax',
			path: '/calendario'
		});

		// Mismo navegador otra vez: no suma.
		await runAction(makeEvent({ platform: t.platform, cookies }));
		expect(await load(makeEvent({ platform: t.platform, cookies }))).toMatchObject({
			interest: { count: 1, interested: true }
		});

		// Otro navegador: suma.
		await runAction(makeEvent({ platform: t.platform }));
		expect(await load(makeEvent({ platform: t.platform }))).toMatchObject({
			interest: { count: 2, interested: false }
		});

		// El primero lo quita.
		const removed = await runAction(makeEvent({ platform: t.platform, cookies, interested: '0' }));
		expect(removed).toEqual({ interest: { count: 1, interested: false } });

		// En la base no aparece el id de la cookie.
		const { results } = await t.db.prepare('SELECT * FROM event_interest').all();
		expect(JSON.stringify(results)).not.toContain(id);
	});

	it('ignora cookies con formato inválido', async () => {
		const cookies = fakeCookies({ [VISITOR_COOKIE]: "' OR 1=1 --" });
		await runAction(makeEvent({ platform: t.platform, cookies }));
		expect(cookies.jar.get(VISITOR_COOKIE)).toMatch(/^[0-9a-f-]{36}$/);
	});

	it('rechaza eventos que no existen', async () => {
		const result = await runAction(
			makeEvent({ platform: t.platform, event: 'no-existe-este-evento' })
		);
		expect(result.status).toBe(404);
		const template = await runAction(makeEvent({ platform: t.platform, event: '_event_template' }));
		expect(template.status).toBe(404);
	});

	it('devuelve 429 cuando se abusa', async () => {
		const cookies = fakeCookies();
		/** @type {any} */
		let result;
		for (let i = 0; i < 11; i++) {
			result = await runAction(
				makeEvent({ platform: t.platform, cookies, interested: i % 2 ? '0' : '1' })
			);
		}
		expect(result.status).toBe(429);
		expect(result.data.error).toMatch(/Demasiados intentos/);
	});
});

describe('/calendario/[event] sin base de datos', () => {
	it('load devuelve interest: null (el botón se oculta)', async () => {
		expect(await load(makeEvent({}))).toMatchObject({ interest: null });
		expect(await load(makeEvent({ platform: /** @type {any} */ ({ env: {} }) }))).toMatchObject({
			interest: null
		});
	});

	it('la action responde 503', async () => {
		const result = await runAction(makeEvent({}));
		expect(result.status).toBe(503);
	});

	it('si faltan las migraciones, load degrada a null con un aviso', async () => {
		const empty = await createTestDB({ migrate: false });
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		try {
			expect(await load(makeEvent({ platform: empty.platform }))).toMatchObject({ interest: null });
			const result = await runAction(makeEvent({ platform: empty.platform }));
			expect(result.status).toBe(500);
			expect(warn).toHaveBeenCalledWith(expect.stringContaining('db:migrate:local'));
		} finally {
			warn.mockRestore();
			await empty.dispose();
		}
	});
});
