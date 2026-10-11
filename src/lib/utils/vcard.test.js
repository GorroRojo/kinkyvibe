import { describe, expect, it } from 'vitest';
import { foldLine, hasContact, profileVcard, vcardEscape } from './vcard.js';

/** Las líneas lógicas (desplegadas) de una vCard. @param {string} v */
const unfold = (v) => v.replace(/\r\n /g, '').split('\r\n').filter(Boolean);

/** Una barra invertida (así el texto de los tests se lee sin escapes dobles). */
const B = '\\';

const PERSON = {
	title: 'Persona Inventada',
	kind: 'persona',
	bio: 'Bio; con, comas\ny salto',
	image: '/media/img/cara.webp',
	links: ['https://example.com/yo', 'javascript:alert(1)'],
	email: 'persona@example.com',
	tel: '+54 11 0000-0000'
};

describe('vcardEscape y foldLine', () => {
	it('escapa barra, coma, punto y coma y saltos', () => {
		expect(vcardEscape(`a${B}b,c;d\ne`)).toBe(`a${B}${B}b${B},c${B};d${B}ne`);
	});
	it('corta en 75 bytes sin partir caracteres', () => {
		const folded = foldLine('NOTE:' + 'ñ'.repeat(100));
		for (const part of folded.split('\r\n')) {
			expect(new TextEncoder().encode(part).length).toBeLessThanOrEqual(75);
		}
		expect(folded.replace(/\r\n /g, '')).toBe('NOTE:' + 'ñ'.repeat(100));
	});
});

describe('profileVcard', () => {
	it('una persona con su contacto público', () => {
		const v = profileVcard({ profile: PERSON, canonical: '/amigues/Persona-Inventada' });
		expect(v.startsWith('BEGIN:VCARD\r\nVERSION:3.0\r\n')).toBe(true);
		expect(v.endsWith('END:VCARD\r\n')).toBe(true);
		const lines = unfold(v);
		expect(lines).toContain('FN:Persona Inventada');
		expect(lines).toContain('N:;Persona Inventada;;;');
		expect(lines).toContain(`NOTE:Bio${B}; con${B}, comas${B}ny salto`);
		expect(lines).toContain('URL:https://kinkyvibe.ar/amigues/Persona-Inventada');
		expect(lines).toContain('URL:https://example.com/yo');
		expect(lines).toContain('EMAIL;TYPE=INTERNET:persona@example.com');
		expect(lines).toContain('TEL:+541100000000');
		expect(lines).toContain('PHOTO;VALUE=URI:https://kinkyvibe.ar/media/img/cara.webp');
		expect(v).not.toContain('javascript:');
		expect(v).not.toContain('ADR');
	});

	it('un proyecto va como organización', () => {
		const lines = unfold(
			profileVcard({
				profile: { title: 'Proyecto Inventado', kind: 'proyecto', email: 'p@example.com' },
				canonical: '/amigues/Proyecto-Inventado'
			})
		);
		expect(lines).toContain('ORG:Proyecto Inventado');
		expect(lines).toContain('X-ABShowAs:COMPANY');
	});

	it('un lugar con la dirección oculta, de solo nombre o de solo zona: sin ADR', () => {
		const profile = { title: 'Lugar Inventado', kind: 'lugar', email: 'l@example.com' };
		/** @type {import('./venues.js').VenueView[]} */
		const views = [
			{ level: 'hidden' },
			{ level: 'name', name: 'Lugar Inventado' },
			{ level: 'area', area: 'Barrio Inventado', city: 'CABA' }
		];
		for (const location of views) {
			const v = profileVcard({ profile, canonical: '/amigues/Lugar-Inventado', location });
			expect(v).not.toContain('ADR');
			expect(v).not.toContain('Barrio Inventado');
		}
	});

	it('un lugar público: con su dirección', () => {
		const lines = unfold(
			profileVcard({
				profile: { title: 'Lugar Inventado', kind: 'lugar', email: 'l@example.com' },
				canonical: '/amigues/Lugar-Inventado',
				location: {
					level: 'public',
					name: 'Lugar Inventado',
					address: 'Calle Falsa 123',
					city: 'CABA'
				}
			})
		);
		expect(lines).toContain('ADR;TYPE=WORK:;;Calle Falsa 123;CABA;;;Argentina');
	});

	it('hasContact: sin links válidos, mail ni teléfono, no hay tarjeta', () => {
		expect(hasContact({ links: ['javascript:x'], email: null, tel: null })).toBe(false);
		expect(hasContact(PERSON)).toBe(true);
	});
});
