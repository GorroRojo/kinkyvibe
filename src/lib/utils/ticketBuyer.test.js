import { describe, expect, it } from 'vitest';
import { validateHolders } from './ticketBuyer.js';

// Datos inventados.
const buyer = { name: 'Persona Prueba', pronouns: 'elle' };

describe('validateHolders', () => {
	it('la entrada 1 vacía toma el nombre y los pronombres de quien compra', () => {
		expect(validateHolders(buyer, [{ name: '', pronouns: '' }], 1)).toEqual({
			holders: [{ name: 'Persona Prueba', pronouns: 'elle' }],
			errors: {}
		});
	});

	it('las demás entradas no: cada una con su error y su número', () => {
		const r = validateHolders(buyer, [{ name: 'Otra Persona', pronouns: 'ella' }, undefined], 2);
		expect(r.holders).toEqual([{ name: 'Otra Persona', pronouns: 'ella' }]);
		expect(r.errors).toEqual({
			holder_name_1: 'Poné un nombre (entre 2 y 80 letras).',
			holder_pronouns_1: 'Poné los pronombres de esta persona.'
		});
	});

	it('solo valida las que se compran', () => {
		expect(validateHolders(buyer, [{}, {}, {}], 1).errors).toEqual({});
	});
});
