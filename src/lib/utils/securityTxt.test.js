import { describe, expect, it } from 'vitest';
import { SECURITY_TXT_DAYS, securityTxt } from './securityTxt.js';
import { DEFAULT_CONTACT_EMAIL } from './tickets.js';
import { GET } from '../../routes/.well-known/security.txt/+server.js';

const NOW = Date.UTC(2031, 0, 15, 13, 45);

/** Los campos `Nombre: valor` (RFC 9116, sección 2.4). @param {string} text */
const fields = (text) =>
	text
		.split('\n')
		.filter(Boolean)
		.map((line) => {
			const m = line.match(/^([A-Za-z-]+): (.+)$/);
			expect(m, line).not.toBeNull();
			return [m?.[1], m?.[2]];
		});

describe('security.txt', () => {
	it('tiene Contact y un solo Expires, con el formato de la RFC 9116', () => {
		const text = securityTxt({ now: NOW });
		const f = fields(text);
		expect(f.filter(([k]) => k === 'Contact').length).toBeGreaterThan(0);
		expect(f.filter(([k]) => k === 'Expires')).toHaveLength(1);
		expect(text.endsWith('\n')).toBe(true);
	});

	it('el contacto es el público de la organización, como URI', () => {
		const contact = Object.fromEntries(fields(securityTxt({ now: NOW }))).Contact;
		expect(contact).toBe(`mailto:${DEFAULT_CONTACT_EMAIL}`);
	});

	it('vence a menos de un año, al principio del día', () => {
		const expires = Object.fromEntries(fields(securityTxt({ now: NOW }))).Expires ?? '';
		const date = new Date(expires);
		expect(expires).toMatch(/^\d{4}-\d{2}-\d{2}T00:00:00\.000Z$/);
		expect(date.getTime()).toBeGreaterThan(NOW);
		expect(date.getTime() - NOW).toBeLessThan(365 * 24 * 60 * 60 * 1000);
		expect(SECURITY_TXT_DAYS).toBeLessThan(365);
	});

	it('la ruta lo sirve como texto plano', async () => {
		const res = await GET(/** @type {any} */ ({}));
		expect(res.headers.get('content-type')).toBe('text/plain; charset=utf-8');
		const text = await res.text();
		expect(text).toContain('Canonical: https://kinkyvibe.ar/.well-known/security.txt');
	});
});
