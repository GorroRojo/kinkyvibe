import { describe, expect, it } from 'vitest';
import { supportLink } from './footer.js';

describe('supportLink', () => {
	it('con propinas prendido: "Dejá una propina" en el sitio', () => {
		expect(supportLink({ propinas: true })).toEqual({
			href: '/propinas',
			label: 'Dejá una propina',
			external: false
		});
	});

	it('con propinas apagado (o sin datos): Cafecito, como siempre', () => {
		const cafecito = {
			href: 'https://cafecito.app/kinkyvibe',
			label: 'CafecitoApp',
			external: true
		};
		expect(supportLink({ propinas: false })).toEqual(cafecito);
		expect(supportLink({})).toEqual(cafecito);
		expect(supportLink(undefined)).toEqual(cafecito);
	});
});
