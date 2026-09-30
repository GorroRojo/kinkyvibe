/**
 * Cuentas del público contra un D1 de miniflare: códigos, límites, contraseñas, sesiones,
 * borrado y compras por mail verificado. Datos inventados (dominio example.com).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import {
	checkPassword,
	deleteAccount,
	emailHash,
	getAccount,
	getAccountByEmail,
	normalizeEmail,
	removePassword,
	setPassword,
	upsertVerifiedAccount
} from './accounts.js';
import {
	CODE_MAX_ATTEMPTS,
	CODE_TTL_MS,
	createLoginCode,
	normalizeCode,
	verifyLoginCode
} from './codes.js';
import {
	MESSAGES,
	checkConfirmCode,
	isConfirmPurpose,
	requestConfirmCode,
	RATE_LIMITS,
	eventRequiresAccount,
	passwordLogin,
	requestCode,
	verifyCode
} from './index.js';
import { ordersForAccount } from './orders.js';
import {
	LAST_SEEN_EVERY_MS,
	SESSION_COOKIE_MAX_AGE,
	createSession,
	destroyOtherSessions,
	destroySession,
	getSessionAccount,
	sessionCookieOptions
} from './session.js';

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

const NOW = Date.parse('2026-10-01T12:00:00Z');
const EMAIL = 'persona.prueba@example.com';
const CLIENT = 'cliente-de-prueba';
const PW = 'una frase bastante larga';

/** Mails "mandados" en el test. */
function fakeSender() {
	/** @type {{ to: string, subject: string, text: string, code: string }[]} */
	const sent = [];
	/** @type {import('./index.js').SendMail} */
	const send = async (to, message) => {
		const code = message.text.match(/\b(\d{6})\b/)?.[1] ?? '';
		sent.push({ to, subject: message.subject, text: message.text, code });
		return 'sent';
	};
	return { sent, send };
}

let orderSeq = 0;
/**
 * Orden mínima válida (datos inventados).
 * @param {{ email: string, status?: string, accountId?: string | null, createdAt?: number, slug?: string }} o
 */
async function insertOrder({
	email,
	status = 'approved',
	accountId = null,
	createdAt = NOW,
	slug = 'evento-de-prueba'
}) {
	const id = `00000000-0000-4000-8000-${String(++orderSeq).padStart(12, '0')}`;
	await t.db
		.prepare(
			`INSERT INTO orders (id, event_slug, ticket_type, quantity, unit_price, subtotal, total,
				buyer_name, buyer_email, status, created_at, updated_at, expires_at, account_id)
			VALUES (?1, ?2, 'general', 1, 1000, 1000, 1000, 'Persona de Prueba', ?3, ?4, ?5, ?5, ?5, ?6)`
		)
		.bind(id, slug, email, status, createdAt, accountId)
		.run();
	return id;
}

describe('normalización', () => {
	it('mail: espacios y mayúsculas; rechaza lo que no es mail', () => {
		expect(normalizeEmail('  Persona.Prueba@Example.COM ')).toBe(EMAIL);
		expect(normalizeEmail('sin-arroba')).toBeNull();
		expect(normalizeEmail('a b@example.com')).toBeNull();
		expect(normalizeEmail(42)).toBeNull();
	});
	it('código: acepta espacios y guiones', () => {
		expect(normalizeCode('123 456')).toBe('123456');
		expect(normalizeCode('123-456')).toBe('123456');
		expect(normalizeCode('12345')).toBeNull();
		expect(normalizeCode('abcdef')).toBeNull();
	});
});

