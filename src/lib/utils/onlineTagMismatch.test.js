/** Aviso «Online con lugar»: la etiqueta Online más un lugar de verdad. Datos inventados. */
import { describe, expect, it } from 'vitest';
import { ONLINE_MISMATCH_TEXT, hasOnlineTag, onlineTagMismatch } from './onlineTagMismatch.js';

describe('hasOnlineTag', () => {
	it('reconoce Online y sus alias, sin importar mayúsculas ni espacios', () => {
		expect(hasOnlineTag(['español', 'Online'])).toBe(true);
		expect(hasOnlineTag([' online '])).toBe(true);
		expect(hasOnlineTag(['Virtual'])).toBe(true);
	});
	it('sin la etiqueta, o sin lista, no', () => {
		expect(hasOnlineTag(['AMBA', 'taller'])).toBe(false);
		expect(hasOnlineTag(['online-ish'])).toBe(false);
		expect(hasOnlineTag(undefined)).toBe(false);
		expect(hasOnlineTag('Online')).toBe(false);
	});
});

describe('onlineTagMismatch', () => {
	const tags = ['español', 'a la gorra', 'Online'];

	it('Online más un nombre de lugar en texto libre', () => {
		expect(onlineTagMismatch({ tags, location_name: 'Zona Inventada | Casa Ficticia' })).toBe(true);
	});
	it('Online más una dirección', () => {
		expect(onlineTagMismatch({ tags, location: 'Calle Falsa 123, CABA' })).toBe(true);
	});
	it('Online más un lugar vinculado (sin texto libre)', () => {
		expect(onlineTagMismatch({ tags }, { hasVenue: true })).toBe(true);
	});
	it('un «Dónde» que dice Online, Virtual o Zoom no es un lugar', () => {
		expect(onlineTagMismatch({ tags, location_name: 'Online' })).toBe(false);
		expect(onlineTagMismatch({ tags, location: 'virtual' })).toBe(false);
		expect(onlineTagMismatch({ tags, location_name: ' Zoom ', location: 'Google Meet' })).toBe(
			false
		);
		expect(onlineTagMismatch({ tags, location: '   ' })).toBe(false);
	});
	it('sin la etiqueta Online, un lugar no avisa nada', () => {
		expect(
			onlineTagMismatch(
				{ tags: ['AMBA'], location_name: 'Casa Ficticia', location: 'Calle Falsa 123' },
				{ hasVenue: true }
			)
		).toBe(false);
	});
	it('online sin lugar, o sin datos, tampoco', () => {
		expect(onlineTagMismatch({ tags })).toBe(false);
		expect(onlineTagMismatch({ tags }, { hasVenue: false })).toBe(false);
		expect(onlineTagMismatch(null)).toBe(false);
		expect(onlineTagMismatch(undefined, { hasVenue: true })).toBe(false);
	});
	it('`modalidad` no lo apaga: la etiqueta sigue confundiendo', () => {
		expect(
			onlineTagMismatch({ tags, location_name: 'Casa Ficticia', modalidad: 'presencial' })
		).toBe(true);
	});
	it('el texto del aviso', () => {
		expect(ONLINE_MISMATCH_TEXT).toContain('«Online»');
		expect(ONLINE_MISMATCH_TEXT).toContain('sacale la etiqueta');
		expect(ONLINE_MISMATCH_TEXT).toContain('sacale el lugar');
	});
});
