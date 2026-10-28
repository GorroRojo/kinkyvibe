import { describe, expect, it } from 'vitest';
import { contactLink, supportLink } from './footer.js';
import { DEFAULT_CONTACT_EMAIL } from './tickets.js';

// El caso «propinas apagado → Cafecito» se fue con el interruptor (quedó prendido para siempre).
describe('supportLink', () => {
	it('"Dejá una propina" al Fondo', () => {
		expect(supportLink()).toEqual({
			href: 'https://fondo.kinkyvibe.ar',
			label: 'Dejá una propina',
			kind: 'fondo'
		});
	});
});

describe('contactLink', () => {
	it('«Contacto»: un mail a la casilla pública de la organización', () => {
		expect(contactLink()).toEqual({
			href: `mailto:${DEFAULT_CONTACT_EMAIL}`,
			label: 'Contacto',
			email: DEFAULT_CONTACT_EMAIL
		});
		expect(DEFAULT_CONTACT_EMAIL).toBe('kinkyvibe.talleres@gmail.com');
	});
});
