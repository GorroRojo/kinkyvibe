/**
 * Velocidad de lectura en la cuenta (`accounts.preferences.readingSpeed`): leer y guardar,
 * POST /mi-rincon/velocidad-de-lectura (desde la explicación de «X min de lectura»), Mi rincón →
 * «Velocidad de lectura» y el layout que se la pasa al sitio. D1 de miniflare; datos inventados.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDB, resetDB } from '$lib/server/db/testing.js';

/** @type {Awaited<ReturnType<typeof createTestDB>>} */
let t;
beforeAll(async () => {
	t = await createTestDB();
	// La primera importación de las páginas tarda en transformarse: se paga acá, una vez.
	const warm = await modules();
	await warm.root.load(/** @type {any} */ (fakeEvent(undefined)));
}, 60_000);
afterAll(async () => {
	await t?.dispose();
});
beforeEach(async () => {
	await resetDB(t.db);
});
afterEach(() => {
	vi.doUnmock('$env/dynamic/private');
	vi.resetModules();
});

const EMAIL = 'lectore.prueba@example.com';

/** Los módulos, recién cargados (sin variables de entorno). */
async function modules() {
	vi.resetModules();
	vi.doMock('$env/dynamic/private', () => ({ env: {} }));
	return {
		endpoint: await import('./+server.js'),
		rincon: await import('../+page.server.js'),
		root: await import('../../../+layout.server.js'),
		accounts: await import('$lib/server/cuentas/accounts.js')
	};
}

/**
 * Evento de SvelteKit de mentira.
 * @param {{ id: string, email: string } | undefined} member
 * @param {{ form?: Record<string, string>, json?: unknown, raw?: string, type?: string }} [body]
 */
