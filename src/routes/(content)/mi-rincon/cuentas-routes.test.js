/**
 * Páginas de cuentas (/ingresar, /mi-rincon), el link del encabezado y `locals.member`, con el
 * interruptor `cuentas` apagado y prendido. D1 de miniflare; datos inventados.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import { accountLink } from '$lib/utils/cuentas.js';

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
	vi.resetModules();
});

const EMAIL = 'persona.prueba@example.com';

/** Módulos con la variable CUENTAS_ENABLED que se pida ('' = lo que diga la base). */
async function modules(flag = '') {
	vi.resetModules();
	vi.doMock('$env/dynamic/private', () => ({ env: { CUENTAS_ENABLED: flag } }));
	return {
		ingresar: await import('../ingresar/+page.server.js'),
		rincon: await import('./+page.server.js'),
		root: await import('../../+layout.server.js'),
		web: await import('$lib/server/cuentas/web.js'),
		accounts: await import('$lib/server/cuentas/accounts.js'),
		session: await import('$lib/server/cuentas/session.js'),
		flags: await import('$lib/server/flags.js')
	};
}

/**
 * Evento de SvelteKit de mentira.
 * @param {{ path?: string, cookies?: Record<string, string>, form?: Record<string, string>, member?: { id: string, email: string } }} [o]
 */
function fakeEvent({ path = '/', cookies = {}, form, member } = {}) {
	const url = new URL(path, 'https://kinkyvibe.ar');
	const jar = { ...cookies };
	/** @type {any} */
	const event = {
		url,
		platform: t.platform,
		locals: { user: undefined, user_token: '', member },
		setHeaders: () => {},
		getClientAddress: () => '203.0.113.7',
		fetch,
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
	};
	return event;
}

/**
 * Lo que tira (error o redirect de SvelteKit) una función, o `null` si no tira.
 * @param {() => unknown} fn
 * @returns {Promise<any>}
 */
async function thrown(fn) {
	try {
		await fn();
		return null;
	} catch (e) {
		return e;
	}
}

describe('interruptor apagado', () => {
	it('/ingresar y /mi-rincon dan 404, también sus actions', async () => {
		const m = await modules('');
		expect((await thrown(() => m.ingresar.load(fakeEvent({ path: '/ingresar' }))))?.status).toBe(
			404
		);
		const form = { email: EMAIL };
		expect(
			(await thrown(() => m.ingresar.actions.codigo(fakeEvent({ path: '/ingresar', form }))))
				?.status
		).toBe(404);
		expect(
			(await thrown(() => m.ingresar.actions.contrasena(fakeEvent({ path: '/ingresar', form }))))
				?.status
		).toBe(404);
		const member = { id: crypto.randomUUID(), email: EMAIL };
		expect(
			(await thrown(() => m.rincon.load(fakeEvent({ path: '/mi-rincon', member }))))?.status
		).toBe(404);
		expect(
			(
				await thrown(() =>
					m.rincon.actions.borrar(
						fakeEvent({ path: '/mi-rincon', member, form: { confirm: 'borrar' } })
					)
				)
			)?.status
		).toBe(404);
		// Nada se escribió.
		expect((await t.db.prepare('SELECT COUNT(*) AS n FROM login_codes').first())?.n).toBe(0);
	});

	it('CUENTAS_ENABLED=0 apaga aunque la base diga prendido', async () => {
		const m = await modules('0');
		await m.flags.setFlag(t.db, 'cuentas', true, { by: 'admin-de-prueba' });
		expect((await thrown(() => m.ingresar.load(fakeEvent({ path: '/ingresar' }))))?.status).toBe(
			404
		);
	});

	it('el encabezado no muestra el link', async () => {
		const m = await modules('');
		const data = await m.root.load(/** @type {any} */ (fakeEvent()));
		expect(data.cuentas).toBe(false);
		expect(accountLink(data)).toBeNull();
		expect(accountLink({ cuentas: false, member: true })).toBeNull();
	});

	it('una cookie de sesión válida no carga `locals.member`', async () => {
		const m = await modules('');
		const account = await m.accounts.upsertVerifiedAccount(t.db, EMAIL);
		const token = await m.session.createSession(t.db, account.id, 'code');
		const event = fakeEvent({ cookies: { [m.session.SESSION_COOKIE]: token } });
		await m.web.loadMember(event);
		expect(event.locals.member).toBeUndefined();
	});
});