describe('códigos por mail', () => {
	it('el código sirve una sola vez y no se guarda en claro', async () => {
		const hash = await emailHash(EMAIL);
		const { code } = await createLoginCode(t.db, hash, { now: NOW });
		const row = await t.db.prepare('SELECT * FROM login_codes').first();
		expect(JSON.stringify(row)).not.toContain(code);
		expect(JSON.stringify(row)).not.toContain(EMAIL);
		expect(await verifyLoginCode(t.db, hash, code, { now: NOW + 1000 })).toBe('ok');
		expect(await verifyLoginCode(t.db, hash, code, { now: NOW + 2000 })).toBe('expired');
	});

	it('vence a los 10 minutos', async () => {
		const hash = await emailHash(EMAIL);
		const { code } = await createLoginCode(t.db, hash, { now: NOW });
		expect(await verifyLoginCode(t.db, hash, code, { now: NOW + CODE_TTL_MS })).toBe('expired');
		const again = await createLoginCode(t.db, hash, { now: NOW });
		expect(await verifyLoginCode(t.db, hash, again.code, { now: NOW + CODE_TTL_MS - 1 })).toBe(
			'ok'
		);
	});

	it(`después de ${CODE_MAX_ATTEMPTS} intentos fallidos, ni el correcto sirve`, async () => {
		const hash = await emailHash(EMAIL);
		const { code } = await createLoginCode(t.db, hash, { now: NOW });
		const wrong = code === '000000' ? '111111' : '000000';
		for (let i = 0; i < CODE_MAX_ATTEMPTS; i++) {
			expect(await verifyLoginCode(t.db, hash, wrong, { now: NOW })).toBe('wrong');
		}
		expect(await verifyLoginCode(t.db, hash, code, { now: NOW })).toBe('expired');
	});

	it('pedir otro código anula el anterior', async () => {
		const hash = await emailHash(EMAIL);
		const first = await createLoginCode(t.db, hash, { now: NOW });
		const second = await createLoginCode(t.db, hash, { now: NOW + 1000 });
		// El viejo queda marcado como usado; escribirlo cuenta como intento contra el nuevo.
		const { results } = await t.db
			.prepare('SELECT used_at FROM login_codes ORDER BY created_at')
			.all();
		expect(results.map((r) => r.used_at)).toEqual([NOW + 1000, null]);
		if (first.code !== second.code) {
			expect(await verifyLoginCode(t.db, hash, first.code, { now: NOW + 2000 })).toBe('wrong');
		}
		expect(await verifyLoginCode(t.db, hash, second.code, { now: NOW + 2000 })).toBe('ok');
	});

	it('el código de un mail no sirve para otro', async () => {
		const { code } = await createLoginCode(t.db, await emailHash(EMAIL), { now: NOW });
		const other = await emailHash('otra.persona@example.com');
		expect(await verifyLoginCode(t.db, other, code, { now: NOW })).toBe('expired');
	});
});