function fakeEvent(member, { form, json, raw, type } = {}) {
	const url = new URL('/mi-rincon', 'https://kinkyvibe.ar');
	const hasBody = form !== undefined || json !== undefined || raw !== undefined;
	/** @type {any} */
	const event = {
		url,
		platform: t.platform,
		locals: { user: undefined, user_token: '', member },
		setHeaders: () => {},
		getClientAddress: () => '203.0.113.7',
		fetch,
		request: new Request(url, {
			method: hasBody ? 'POST' : 'GET',
			headers:
				json !== undefined || raw !== undefined
					? { 'content-type': type ?? 'application/json' }
					: undefined,
			body: form ? new URLSearchParams(form) : json !== undefined ? JSON.stringify(json) : raw
		}),
		cookies: { get: () => undefined, set: () => {}, delete: () => {} }
	};
	return event;
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

/** @param {Awaited<ReturnType<typeof modules>>} m */
async function signedIn(m) {
	const account = await m.accounts.upsertVerifiedAccount(t.db, EMAIL);
	return { account, member: { id: account.id, email: account.email } };
}

/** @param {string} id */
async function preferences(id) {
	const row = await t.db.prepare('SELECT preferences FROM accounts WHERE id = ?1').bind(id).first();
	return JSON.parse(String(row?.preferences));
}

describe('velocidad de lectura en la cuenta', () => {
	it('sin elegir: null; se guarda, se lleva al rango y «Predeterminado» la saca', async () => {
		const m = await modules();
		const { account } = await signedIn(m);
		expect(await m.accounts.getReadingSpeed(t.db, account.id)).toBeNull();

		expect(await m.accounts.setReadingSpeed(t.db, account.id, 150)).toBe(150);
		expect(await m.accounts.getReadingSpeed(t.db, account.id)).toBe(150);
		expect(await preferences(account.id)).toEqual({ readingSpeed: 150 });

		expect(await m.accounts.setReadingSpeed(t.db, account.id, 5000)).toBe(600);
		expect(await m.accounts.getReadingSpeed(t.db, account.id)).toBe(600);
		expect(await m.accounts.setReadingSpeed(t.db, account.id, 10)).toBe(80);

		// «Predeterminado» (la de siempre) o null: no queda nada guardado.
		expect(await m.accounts.setReadingSpeed(t.db, account.id, 200)).toBeNull();
		expect(await preferences(account.id)).toEqual({});
		await m.accounts.setReadingSpeed(t.db, account.id, 280);
		expect(await m.accounts.setReadingSpeed(t.db, account.id, null)).toBeNull();
		expect(await m.accounts.getReadingSpeed(t.db, account.id)).toBeNull();
	});

	it('no pisa las otras preferencias de la cuenta', async () => {
		const m = await modules();
		const { account } = await signedIn(m);
		await m.accounts.setNoGroupInvites(t.db, account.id, true);
		await m.accounts.setReadingSpeed(t.db, account.id, 250);
		expect(await preferences(account.id)).toEqual({ noGroupInvites: true, readingSpeed: 250 });
		await m.accounts.setReadingSpeed(t.db, account.id, null);
		expect(await m.accounts.getNoGroupInvites(t.db, account.id)).toBe(true);
	});

	it('una cuenta borrada no tiene ni guarda velocidad', async () => {
		const m = await modules();
		const { account } = await signedIn(m);
		await m.accounts.setReadingSpeed(t.db, account.id, 250);
		await m.accounts.deleteAccount(t.db, account.id);
		expect(await m.accounts.getReadingSpeed(t.db, account.id)).toBeNull();
		// Al borrar la cuenta, sus preferencias se vacían (velocidad incluida).
		expect(await preferences(account.id)).toEqual({});
		await m.accounts.setReadingSpeed(t.db, account.id, 300);
		expect(await preferences(account.id)).toEqual({});
	});
});

describe('POST /mi-rincon/velocidad-de-lectura', () => {
	it('sin sesión: 401 y no guarda nada', async () => {
		const m = await modules();
		const e = await thrown(() => m.endpoint.POST(fakeEvent(undefined, { json: { wpm: 250 } })));
		expect(e?.status).toBe(401);
	});

	it('con sesión: guarda (llevado al rango) y null la saca', async () => {
		const m = await modules();
		const { account, member } = await signedIn(m);
		let res = await m.endpoint.POST(fakeEvent(member, { json: { wpm: 250 } }));
		expect(await res.json()).toEqual({ wpm: 250 });
		expect(await m.accounts.getReadingSpeed(t.db, account.id)).toBe(250);

		res = await m.endpoint.POST(fakeEvent(member, { json: { wpm: 9999 } }));
		expect(await res.json()).toEqual({ wpm: 600 });

		res = await m.endpoint.POST(fakeEvent(member, { json: { wpm: null } }));
		expect(await res.json()).toEqual({ wpm: null });
		expect(await m.accounts.getReadingSpeed(t.db, account.id)).toBeNull();
	});

	it('solo JSON con un número o null', async () => {
		const m = await modules();
		const { account, member } = await signedIn(m);
		const asForm = await thrown(() => m.endpoint.POST(fakeEvent(member, { form: { wpm: '250' } })));
		expect(asForm?.status).toBe(415);
		const asText = await thrown(() =>
			m.endpoint.POST(fakeEvent(member, { raw: '{"wpm":250}', type: 'text/plain' }))
		);
		expect(asText?.status).toBe(415);
		const broken = await thrown(() => m.endpoint.POST(fakeEvent(member, { raw: '{no' })));
		expect(broken?.status).toBe(400);
		const noWpm = await thrown(() => m.endpoint.POST(fakeEvent(member, { json: { otra: 1 } })));
		expect(noWpm?.status).toBe(400);
		const text = await thrown(() => m.endpoint.POST(fakeEvent(member, { json: { wpm: '250' } })));
		expect(text?.status).toBe(400);
		expect(await m.accounts.getReadingSpeed(t.db, account.id)).toBeNull();
	});
});

describe('Mi rincón → Velocidad de lectura', () => {
	it('la página trae la de la cuenta y la acción la guarda', async () => {
		const m = await modules();
		const { account, member } = await signedIn(m);
		let page = /** @type {any} */ (await m.rincon.load(fakeEvent(member)));
		expect(page.readingSpeed).toBeNull();

		let r = /** @type {any} */ (
			await m.rincon.actions.velocidad(fakeEvent(member, { form: { velocidad: 'despacio' } }))
		);
		expect(r).toEqual({ action: 'velocidad', message: 'Listo: 150 palabras por minuto.' });
		page = /** @type {any} */ (await m.rincon.load(fakeEvent(member)));
		expect(page.readingSpeed).toBe(150);

		r = await m.rincon.actions.velocidad(
			fakeEvent(member, { form: { velocidad: 'otro', otro: '320' } })
		);
		expect(r.message).toBe('Listo: 320 palabras por minuto.');
		expect(await m.accounts.getReadingSpeed(t.db, account.id)).toBe(320);

		r = await m.rincon.actions.velocidad(fakeEvent(member, { form: { velocidad: 'normal' } }));
		expect(r.message).toBe('Listo: volviste a la velocidad normal.');
		expect(await m.accounts.getReadingSpeed(t.db, account.id)).toBeNull();
	});

	it('«Otro» sin número o una opción que no existe: error y no cambia nada', async () => {
		const m = await modules();
		const { account, member } = await signedIn(m);
		await m.accounts.setReadingSpeed(t.db, account.id, 280);
		const sinNumero = /** @type {any} */ (
			await m.rincon.actions.velocidad(fakeEvent(member, { form: { velocidad: 'otro', otro: '' } }))
		);
		expect(sinNumero.status).toBe(400);
		expect(sinNumero.data.error).toBe('Escribí cuántas palabras por minuto leés.');
		const rara = /** @type {any} */ (
			await m.rincon.actions.velocidad(fakeEvent(member, { form: { velocidad: 'turbo' } }))
		);
		expect(rara.status).toBe(400);
		expect(await m.accounts.getReadingSpeed(t.db, account.id)).toBe(280);
	});

	it('sin sesión, la acción lleva a /ingresar', async () => {
		const m = await modules();
		const r = await thrown(() =>
			m.rincon.actions.velocidad(fakeEvent(undefined, { form: { velocidad: 'rapido' } }))
		);
		expect(r?.status).toBe(303);
		expect(r?.location).toMatch(/^\/ingresar/);
	});
});

describe('el layout le pasa la velocidad de la cuenta al sitio', () => {
	it('con sesión, la de la cuenta; sin sesión o sin elegir, null', async () => {
		const m = await modules();
		const { account, member } = await signedIn(m);
		const anon = /** @type {any} */ (await m.root.load(/** @type {any} */ (fakeEvent(undefined))));
		expect(anon.readingSpeed).toBeNull();
		let data = /** @type {any} */ (await m.root.load(/** @type {any} */ (fakeEvent(member))));
		expect(data.readingSpeed).toBeNull();
		await m.accounts.setReadingSpeed(t.db, account.id, 280);
		data = /** @type {any} */ (await m.root.load(/** @type {any} */ (fakeEvent(member))));
		expect(data.readingSpeed).toBe(280);
	});
});
