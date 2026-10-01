import { describe, expect, it } from 'vitest';
import {
	KEY_BYTES,
	PBKDF2_ITERATIONS,
	SALT_BYTES,
	WORKERS_PBKDF2_MAX_ITERATIONS,
	hashPassword,
	needsRehash,
	passwordProblem,
	verifyPassword
} from './password.js';
import { fromBase64url } from '$lib/utils/base64.js';
import { randomDigits } from './crypto.js';

describe('contraseñas (PBKDF2)', () => {
	it('parámetros: dentro del máximo de Workers, sal de 16 bytes, clave de 32', () => {
		expect(PBKDF2_ITERATIONS).toBeLessThanOrEqual(WORKERS_PBKDF2_MAX_ITERATIONS);
		expect(PBKDF2_ITERATIONS).toBeGreaterThanOrEqual(100_000);
		expect(SALT_BYTES).toBeGreaterThanOrEqual(16);
		expect(KEY_BYTES).toBe(32);
	});

	it('hash con formato versionado, sal al azar y verificación', async () => {
		const pw = 'una frase bastante larga';
		const a = await hashPassword(pw);
		const b = await hashPassword(pw);
		expect(a).not.toBe(b); // sal distinta
		const [scheme, iterations, salt, hash] = a.split('$');
		expect(scheme).toBe('pbkdf2-sha256');
		expect(Number(iterations)).toBe(PBKDF2_ITERATIONS);
		expect(fromBase64url(salt)?.length).toBe(SALT_BYTES);
		expect(fromBase64url(hash)?.length).toBe(KEY_BYTES);
		expect(a).not.toContain(pw);
		expect(await verifyPassword(pw, a)).toBe(true);
		expect(await verifyPassword(pw, b)).toBe(true);
		expect(await verifyPassword('una frase bastante largA', a)).toBe(false);
		expect(await verifyPassword('', a)).toBe(false);
	});

	it('normaliza Unicode (NFC): la misma contraseña con tildes escrita de dos formas', async () => {
		const composed = 'contraseña ñandú';
		const decomposed = composed.normalize('NFD');
		expect(decomposed).not.toBe(composed);
		expect(await verifyPassword(decomposed, await hashPassword(composed))).toBe(true);
	});

	it('hash guardado inválido o ausente: false (sin tirar error)', async () => {
		expect(await verifyPassword('loquesea12', null)).toBe(false);
		expect(await verifyPassword('loquesea12', 'texto')).toBe(false);
		expect(await verifyPassword('loquesea12', 'pbkdf2-sha256$abc$x$y')).toBe(false);
		expect(await verifyPassword('loquesea12', 'pbkdf2-sha256$999999999$AAAA$BBBB')).toBe(false);
		expect(await verifyPassword('loquesea12', 'md5$1$a$b')).toBe(false);
	});

	it('needsRehash: con otras iteraciones sí, con las de ahora no', async () => {
		const old = await hashPassword('una frase bastante larga', { iterations: 1000 });
		expect(await verifyPassword('una frase bastante larga', old)).toBe(true);
		expect(needsRehash(old)).toBe(true);
		expect(needsRehash(await hashPassword('una frase bastante larga'))).toBe(false);
	});

	it('valida el largo', () => {
		expect(passwordProblem('corta')).toMatch(/al menos 10/);
		expect(passwordProblem(' '.repeat(12))).toMatch(/espacios/);
		expect(passwordProblem('x'.repeat(201))).toMatch(/hasta 200/);
		expect(passwordProblem(undefined)).toBeTruthy();
		expect(passwordProblem('una frase bastante larga')).toBeNull();
	});
});

describe('crypto', () => {
	it('randomDigits: siempre 6 cifras', () => {
		for (let i = 0; i < 200; i++) expect(randomDigits(6)).toMatch(/^\d{6}$/);
	});
});