describe('ingresar con código', () => {
	it('manda el código y crea la cuenta verificada al ingresar (una sola vez)', async () => {
		const { sent, send } = fakeSender();
		const r = await requestCode({
			db: t.db,
			email: ' Persona.Prueba@example.com',
			client: CLIENT,
			send,
			now: NOW
		});
		expect(r).toEqual({ ok: true, email: EMAIL });
		expect(sent).toHaveLength(1);
		expect(sent[0].to).toBe(EMAIL);
		expect(sent[0].subject).not.toMatch(/\d{6}/);
		expect(await getAccountByEmail(t.db, EMAIL)).toBeNull(); // todavía no hay cuenta

		const v = await verifyCode({
			db: t.db,
			email: EMAIL,
			code: sent[0].code,
			client: CLIENT,
			now: NOW + 1000
		});
		expect(v.ok).toBe(true);
		if (!v.ok) return;
		expect(v.account.email).toBe(EMAIL);
		expect(v.account.email_verified_at).toBe(NOW + 1000);

		// Segundo ingreso: la misma cuenta.
		await requestCode({ db: t.db, email: EMAIL, client: CLIENT, send, now: NOW + 60_000 });
		const v2 = await verifyCode({
			db: t.db,
			email: EMAIL,
			code: sent[1].code,
			client: CLIENT,
			now: NOW + 61_000
		});
		expect(v2.ok && v2.account.id).toBe(v.account.id);
		const { results } = await t.db.prepare('SELECT id FROM accounts').all();
		expect(results).toHaveLength(1);
	});

	it('mensajes: código equivocado y vencido', async () => {
		const { sent, send } = fakeSender();
		await requestCode({ db: t.db, email: EMAIL, client: CLIENT, send, now: NOW });
		const wrong = sent[0].code === '000000' ? '111111' : '000000';
		const w = await verifyCode({ db: t.db, email: EMAIL, code: wrong, client: CLIENT, now: NOW });
		expect(w).toMatchObject({ ok: false, message: MESSAGES.wrongCode });
		const e = await verifyCode({
			db: t.db,
			email: EMAIL,
			code: sent[0].code,
			client: CLIENT,
			now: NOW + CODE_TTL_MS
		});
		expect(e).toMatchObject({ ok: false, message: MESSAGES.expiredCode });
		const bad = await verifyCode({ db: t.db, email: EMAIL, code: '12', client: CLIENT, now: NOW });
		expect(bad).toMatchObject({ ok: false, message: MESSAGES.badCode });
	});

	it('si el mail no se puede mandar, lo dice', async () => {
		const r = await requestCode({
			db: t.db,
			email: EMAIL,
			client: CLIENT,
			send: async () => 'failed',
			now: NOW
		});
		expect(r).toMatchObject({ ok: false, status: 502, message: MESSAGES.mailFailed });
	});

	it('límite de códigos por mail (aunque cambie la conexión)', async () => {
		const { sent, send } = fakeSender();
		const n = RATE_LIMITS.codeRequestEmail.limit;
		for (let i = 0; i < n; i++) {
			const r = await requestCode({ db: t.db, email: EMAIL, client: `c${i}`, send, now: NOW });
			expect(r.ok).toBe(true);
		}
		const r = await requestCode({ db: t.db, email: EMAIL, client: 'otra', send, now: NOW });
		expect(r).toMatchObject({ ok: false, status: 429, message: MESSAGES.tooManyCodes });
		expect(sent).toHaveLength(n);
		// Otro mail sigue pudiendo.
		const other = await requestCode({
			db: t.db,
			email: 'otra.persona@example.com',
			client: 'otra',
			send,
			now: NOW
		});
		expect(other.ok).toBe(true);
	});

	it('límite de códigos por conexión (para cualquier mail)', async () => {
		const { send } = fakeSender();
		const n = RATE_LIMITS.codeRequestClient.limit;
		for (let i = 0; i < n; i++) {
			const r = await requestCode({
				db: t.db,
				email: `persona${i}@example.com`,
				client: CLIENT,
				send,
				now: NOW
			});
			expect(r.ok).toBe(true);
		}
		const r = await requestCode({
			db: t.db,
			email: 'una.mas@example.com',
			client: CLIENT,
			send,
			now: NOW
		});
		expect(r).toMatchObject({ ok: false, status: 429 });
	});

	it('límite de intentos de código por conexión', async () => {
		const n = RATE_LIMITS.codeVerifyClient.limit;
		for (let i = 0; i < n; i++) {
			const r = await verifyCode({
				db: t.db,
				email: `p${i}@example.com`,
				code: '123456',
				client: CLIENT,
				now: NOW
			});
			expect(r).toMatchObject({ ok: false, message: MESSAGES.expiredCode });
		}
		const r = await verifyCode({
			db: t.db,
			email: EMAIL,
			code: '123456',
			client: CLIENT,
			now: NOW
		});
		expect(r).toMatchObject({ ok: false, status: 429, message: MESSAGES.tooManyAttempts });
	});

	it('los límites no guardan el mail ni la conexión en claro', async () => {
		const { send } = fakeSender();
		await requestCode({ db: t.db, email: EMAIL, client: CLIENT, send, now: NOW });
		const { results } = await t.db.prepare('SELECT bucket FROM rate_limits').all();
		expect(results.length).toBeGreaterThan(0);
		for (const r of results) {
			expect(String(r.bucket)).not.toContain(EMAIL);
			expect(String(r.bucket)).not.toContain(CLIENT);
		}
	});
});