describe('interruptor prendido', () => {
	it('prendido desde la base (panel): /ingresar anda y el encabezado dice "Ingresar"', async () => {
		const m = await modules('');
		await m.flags.setFlag(t.db, 'cuentas', true, { by: 'admin-de-prueba' });
		expect(await m.ingresar.load(fakeEvent({ path: '/ingresar' }))).toEqual({
			next: '/mi-rincon',
			deleted: false
		});
		const data = await m.root.load(/** @type {any} */ (fakeEvent()));
		expect(accountLink(data)).toEqual({ href: '/ingresar', label: 'Ingresar' });
	});

	it('?next= solo acepta rutas de este sitio', async () => {
		const m = await modules('1');
		for (const bad of [
			'//evil.example',
			'https://evil.example/x',
			'/\\evil.example',
			'javascript:alert(1)'
		]) {
			const r = await m.ingresar.load(
				fakeEvent({ path: `/ingresar?next=${encodeURIComponent(bad)}` })
			);
			expect(r.next).toBe('/mi-rincon');
		}
		const ok = await m.ingresar.load(fakeEvent({ path: '/ingresar?next=%2Fcalendario%3Fx%3D1' }));
		expect(ok.next).toBe('/calendario?x=1');
	});

	it('con sesión: el encabezado dice "Mi rincón" y /ingresar lleva a next', async () => {
		const m = await modules('1');
		const account = await m.accounts.upsertVerifiedAccount(t.db, EMAIL);
		const token = await m.session.createSession(t.db, account.id, 'code');
		const event = fakeEvent({
			path: '/ingresar?next=%2Fcalendario',
			cookies: { [m.session.SESSION_COOKIE]: token }
		});
		await m.web.loadMember(event);
		expect(event.locals.member).toEqual({ id: account.id, email: EMAIL });
		// No toca la sesión de admins.
		expect(event.locals.user).toBeUndefined();
		const data = await m.root.load(event);
		expect(data.member).toBe(true);
		expect(accountLink(data)).toEqual({ href: '/mi-rincon', label: 'Mi rincón' });
		const r = await thrown(() => m.ingresar.load(event));
		expect(r).toMatchObject({ status: 303, location: '/calendario' });
	});

	it('/mi-rincon sin sesión lleva a /ingresar', async () => {
		const m = await modules('1');
		const r = await thrown(() => m.rincon.load(fakeEvent({ path: '/mi-rincon' })));
		expect(r).toMatchObject({ status: 303, location: '/ingresar?next=%2Fmi-rincon' });
	});

	it('pedir código: responde igual para cualquier mail y no crea la cuenta todavía', async () => {
		const m = await modules('1');
		const log = vi.spyOn(console, 'log').mockImplementation(() => {});
		try {
			const r = await m.ingresar.actions.codigo(
				fakeEvent({ path: '/ingresar', form: { email: EMAIL, next: '//evil.example' } })
			);
			expect(r).toEqual({ step: 'code', email: EMAIL, next: '/mi-rincon', sent: true });
		} finally {
			log.mockRestore();
		}
		expect((await t.db.prepare('SELECT COUNT(*) AS n FROM accounts').first())?.n).toBe(0);
		expect((await t.db.prepare('SELECT COUNT(*) AS n FROM login_codes').first())?.n).toBe(1);
	});

	it('Mi rincón: compras, contraseña, cerrar sesión y borrar con confirmación', async () => {
		const m = await modules('1');
		const account = await m.accounts.upsertVerifiedAccount(t.db, EMAIL);
		const token = await m.session.createSession(t.db, account.id, 'code');
		const cookies = { [m.session.SESSION_COOKIE]: token };
		const member = { id: account.id, email: EMAIL };

		const page = await m.rincon.load(fakeEvent({ path: '/mi-rincon', member, cookies }));
		expect(page).toMatchObject({
			email: EMAIL,
			hasPassword: false,
			orders: [],
			ordersError: false
		});

		const mismatch = await m.rincon.actions.contrasena(
			fakeEvent({
				path: '/mi-rincon',
				member,
				cookies,
				form: { password: 'una frase bastante larga', confirm: 'otra' }
			})
		);
		expect(mismatch).toMatchObject({ status: 400 });
		const set = await m.rincon.actions.contrasena(
			fakeEvent({
				path: '/mi-rincon',
				member,
				cookies,
				form: { password: 'una frase bastante larga', confirm: 'una frase bastante larga' }
			})
		);
		expect(set).toMatchObject({ message: 'Contraseña guardada.' });
		// La sesión actual sigue abierta.
		expect(await m.session.getSessionAccount(t.db, token)).not.toBeNull();

		const noConfirm = await m.rincon.actions.borrar(
			fakeEvent({ path: '/mi-rincon', member, cookies, form: { confirm: 'no' } })
		);
		expect(noConfirm).toMatchObject({ status: 400 });
		expect(await m.accounts.getAccount(t.db, account.id)).not.toBeNull();

		const event = fakeEvent({ path: '/mi-rincon', member, cookies, form: { confirm: ' Borrar ' } });
		const r = await thrown(() => m.rincon.actions.borrar(event));
		expect(r).toMatchObject({ status: 303, location: '/ingresar?borrada=1' });
		expect(await m.accounts.getAccount(t.db, account.id)).toBeNull();
		expect(event.jar[m.session.SESSION_COOKIE]).toBeUndefined();
		expect(await m.session.getSessionAccount(t.db, token)).toBeNull();
	});

	it('cerrar sesión borra la sesión y la cookie', async () => {
		const m = await modules('1');
		const account = await m.accounts.upsertVerifiedAccount(t.db, EMAIL);
		const token = await m.session.createSession(t.db, account.id, 'code');
		const event = fakeEvent({
			path: '/mi-rincon',
			member: { id: account.id, email: EMAIL },
			cookies: { [m.session.SESSION_COOKIE]: token },
			form: {}
		});
		const r = await thrown(() => m.rincon.actions.salir(event));
		expect(r).toMatchObject({ status: 303, location: '/' });
		expect(event.jar[m.session.SESSION_COOKIE]).toBeUndefined();
		expect(await m.session.getSessionAccount(t.db, token)).toBeNull();
	});
});
