/**
 * «No fui yo» (suppressions.js): el link firmado, la tabla `email_suppressions`, el tope de mails a
 * una dirección sin confirmar y `deliver()` con `optOut` (un mail que no es de una compra pagada no
 * sale a una dirección que lo pidió; uno de una compra pagada, sí). D1 de miniflare, mails
 * inventados (example.com).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest';
import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import { emailHash } from '$lib/server/cuentas/accounts.js';
import { deliverEmail } from '$lib/server/tickets/index.js';
import {
	OPT_OUT_PATH,
	UNCONFIRMED_MAIL_CAP,
	checkOptOutToken,
	isFreeOrder,
	isSuppressed,
	optOutUrl,
	suppressByToken,
	suppressionHash,
	unconfirmedMailAllowed
} from './suppressions.js';

vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

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

const ORIGIN = 'https://kinkyvibe.example';
const EMAIL = 'persona.prueba@example.com';
const NOW = Date.parse('2026-10-24T12:00:00-03:00');

/** @param {string} email */
async function tokenFor(email) {
	const url = String(await optOutUrl(t.db, ORIGIN, email));
	return url.slice(`${ORIGIN}${OPT_OUT_PATH}`.length);
}

describe('el link firmado', () => {
	it('lleva el mismo hash que los límites de las cuentas, nunca el mail', async () => {
		const url = String(await optOutUrl(t.db, ORIGIN, EMAIL));
		expect(url).toMatch(
			/^https:\/\/kinkyvibe\.example\/mails\/no-fui-yo\/[0-9a-f]{64}\.[\w-]{32}$/
		);
		expect(url).not.toContain('persona');
		expect(url).toContain(await emailHash(EMAIL));
		// Mayúsculas y espacios no cambian la dirección.
		expect(await optOutUrl(t.db, ORIGIN, '  Persona.Prueba@EXAMPLE.com ')).toBe(url);
		expect(await suppressionHash('')).toBeNull();
		expect(await optOutUrl(t.db, ORIGIN, '')).toBeNull();
	});

	it('vale tal cual; con la firma o el hash tocados, no', async () => {
		const token = await tokenFor(EMAIL);
		expect(await checkOptOutToken(t.db, token)).toBe(await emailHash(EMAIL));
		const [hash, sig] = token.split('.');
		const flip = (/** @type {string} */ c) => (c === 'A' ? 'B' : 'A');
		const badSig = `${hash}.${flip(sig[0])}${sig.slice(1)}`;
		const otherHash = `${await emailHash('otra@example.com')}.${sig}`;
		for (const bad of [badSig, otherHash, `${hash}.`, hash, `${token}x`, '', null, 42]) {
			expect(await checkOptOutToken(t.db, bad)).toBeNull();
			expect(await suppressByToken(t.db, bad)).toBe(false);
		}
		expect(await isSuppressed(t.db, EMAIL)).toBe(false);
		expect(await isSuppressed(t.db, 'otra@example.com')).toBe(false);
	});

	it('usarlo anota la dirección (sin el mail); dos veces es lo mismo que una', async () => {
		const token = await tokenFor(EMAIL);
		expect(await suppressByToken(t.db, token, NOW)).toBe(true);
		expect(await suppressByToken(t.db, token, NOW + 1)).toBe(true);
		const { results } = await t.db.prepare('SELECT * FROM email_suppressions').all();
		expect(results).toEqual([{ email_hash: await emailHash(EMAIL), created_at: NOW }]);
		expect(await isSuppressed(t.db, 'PERSONA.prueba@example.com')).toBe(true);
		expect(await isSuppressed(t.db, 'otra@example.com')).toBe(false);
	});
});

describe('isFreeOrder', () => {
	it('solo mira el medio: gratis, sí; cualquier orden paga, no (sin importar el estado)', () => {
		expect(isFreeOrder({ payment_method: 'gratis' })).toBe(true);
		for (const m of ['mercadopago', 'transferencia', 'efectivo', 'otro'])
			expect(isFreeOrder({ payment_method: m })).toBe(false);
	});
});

describe('tope de mails a una dirección sin confirmar', () => {
	it(`${UNCONFIRMED_MAIL_CAP.limit} por día por dirección (sin importar mayúsculas); otra dirección, aparte`, async () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		onTestFinished(() => warn.mockRestore());
		for (let i = 0; i < UNCONFIRMED_MAIL_CAP.limit; i++)
			expect(await unconfirmedMailAllowed(t.db, i % 2 ? EMAIL.toUpperCase() : EMAIL, NOW)).toBe(
				true
			);
		expect(await unconfirmedMailAllowed(t.db, EMAIL, NOW)).toBe(false);
		expect(await unconfirmedMailAllowed(t.db, 'otra@example.com', NOW)).toBe(true);
		// Al día siguiente, de nuevo.
		expect(await unconfirmedMailAllowed(t.db, EMAIL, NOW + 24 * 60 * 60 * 1000)).toBe(true);
	});

	it('si la base falla, no se manda', async () => {
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		onTestFinished(() => error.mockRestore());
		const broken = /** @type {any} */ ({
			prepare: () => ({ bind: () => ({}) }),
			batch: async () => {
				throw new Error('D1 caída (de prueba)');
			}
		});
		expect(await unconfirmedMailAllowed(broken, EMAIL, NOW)).toBe(false);
	});
});

describe('deliver() con optOut', () => {
	const message = { subject: 'Asunto de prueba', html: '<p>Hola</p>', text: 'Hola' };

	/** Los mails «simulados» (dev, sin RESEND_API_KEY) en esta prueba. */
	function simulated() {
		const log = vi.spyOn(console, 'log').mockImplementation(() => {});
		onTestFinished(() => log.mockRestore());
		return () => log.mock.calls.filter((c) => String(c[0]).includes('email simulado')).length;
	}

	it('a una dirección con «No fui yo»: no sale (vuelve simulated); sin optOut, sale', async () => {
		const count = simulated();
		await suppressByToken(t.db, await tokenFor(EMAIL), NOW);
		const fetch = /** @type {any} */ (vi.fn());
		expect(await deliverEmail({ db: t.db, fetch, to: EMAIL, message, optOut: true })).toBe(
			'simulated'
		);
		expect(count()).toBe(0);
		// Un mail de una compra pagada (sin optOut) sale igual.
		expect(await deliverEmail({ db: t.db, fetch, to: EMAIL, message })).toBe('simulated');
		expect(count()).toBe(1);
		// Otra dirección, con optOut, sale.
		expect(
			await deliverEmail({ db: t.db, fetch, to: 'otra@example.com', message, optOut: true })
		).toBe('simulated');
		expect(count()).toBe(2);
		expect(fetch).not.toHaveBeenCalled();
	});

	it('si no se puede revisar la tabla, no sale (failed, para reintentar)', async () => {
		const count = simulated();
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		onTestFinished(() => error.mockRestore());
		const broken = /** @type {any} */ ({
			prepare: () => ({
				bind: () => ({
					first: async () => {
						throw new Error('D1 caída (de prueba)');
					}
				})
			})
		});
		const fetch = /** @type {any} */ (vi.fn());
		expect(await deliverEmail({ db: broken, fetch, to: EMAIL, message, optOut: true })).toBe(
			'failed'
		);
		expect(await deliverEmail({ db: null, fetch, to: EMAIL, message, optOut: true })).toBe(
			'failed'
		);
		expect(count()).toBe(0);
	});
});
