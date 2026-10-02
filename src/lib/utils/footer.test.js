import { describe, expect, it } from 'vitest';
import { supportLink } from './footer.js';

describe('supportLink', () => {
	it('con propinas prendido: "Dejá una propina" al Fondo', () => {
		expect(supportLink({ propinas: true })).toEqual({
			href: 'https://fondo.kinkyvibe.ar',
			label: 'Dejá una propina',
			kind: 'fondo'
		});
	});

	it('con propinas apagado (o sin datos): Cafecito, como siempre', () => {
		const cafecito = {
			href: 'https://cafecito.app/kinkyvibe',
			label: 'CafecitoApp',
			kind: 'cafecito'
		};
		expect(supportLink({ propinas: false })).toEqual(cafecito);
		expect(supportLink({})).toEqual(cafecito);
		expect(supportLink(undefined)).toEqual(cafecito);
	});
});
