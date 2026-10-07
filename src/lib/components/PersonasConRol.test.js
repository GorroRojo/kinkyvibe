/**
 * PersonasConRol: los nombres de un mismo rol van separados por «coma y espacio».
 */
import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import PersonasConRol from './PersonasConRol.svelte';

/** Texto visible (sin etiquetas). @param {string} html */
const text = (html) =>
	html
		.split('<')
		.map((part, i) => (i === 0 ? part : part.slice(part.indexOf('>') + 1 || part.length)))
		.join('');

describe('PersonasConRol', () => {
	it('separa los nombres con coma y espacio, con o sin perfil', () => {
		const groups = [
			{
				rol: 'Organiza',
				items: [
					{ slug: 'colectivo-x', title: 'Colectivo X', href: '/amigues/colectivo-x' },
					{ slug: '', title: 'Persona Inventada', href: '' },
					{ slug: 'persona-y', title: 'Persona Y', href: '/amigues/persona-y' }
				]
			}
		];
		const t = text(render(PersonasConRol, { props: { groups } }).body);
		expect(t).toContain('Colectivo X, Persona Inventada, Persona Y');
	});

	it('sin grupos no muestra nada', () => {
		expect(text(render(PersonasConRol, { props: { groups: [] } }).body).trim()).toBe('');
	});
});
