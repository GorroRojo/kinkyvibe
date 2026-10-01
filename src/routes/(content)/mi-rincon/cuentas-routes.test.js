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
		flags: await import('$lib/server/flags.js'),
		codes: await import('$lib/server/cuentas/codes.js')
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
		const data = /** @type {any} */ (await m.root.load(/** @type {any} */ (fakeEvent())));
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
			deleted: false,
			loggedOutEverywhere: false
		});
		const data = /** @type {any} */ (await m.root.load(/** @type {any} */ (fakeEvent())));
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
			const r = /** @type {any} */ (
				await m.ingresar.load(fakeEvent({ path: `/ingresar?next=${encodeURIComponent(bad)}` }))
			);
			expect(r.next).toBe('/mi-rincon');
		}
		const ok = /** @type {any} */ (
			await m.ingresar.load(fakeEvent({ path: '/ingresar?next=%2Fcalendario%3Fx%3D1' }))
		);
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
		const data = /** @type {any} */ (await m.root.load(event));
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

	/**
	 * Cuenta con sesión, y ayudas para llamar a las actions de Mi rincón.
	 * @param {Awaited<ReturnType<typeof modules>>} m
	 */
	async function signedIn(m) {
		const account = await m.accounts.upsertVerifiedAccount(t.db, EMAIL);
		const token = await m.session.createSession(t.db, account.id, 'code');
		const cookies = { [m.session.SESSION_COOKIE]: token };
		const member = { id: account.id, email: EMAIL };
		/** @param {Record<string, string>} [form] */
		const ev = (form) => fakeEvent({ path: '/mi-rincon', member, cookies, form });
		/**
		 * Pide un código de confirmación y lo "lee del mail" (en dev sin Resend, sale en la consola).
		 * @param {'password' | 'delete'} para
		 */
		const confirmCode = async (para) => {
			/** @type {string[]} */
			const logged = [];
			const log = vi.spyOn(console, 'log').mockImplementation((...a) => {
				logged.push(a.join(' '));
			});
			let res;
			try {
				res = await m.rincon.actions.confirmar(ev({ para }));
			} finally {
				log.mockRestore();
			}
			expect(res).toMatchObject({
				codeSentFor: para,
				message: 'Te mandamos un código a tu mail para confirmar.'
			});
			const code = logged.join('\n').match(new RegExp(`Código \\(${para}\\): (\\d{6})`))?.[1];
			expect(code).toMatch(/^\d{6}$/);
			return /** @type {string} */ (code);
		};
		return { account, token, cookies, member, ev, confirmCode };
	}

	const PW = 'una frase bastante larga';

	it('Mi rincón: datos y compras sin pedir código', async () => {
		const m = await modules('1');
		const { ev } = await signedIn(m);
		const page = await m.rincon.load(ev());
		expect(page).toMatchObject({
			email: EMAIL,
			hasPassword: false,
			orders: [],
			ordersError: false
		});
	});

	it('contraseña: sin código fresco no se pone, cambia ni saca', async () => {
		const m = await modules('1');
		const { account, ev, confirmCode } = await signedIn(m);
		const hasPw = async () => (await m.accounts.getAccount(t.db, account.id))?.has_password;

		// Sin código, con un código inventado, o con uno de ingreso: nada.
		expect(await m.rincon.actions.contrasena(ev({ password: PW, confirm: PW }))).toMatchObject({
			status: 400
		});
		expect(
			await m.rincon.actions.contrasena(ev({ password: PW, confirm: PW, code: '123456' }))
		).toMatchObject({ status: 400 });
		const { code: loginCode } = await m.codes.createLoginCode(
			t.db,
			await m.accounts.emailHash(EMAIL),
			{ purpose: 'login' }
		);
		expect(
			await m.rincon.actions.contrasena(ev({ password: PW, confirm: PW, code: loginCode }))
		).toMatchObject({ status: 400 });
		// El de ingreso sigue sirviendo para ingresar (no lo gastó el intento de arriba).
		expect(await m.codes.verifyLoginCode(t.db, await m.accounts.emailHash(EMAIL), loginCode)).toBe(
			'ok'
		);
		// Un código de borrar tampoco sirve para la contraseña.
		const deleteCode = await confirmCode('delete');
		expect(
			await m.rincon.actions.contrasena(ev({ password: PW, confirm: PW, code: deleteCode }))
		).toMatchObject({ status: 400 });
		expect(await hasPw()).toBe(false);

		// Con el código bueno: primero se valida lo demás (no gasta el código)…
		const code = await confirmCode('password');
		expect(
			await m.rincon.actions.contrasena(ev({ password: PW, confirm: 'otra', code }))
		).toMatchObject({ status: 400, data: { codeSentFor: 'password' } });
		// …y después se guarda.
		expect(await m.rincon.actions.contrasena(ev({ password: PW, confirm: PW, code }))).toEqual({
			action: 'contrasena',
			message: 'Contraseña guardada.'
		});
		expect(await hasPw()).toBe(true);

		// Un solo uso: el mismo código no sirve otra vez, ni para sacarla.
		expect(await m.rincon.actions.sacarContrasena(ev({ code }))).toMatchObject({ status: 400 });
		expect(await hasPw()).toBe(true);
		const again = await confirmCode('password');
		expect(await m.rincon.actions.sacarContrasena(ev({ code: again }))).toMatchObject({
			action: 'contrasena'
		});
		expect(await hasPw()).toBe(false);
	});

	it('sacar la contraseña cierra las otras sesiones (queda esta)', async () => {
		const m = await modules('1');
		const { account, token, ev, confirmCode } = await signedIn(m);
		await m.accounts.setPassword(t.db, account.id, PW, { iterations: 1000 });
		const other = await m.session.createSession(t.db, account.id, 'password');
		const code = await confirmCode('password');
		expect(await m.rincon.actions.sacarContrasena(ev({ code }))).toMatchObject({
			action: 'contrasena'
		});
		expect(await m.session.getSessionAccount(t.db, other)).toBeNull();
		expect(await m.session.getSessionAccount(t.db, token)).not.toBeNull();
	});

	it('cerrar sesión en todos lados: se cierran todas, también esta', async () => {
		const m = await modules('1');
		const { account, token, ev } = await signedIn(m);
		const other = await m.session.createSession(t.db, account.id, 'code');
		const stranger = await m.accounts.upsertVerifiedAccount(t.db, 'otra.persona@example.com');
		const strangerToken = await m.session.createSession(t.db, stranger.id, 'code');
		const event = ev({});
		const r = await thrown(() => m.rincon.actions.salirTodos(event));
		expect(r).toMatchObject({ status: 303, location: '/ingresar?salida=todas' });
		expect(event.jar[m.session.SESSION_COOKIE]).toBeUndefined();
		expect(await m.session.getSessionAccount(t.db, token)).toBeNull();
		expect(await m.session.getSessionAccount(t.db, other)).toBeNull();
		expect(await m.session.getSessionAccount(t.db, strangerToken)).not.toBeNull();
	});

	it('borrar: pide «borrar» y un código fresco de borrar', async () => {
		const m = await modules('1');
		const { account, token, ev, confirmCode } = await signedIn(m);
		const alive = async () => (await m.accounts.getAccount(t.db, account.id)) !== null;

		expect(await m.rincon.actions.borrar(ev({ confirm: 'borrar' }))).toMatchObject({
			status: 400
		});
		const pwCode = await confirmCode('password');
		expect(await m.rincon.actions.borrar(ev({ confirm: 'borrar', code: pwCode }))).toMatchObject({
			status: 400
		});
		const { code: loginCode } = await m.codes.createLoginCode(
			t.db,
			await m.accounts.emailHash(EMAIL),
			{ purpose: 'login' }
		);
		expect(await m.rincon.actions.borrar(ev({ confirm: 'borrar', code: loginCode }))).toMatchObject(
			{ status: 400 }
		);
		expect(await alive()).toBe(true);

		const code = await confirmCode('delete');
		// Sin «borrar» no se gasta el código.
		expect(await m.rincon.actions.borrar(ev({ confirm: 'no', code }))).toMatchObject({
			status: 400
		});
		expect(await alive()).toBe(true);

		const event = ev({ confirm: ' Borrar ', code });
		const r = await thrown(() => m.rincon.actions.borrar(event));
		expect(r).toMatchObject({ status: 303, location: '/ingresar?borrada=1' });
		expect(await alive()).toBe(false);
		expect(event.jar[m.session.SESSION_COOKIE]).toBeUndefined();
		expect(await m.session.getSessionAccount(t.db, token)).toBeNull();
	});

	it('pedir código para confirmar: solo purposes conocidos y con límite', async () => {
		const m = await modules('1');
		const { ev, confirmCode } = await signedIn(m);
		expect(await m.rincon.actions.confirmar(ev({ para: 'login' }))).toMatchObject({
			status: 400
		});
		const { RATE_LIMITS } = await import('$lib/server/cuentas/index.js');
		for (let i = 0; i < RATE_LIMITS.codeRequestEmail.limit; i++) await confirmCode('password');
		const log = vi.spyOn(console, 'log').mockImplementation(() => {});
		try {
			expect(await m.rincon.actions.confirmar(ev({ para: 'delete' }))).toMatchObject({
				status: 429
			});
		} finally {
			log.mockRestore();
		}
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
