import { describe, expect, it } from 'vitest';
import { supportLink } from './footer.js';

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
