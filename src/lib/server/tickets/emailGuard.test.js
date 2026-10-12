import { describe, expect, it } from 'vitest';
import { parseAllowlist, routeEmail, subjectForLog } from './emailGuard.js';
import { isPreviewDeploy } from '../deploy.js';

describe('parseAllowlist', () => {
	it('separa por comas o espacios, pasa a minúsculas y descarta lo que no es un mail', () => {
		expect(parseAllowlist(' A@x.com, b@y.org  c@z.ar;nada ')).toEqual([
			'a@x.com',
			'b@y.org',
			'c@z.ar'
		]);
	});
	it('vacía sin la variable o con solo espacios', () => {
		expect(parseAllowlist(undefined)).toEqual([]);
		expect(parseAllowlist(' ')).toEqual([]);
	});
});

describe('routeEmail', () => {
	const mail = { to: 'Alguien@Mail.com', subject: 'Tus entradas' };

	it('en producción sin lista, manda a cualquiera sin tocar nada', () => {
		expect(routeEmail({ ...mail, preview: false, allowlist: [] })).toEqual(mail);
	});
	it('en un preview sin lista, no manda nada', () => {
		expect(routeEmail({ ...mail, preview: true, allowlist: [] })).toBeNull();
	});
	it('en un preview, a una dirección de la lista (sin importar mayúsculas) le llega con [DEMO]', () => {
		expect(routeEmail({ ...mail, preview: true, allowlist: ['alguien@mail.com'] })).toEqual({
			to: 'Alguien@Mail.com',
			subject: '[DEMO] Tus entradas'
		});
	});
	it('en un preview, cualquier otra dirección se desvía a la primera de la lista', () => {
		expect(routeEmail({ ...mail, preview: true, allowlist: ['yo@k.ar', 'otre@k.ar'] })).toEqual({
			to: 'yo@k.ar',
			subject: '[DEMO] para Alguien@Mail.com · Tus entradas'
		});
	});
	it('en producción con lista, también la respeta', () => {
		expect(routeEmail({ ...mail, preview: false, allowlist: ['yo@k.ar'] })).toEqual({
			to: 'yo@k.ar',
			subject: '[desviado] para Alguien@Mail.com · Tus entradas'
		});
	});
});

describe('subjectForLog', () => {
	it('tapa los códigos (6 cifras o más) y deja el resto igual', () => {
		expect(subjectForLog('482913 es tu código para entrar a Kinky Vibe')).toBe(
			'•••••• es tu código para entrar a Kinky Vibe'
		);
		expect(subjectForLog('[DEMO] 1234567 es tu código')).toBe('[DEMO] ••••••• es tu código');
		expect(subjectForLog('Tus entradas para Fiesta 2026 (KV-3F2B8C1E)')).toBe(
			'Tus entradas para Fiesta 2026 (KV-3F2B8C1E)'
		);
	});
});

describe('isPreviewDeploy', () => {
	it('solo las ramas que no son main (previews de Workers Builds)', () => {
		expect(isPreviewDeploy('demo')).toBe(true);
		expect(isPreviewDeploy('main')).toBe(false);
		expect(isPreviewDeploy('')).toBe(false);
	});
	it('sin rama de deploy (local y tests) no es preview', () => {
		expect(isPreviewDeploy()).toBe(false);
	});
});
