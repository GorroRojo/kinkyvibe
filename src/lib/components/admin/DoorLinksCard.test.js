/**
 * «Links de puerta» en la ficha del evento: la lista de links vivos (etiqueta, quién, cuándo,
 * vencimiento y «Revocar») y el link recién creado, que se ve solo en esa respuesta. Inventado.
 */
import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import DoorLinksCard from './DoorLinksCard.svelte';

const link = {
	id: 'AAAAAAAAAAAAAAAA',
	label: 'voluntarie 1',
	createdBy: 'admin-de-prueba',
	createdAt: Date.parse('2099-12-01T18:00-03:00'),
	expiresAt: Date.parse('2099-12-02T05:59-03:00'),
	lastUsedAt: null
};

/** @param {Record<string, unknown>} props */
const html = (props) => render(DoorLinksCard, { props: /** @type {any} */ (props) }).body;

describe('DoorLinksCard', () => {
	it('lista los links vivos con quién lo creó, cuándo vence y «Revocar»', () => {
		const out = html({ doorLinks: { links: [link], defaultExpires: '2099-12-02T05:59' } });
		expect(out).toContain('voluntarie 1');
		expect(out).toContain('Lo creó admin-de-prueba');
		expect(out).toContain('vence el');
		expect(out).toContain('action="?/revocarLinkPuerta"');
		expect(out).toContain('value="AAAAAAAAAAAAAAAA"');
		expect(out).toContain('action="?/crearLinkPuerta"');
		expect(out).toContain('value="2099-12-02T05:59"');
	});

	it('el link recién creado se ve para copiarlo; sin resultado, no hay ningún link con token', () => {
		const url = 'https://kinkyvibe.ar/puerta#token-de-prueba';
		const created = html({
			doorLinks: { links: [link], defaultExpires: '' },
			result: {
				ok: true,
				message: 'Link creado.',
				url,
				label: 'voluntarie 1',
				expiresAt: link.expiresAt
			}
		});
		expect(created).toContain(url);
		expect(html({ doorLinks: { links: [link], defaultExpires: '' } })).not.toContain('/puerta#');
	});

	it('sin base: lo avisa en vez de la lista', () => {
		expect(html({ doorLinks: { links: null, defaultExpires: '' } })).toContain(
			'No se pudo leer la base de datos.'
		);
	});
});