describe('códigos para confirmar (acciones delicadas de Mi rincón)', () => {
	/** @param {string} code */
	const other = (code) => (code === '000000' ? '111111' : '000000');

	it('cada código sirve solo para su purpose', async () => {
		const { sent, send } = fakeSender();
		const r = await requestConfirmCode({
			db: t.db,
			email: EMAIL,
			purpose: 'password',
			client: CLIENT,
			send,
			now: NOW
		});
		expect(r.ok).toBe(true);
		expect(sent[0].subject).toBe('Tu código para confirmar en KinkyVibe');
		const pwCode = sent[0].code;
		// No sirve para ingresar ni para borrar.
		expect(
			await verifyCode({ db: t.db, email: EMAIL, code: pwCode, client: CLIENT, now: NOW })
		).toMatchObject({ ok: false, message: MESSAGES.expiredCode });
		expect(
			await checkConfirmCode({
				db: t.db,
				email: EMAIL,
				purpose: 'delete',
				code: pwCode,
				client: CLIENT,
				now: NOW
			})
		).toMatchObject({ ok: false, message: MESSAGES.expiredCode });
		// Y sigue sirviendo para lo suyo (los intentos de arriba no lo tocaron).
		expect(
			await checkConfirmCode({
				db: t.db,
				email: EMAIL,
				purpose: 'password',
				code: pwCode,
				client: CLIENT,
				now: NOW
			})
		).toEqual({ ok: true });

		// Uno de ingreso no confirma nada.
		await requestCode({ db: t.db, email: EMAIL, client: CLIENT, send, now: NOW });
		const loginCode = sent[1].code;
		for (const purpose of /** @type {const} */ (['password', 'delete'])) {
			expect(
				await checkConfirmCode({
					db: t.db,
					email: EMAIL,
					purpose,
					code: loginCode,
					client: CLIENT,
					now: NOW
				})
			).toMatchObject({ ok: false });
		}
		expect(
			(await verifyCode({ db: t.db, email: EMAIL, code: loginCode, client: CLIENT, now: NOW })).ok
		).toBe(true);
	});

	it('pedir uno de confirmación no anula el de ingreso (ni al revés)', async () => {
		const hash = await emailHash(EMAIL);
		const login = await createLoginCode(t.db, hash, { now: NOW });
		const del = await createLoginCode(t.db, hash, { now: NOW, purpose: 'delete' });
		expect(await verifyLoginCode(t.db, hash, login.code, { now: NOW })).toBe('ok');
		expect(await verifyLoginCode(t.db, hash, del.code, { now: NOW, purpose: 'delete' })).toBe('ok');
	});

	it('vence, se usa una sola vez y tiene 5 intentos', async () => {
		const { sent, send } = fakeSender();
		const args = {
			db: t.db,
			email: EMAIL,
			purpose: /** @type {const} */ ('delete'),
			client: CLIENT
		};
		await requestConfirmCode({ ...args, send, now: NOW });
		expect(
			await checkConfirmCode({ ...args, code: sent[0].code, now: NOW + CODE_TTL_MS })
		).toMatchObject({ ok: false, message: MESSAGES.expiredCode });

		await requestConfirmCode({ ...args, send, now: NOW });
		expect(await checkConfirmCode({ ...args, code: sent[1].code, now: NOW + 1 })).toEqual({
			ok: true
		});
		expect(await checkConfirmCode({ ...args, code: sent[1].code, now: NOW + 2 })).toMatchObject({
			ok: false,
			message: MESSAGES.expiredCode
		});

		await requestConfirmCode({ ...args, send, now: NOW });
		for (let i = 0; i < CODE_MAX_ATTEMPTS; i++) {
			expect(
				await checkConfirmCode({ ...args, code: other(sent[2].code), now: NOW })
			).toMatchObject({ ok: false, message: MESSAGES.wrongCode });
		}
		expect(await checkConfirmCode({ ...args, code: sent[2].code, now: NOW })).toMatchObject({
			ok: false,
			message: MESSAGES.expiredCode
		});
	});

	it('los mismos límites que los de ingreso (y el mismo cupo por mail)', async () => {
		const { sent, send } = fakeSender();
		const n = RATE_LIMITS.codeRequestEmail.limit;
		await requestCode({ db: t.db, email: EMAIL, client: 'c-login', send, now: NOW });
		for (let i = 1; i < n; i++) {
			const r = await requestConfirmCode({
				db: t.db,
				email: EMAIL,
				purpose: 'password',
				client: `c${i}`,
				send,
				now: NOW
			});
			expect(r.ok).toBe(true);
		}
		const r = await requestConfirmCode({
			db: t.db,
			email: EMAIL,
			purpose: 'delete',
			client: 'otra',
			send,
			now: NOW
		});
		expect(r).toMatchObject({ ok: false, status: 429, message: MESSAGES.tooManyCodes });
		expect(sent).toHaveLength(n);

		// Intentos por conexión: compartidos con los de ingreso.
		for (let i = 0; i < RATE_LIMITS.codeVerifyClient.limit; i++) {
			await checkConfirmCode({
				db: t.db,
				email: `p${i}@example.com`,
				purpose: 'password',
				code: '123456',
				client: 'x',
				now: NOW
			});
		}
		expect(
			await checkConfirmCode({
				db: t.db,
				email: EMAIL,
				purpose: 'password',
				code: sent[n - 1].code,
				client: 'x',
				now: NOW
			})
		).toMatchObject({ ok: false, status: 429 });
		expect(
			await verifyCode({ db: t.db, email: EMAIL, code: '123456', client: 'x', now: NOW })
		).toMatchObject({ ok: false, status: 429 });
	});

	it('purpose desconocido: error', async () => {
		await expect(
			createLoginCode(t.db, 'x', { purpose: /** @type {any} */ ('otra') })
		).rejects.toThrow(RangeError);
		expect(isConfirmPurpose('login')).toBe(false);
		expect(isConfirmPurpose('password')).toBe(true);
	});
});

