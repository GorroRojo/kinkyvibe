/**
 * Validación del `initData` de la Mini App (la puerta por Telegram): vectores armados acá con
 * `node:crypto` (otra implementación del mismo algoritmo de las docs de Telegram) y un token
 * inventado. Nunca sale nada a la red.
 */
import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { INIT_DATA_MAX_AGE_SEC, parseInitData, validateInitData } from './initData.js';

const TOKEN = '123456789:token-inventado-solo-para-pruebas';
const NOW = Date.parse('2031-01-08T12:00:00Z');
const NOW_SEC = Math.floor(NOW / 1000);
const USER = JSON.stringify({ id: 4242, first_name: 'Persona Inventada', username: 'inventade' });

/**
 * Un `initData` firmado como lo firma Telegram (docs: secret = HMAC_SHA256("WebAppData", token);
 * hash = hex(HMAC_SHA256(secret, data_check_string))).
 *
 * @param {Record<string, string>} fields
 * @param {string} [token]
 */
function sign(fields, token = TOKEN) {
	const dcs = Object.keys(fields)
		.sort()
		.map((k) => `${k}=${fields[k]}`)
		.join('\n');
	const secret = createHmac('sha256', 'WebAppData').update(token).digest();
	const hash = createHmac('sha256', secret).update(dcs).digest('hex');
	return new URLSearchParams({ ...fields, hash }).toString();
}

const GOOD = { auth_date: String(NOW_SEC - 60), query_id: 'AAHdF6IQAAAAAN0XohDhrOrc', user: USER };

describe('validateInitData', () => {
	it('acepta uno bien firmado y reciente, y devuelve el usuario', async () => {
		expect(await validateInitData(sign(GOOD), TOKEN, { now: NOW })).toEqual({
			ok: true,
			user: { id: 4242, first_name: 'Persona Inventada', username: 'inventade' },
			authDate: NOW_SEC - 60
		});
	});

	it('con `signature` (Bot API 8.0) también entra en la cuenta, como cualquier campo', async () => {
		const withSig = { ...GOOD, signature: 'firma-inventada-base64url' };
		expect((await validateInitData(sign(withSig), TOKEN, { now: NOW })).ok).toBe(true);
	});

	it('otro token: rechaza', async () => {
		const r = await validateInitData(sign(GOOD, '987654321:otro-token-inventado'), TOKEN, {
			now: NOW
		});
		expect(r).toEqual({ ok: false, reason: 'bad_hash' });
	});

	it('un campo cambiado (otro usuario) o agregado: rechaza', async () => {
		const good = sign(GOOD);
		const tampered = good.replace(encodeURIComponent('"id":4242'), encodeURIComponent('"id":1'));
		expect(tampered).not.toBe(good);
		expect((await validateInitData(tampered, TOKEN, { now: NOW })).ok).toBe(false);
		expect((await validateInitData(`${good}&extra=1`, TOKEN, { now: NOW })).ok).toBe(false);
	});

	it('viejo (más de una hora) o del futuro: rechaza', async () => {
		const old = sign({ ...GOOD, auth_date: String(NOW_SEC - INIT_DATA_MAX_AGE_SEC - 1) });
		expect(await validateInitData(old, TOKEN, { now: NOW })).toEqual({
			ok: false,
			reason: 'stale'
		});
		const future = sign({ ...GOOD, auth_date: String(NOW_SEC + 3600) });
		expect(await validateInitData(future, TOKEN, { now: NOW })).toEqual({
			ok: false,
			reason: 'stale'
		});
	});

	it('roto: sin hash, hash raro, claves repetidas, vacío, enorme', async () => {
		for (const bad of [
			'auth_date=1&user=%7B%7D',
			'hash=zz',
			`${sign(GOOD)}&hash=${'0'.repeat(64)}`,
			`${sign(GOOD)}&user=${encodeURIComponent(USER)}`,
			'',
			'x'.repeat(5000),
			42
		]) {
			expect((await validateInitData(bad, TOKEN, { now: NOW })).ok, String(bad).slice(0, 30)).toBe(
				false
			);
		}
	});

	it('sin usuario: rechaza aunque la firma esté bien', async () => {
		const noUser = { auth_date: GOOD.auth_date, query_id: GOOD.query_id };
		expect(await validateInitData(sign(noUser), TOKEN, { now: NOW })).toEqual({
			ok: false,
			reason: 'no_user'
		});
	});

	it('sin token configurado: no valida nada', async () => {
		expect(await validateInitData(sign(GOOD), '', { now: NOW })).toEqual({
			ok: false,
			reason: 'no_token'
		});
	});

	it('el data-check-string ordena las claves y deja afuera solo el hash', () => {
		const p = parseInitData(sign({ b: '2', a: '1' }));
		expect(p?.dataCheckString).toBe('a=1\nb=2');
	});
});
