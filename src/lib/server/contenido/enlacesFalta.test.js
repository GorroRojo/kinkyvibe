/**
 * «Enlaces que faltan»: el botón de cada nombre lleva al formulario de siempre con el nombre ya
 * cargado (perfil para `@`, etiqueta para `[[…]]` y `#`).
 */
import { describe, expect, it } from 'vitest';
import { createFor } from './enlacesFalta.js';

describe('createFor', () => {
	it('una mención abre Perfil nuevo con el nombre', () => {
		expect(createFor('mencion', 'alguien.inventade')).toEqual({
			href: '/admin/comunidad/perfiles/nuevo?nombre=alguien.inventade',
			label: 'Crear perfil'
		});
	});

	it('un [[…]], un ![[…]] o un # abren «Nueva etiqueta» con el nombre (escapado)', () => {
		const tag = {
			href: '/admin/etiquetas?nueva=Nudo%20inventado%20%26%20m%C3%A1s',
			label: 'Crear etiqueta'
		};
		expect(createFor('enlace', 'Nudo inventado & más')).toEqual(tag);
		expect(createFor('incrustado', 'Nudo inventado & más')).toEqual(tag);
		expect(createFor('etiqueta', ' Nudo inventado & más ')).toEqual(tag);
	});

	it('corta los nombres muy largos', () => {
		const { href } = createFor('enlace', 'x'.repeat(500));
		expect(href).toBe(`/admin/etiquetas?nueva=${'x'.repeat(200)}`);
	});
});