describe('contraseña', () => {
	it('poner, ingresar, cambiar y sacar', async () => {
		const account = await upsertVerifiedAccount(t.db, EMAIL, { now: NOW });
		expect(await setPassword(t.db, account.id, 'corta')).toMatch(/al menos/);
		expect(await setPassword(t.db, account.id, PW, { now: NOW })).toBeNull();
		expect((await getAccount(t.db, account.id))?.has_password).toBe(true);
		const stored = await t.db.prepare('SELECT password_hash FROM accounts').first();
		expect(String(stored?.password_hash)).not.toContain(PW);

		const ok = await passwordLogin({
			db: t.db,
			email: EMAIL.toUpperCase(),
			password: PW,
			client: CLIENT,
			now: NOW
		});
		expect(ok.ok && ok.account.id).toBe(account.id);

		await setPassword(t.db, account.id, 'otra frase bastante larga', { now: NOW });
		expect(await checkPassword(t.db, EMAIL, PW)).toBeNull();
		expect((await checkPassword(t.db, EMAIL, 'otra frase bastante larga'))?.id).toBe(account.id);

		await removePassword(t.db, account.id);
		expect(await checkPassword(t.db, EMAIL, 'otra frase bastante larga')).toBeNull();
	});

	it('mismo mensaje sin cuenta, sin contraseña o con la contraseña mal (sin enumerar)', async () => {
		const withPw = await upsertVerifiedAccount(t.db, EMAIL, { now: NOW });
		await setPassword(t.db, withPw.id, PW);
		await upsertVerifiedAccount(t.db, 'sin.contrasena@example.com', { now: NOW });
		const cases = [
			{ email: 'nadie@example.com', password: PW },
			{ email: 'sin.contrasena@example.com', password: PW },
			{ email: EMAIL, password: 'no es esta para nada' }
		];
		for (const c of cases) {
			const r = await passwordLogin({ db: t.db, ...c, client: CLIENT, now: NOW });
			expect(r).toEqual({ ok: false, status: 400, message: MESSAGES.badLogin });
		}
	});

	it('límite de intentos por mail y por conexión', async () => {
		const account = await upsertVerifiedAccount(t.db, EMAIL, { now: NOW });
		await setPassword(t.db, account.id, PW, { iterations: 1000 });
		for (let i = 0; i < RATE_LIMITS.passwordEmail.limit; i++) {
			await passwordLogin({
				db: t.db,
				email: EMAIL,
				password: 'mal mal mal mal',
				client: `c${i}`,
				now: NOW
			});
		}
		// Ni la contraseña correcta, desde otra conexión, hasta que pase la ventana.
		const blocked = await passwordLogin({
			db: t.db,
			email: EMAIL,
			password: PW,
			client: 'nueva',
			now: NOW
		});
		expect(blocked).toMatchObject({ ok: false, status: 429 });
		const later = NOW + RATE_LIMITS.passwordEmail.windowSeconds * 1000;
		const ok = await passwordLogin({
			db: t.db,
			email: EMAIL,
			password: PW,
			client: 'nueva',
			now: later
		});
		expect(ok.ok).toBe(true);

		for (let i = 0; i < RATE_LIMITS.passwordClient.limit; i++) {
			await passwordLogin({
				db: t.db,
				email: `p${i}@example.com`,
				password: 'x',
				client: CLIENT,
				now: later
			});
		}
		const perClient = await passwordLogin({
			db: t.db,
			email: EMAIL,
			password: PW,
			client: CLIENT,
			now: later
		});
		expect(perClient).toMatchObject({ ok: false, status: 429 });
	});

	it('rehace el hash si tiene parámetros viejos', async () => {
		const account = await upsertVerifiedAccount(t.db, EMAIL, { now: NOW });
		await setPassword(t.db, account.id, PW, { iterations: 1000 });
		expect(
			String((await t.db.prepare('SELECT password_hash FROM accounts').first())?.password_hash)
		).toContain('$1000$');
		expect(await checkPassword(t.db, EMAIL, PW)).not.toBeNull();
		expect(
			String((await t.db.prepare('SELECT password_hash FROM accounts').first())?.password_hash)
		).not.toContain('$1000$');
	});
});

