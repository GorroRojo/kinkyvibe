import { describe, expect, it } from 'vitest';
import { contactItems } from './perfiles.js';

describe('contactItems', () => {
	it('arma links web, mail y teléfono', () => {
		expect(
			contactItems({
				links: ['https://www.ejemplo.test/inventade/', 'https://otro.test'],
				email: ' contacto@ejemplo.test ',
				tel: '+54 9 11 0000-0000'
			})
		).toEqual([
			{
				kind: 'link',
				href: 'https://www.ejemplo.test/inventade/',
				label: 'ejemplo.test/inventade'
			},
			{ kind: 'link', href: 'https://otro.test', label: 'otro.test' },
			{ kind: 'email', href: 'mailto:contacto@ejemplo.test', label: 'contacto@ejemplo.test' },
			{ kind: 'tel', href: 'tel:+5491100000000', label: '+54 9 11 0000-0000' }
		]);
	});

	it('puede saltear el primer link (ya va como botón)', () => {
		expect(
			contactItems({ links: ['https://a.test', 'https://b.test'] }, { skipFirstLink: true })
		).toEqual([{ kind: 'link', href: 'https://b.test', label: 'b.test' }]);
	});

	it('no arma nada raro: otros esquemas, mails o teléfonos que no son', () => {
		expect(
			contactItems({
				links: ['javascript:alert(1)', 'mailto:x@y.test', 'ftp://x.test'],
				email: 'no es un mail',
				tel: 'llamame'
			})
		).toEqual([]);
		expect(contactItems({ email: 'a@b.test?subject=x"><script>' })).toEqual([]);
		expect(contactItems({})).toEqual([]);
	});
});