describe('sesiones', () => {
	it('solo se guarda el hash del token; la sesión no vence sola', async () => {
		const account = await upsertVerifiedAccount(t.db, EMAIL, { now: NOW });
		const token = await createSession(t.db, account.id, 'code', { now: NOW });
		expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
		const row = await t.db.prepare('SELECT * FROM account_sessions').first();
		expect(JSON.stringify(row)).not.toContain(token);

		const tenYears = NOW + 10 * 365 * 24 * 60 * 60 * 1000;
		const found = await getSessionAccount(t.db, token, { now: tenYears });
		expect(found).toEqual({ id: account.id, email: EMAIL, touched: true });
		// last_seen se actualiza como mucho una vez por día.
		expect((await getSessionAccount(t.db, token, { now: tenYears + 1000 }))?.touched).toBe(false);
		expect(
			(await getSessionAccount(t.db, token, { now: tenYears + LAST_SEEN_EVERY_MS }))?.touched
		).toBe(true);
	});

	it('cookie: httpOnly, SameSite=Lax, Secure fuera de localhost y el máximo de vida', () => {
		const prod = sessionCookieOptions(new URL('https://kinkyvibe.ar/mi-rincon'));
		expect(prod).toMatchObject({ httpOnly: true, sameSite: 'lax', secure: true, path: '/' });
		expect(prod.maxAge).toBe(SESSION_COOKIE_MAX_AGE);
		expect(SESSION_COOKIE_MAX_AGE).toBe(400 * 24 * 60 * 60);
		expect(sessionCookieOptions(new URL('http://localhost:5173/')).secure).toBe(false);
	});

	it('cerrar sesión borra solo esa sesión', async () => {
		const account = await upsertVerifiedAccount(t.db, EMAIL, { now: NOW });
		const a = await createSession(t.db, account.id, 'code', { now: NOW });
		const b = await createSession(t.db, account.id, 'password', { now: NOW });
		await destroySession(t.db, a);
		expect(await getSessionAccount(t.db, a, { now: NOW })).toBeNull();
		expect(await getSessionAccount(t.db, b, { now: NOW })).not.toBeNull();
	});

	it('destroyOtherSessions deja solo la actual', async () => {
		const account = await upsertVerifiedAccount(t.db, EMAIL, { now: NOW });
		const a = await createSession(t.db, account.id, 'code', { now: NOW });
		const b = await createSession(t.db, account.id, 'code', { now: NOW });
		await destroyOtherSessions(t.db, account.id, b);
		expect(await getSessionAccount(t.db, a, { now: NOW })).toBeNull();
		expect(await getSessionAccount(t.db, b, { now: NOW })).not.toBeNull();
	});

	it('tokens inválidos o desconocidos: null', async () => {
		expect(await getSessionAccount(t.db, undefined)).toBeNull();
		expect(await getSessionAccount(t.db, 'corto')).toBeNull();
		expect(await getSessionAccount(t.db, 'A'.repeat(43))).toBeNull();
	});
});

describe('borrar la cuenta', () => {
	it('las órdenes quedan desvinculadas; sesiones, códigos y datos se van', async () => {
		const account = await upsertVerifiedAccount(t.db, EMAIL, { now: NOW });
		await setPassword(t.db, account.id, PW, { iterations: 1000 });
		const token = await createSession(t.db, account.id, 'code', { now: NOW });
		await createLoginCode(t.db, await emailHash(EMAIL), { now: NOW });
		const linked = await insertOrder({ email: 'otro.mail@example.com', accountId: account.id });
		const byEmail = await insertOrder({ email: EMAIL });

		expect(await deleteAccount(t.db, account.id, { now: NOW + 1 })).toBe(true);

		const orders = await t.db.prepare('SELECT id, account_id FROM orders ORDER BY id').all();
		expect(orders.results).toEqual([
			{ id: linked, account_id: null },
			{ id: byEmail, account_id: null }
		]);
		expect(await getSessionAccount(t.db, token, { now: NOW + 2 })).toBeNull();
		expect((await t.db.prepare('SELECT COUNT(*) AS n FROM account_sessions').first())?.n).toBe(0);
		expect((await t.db.prepare('SELECT COUNT(*) AS n FROM login_codes').first())?.n).toBe(0);
		const row = await t.db.prepare('SELECT * FROM accounts WHERE id = ?1').bind(account.id).first();
		expect(row).toMatchObject({
			email: null,
			password_hash: null,
			email_verified_at: null,
			preferences: '{}',
			deleted_at: NOW + 1
		});
		expect(await getAccount(t.db, account.id)).toBeNull();
		expect(await ordersForAccount(t.db, account.id)).toEqual([]);
		expect(await deleteAccount(t.db, account.id)).toBe(false);

		// El mail queda libre: una cuenta nueva es otra, y ve las compras de su mail (P7.5).
		const again = await upsertVerifiedAccount(t.db, EMAIL, { now: NOW + 3 });
		expect(again.id).not.toBe(account.id);
		expect((await ordersForAccount(t.db, again.id)).map((o) => o.id)).toEqual([byEmail]);
	});
});

describe('compras de la cuenta', () => {
	it('por mail verificado (sin importar mayúsculas) y por account_id; sin reservas vencidas', async () => {
		const account = await upsertVerifiedAccount(t.db, EMAIL, { now: NOW });
		const a = await insertOrder({ email: EMAIL, createdAt: NOW - 3000 });
		const b = await insertOrder({
			email: 'Persona.Prueba@Example.com',
			createdAt: NOW - 2000,
			status: 'awaiting_transfer'
		});
		const c = await insertOrder({
			email: 'otro.mail@example.com',
			accountId: account.id,
			createdAt: NOW - 1000,
			status: 'refunded'
		});
		await insertOrder({ email: EMAIL, status: 'expired' });
		await insertOrder({ email: EMAIL, status: 'cancelled' });
		await insertOrder({ email: EMAIL, status: 'pending' });
		await insertOrder({ email: 'otra.persona@example.com' });

		const orders = await ordersForAccount(t.db, account.id);
		expect(orders.map((o) => o.id)).toEqual([c, b, a]);
		expect(orders[0]).toMatchObject({
			event_slug: 'evento-de-prueba',
			quantity: 1,
			total: 1000,
			status: 'refunded'
		});
		// Solo columnas para listar: nada de DNI ni nombres.
		expect(Object.keys(orders[0]).sort()).toEqual(
			[
				'created_at',
				'event_slug',
				'id',
				'payment_method',
				'quantity',
				'status',
				'ticket_type',
				'total'
			].sort()
		);
	});

	it('sin mail verificado, las compras por mail no aparecen', async () => {
		const account = await upsertVerifiedAccount(t.db, EMAIL, { now: NOW });
		await t.db.prepare('UPDATE accounts SET email_verified_at = NULL').run();
		await insertOrder({ email: EMAIL });
		const linked = await insertOrder({ email: 'otro.mail@example.com', accountId: account.id });
		expect((await ordersForAccount(t.db, account.id)).map((o) => o.id)).toEqual([linked]);
	});

	it('una cuenta no ve las compras de otra', async () => {
		const one = await upsertVerifiedAccount(t.db, EMAIL, { now: NOW });
		const two = await upsertVerifiedAccount(t.db, 'otra.persona@example.com', { now: NOW });
		const mine = await insertOrder({ email: EMAIL });
		await insertOrder({ email: 'otra.persona@example.com' });
		expect((await ordersForAccount(t.db, one.id)).map((o) => o.id)).toEqual([mine]);
		expect(await ordersForAccount(t.db, two.id)).toHaveLength(1);
	});
});

describe('evento que pide cuenta (hook, P7.1)', () => {
	it('solo con requiere_cuenta: true', () => {
		expect(eventRequiresAccount({ requiere_cuenta: true })).toBe(true);
		expect(eventRequiresAccount({ requiere_cuenta: 'true' })).toBe(false);
		expect(eventRequiresAccount({})).toBe(false);
		expect(eventRequiresAccount(null)).toBe(false);
	});
});

describe('esquema', () => {
	it('una cuenta activa necesita mail; una borrada no puede tener datos', async () => {
		await expect(
			t.db
				.prepare('INSERT INTO accounts (id, email, created_at, updated_at) VALUES (?1, NULL, 1, 1)')
				.bind(crypto.randomUUID())
				.run()
		).rejects.toThrow();
		await expect(
			t.db
				.prepare('INSERT INTO accounts (id, email, created_at, updated_at) VALUES (?1, ?2, 1, 1)')
				.bind(crypto.randomUUID(), 'Con.Mayusculas@example.com')
				.run()
		).rejects.toThrow();
		await expect(
			t.db
				.prepare(
					"INSERT INTO accounts (id, email, password_hash, created_at, updated_at, deleted_at) VALUES (?1, NULL, 'x', 1, 1, 1)"
				)
				.bind(crypto.randomUUID())
				.run()
		).rejects.toThrow();
	});
});
