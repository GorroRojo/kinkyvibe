import { describe, expect, it } from 'vitest';
import { articleAuthors, updatedDay } from './autoria.js';

describe('updatedDay: «actualizado el» solo si es de un día posterior', () => {
	it('posterior a la publicación: el día, en hora de Argentina', () => {
		expect(updatedDay('2021-05-20Z-03:00', '2024-04-20Z-03:00')).toBe('2024-04-20');
		expect(updatedDay('2024-12-06', '2024-12-07T01:00:00-03:00')).toBe('2024-12-07');
	});

	it('el mismo día, uno anterior o sin fecha: nada', () => {
		expect(updatedDay('2024-12-06Z-03:00', '2024-12-06T18:00:00-03:00')).toBeNull();
		// En material importado hay actualizaciones anteriores a la publicación.
		expect(updatedDay('2024-12-06Z-03:00', '2024-11-04Z-03:00')).toBeNull();
		expect(updatedDay('2024-12-06Z-03:00', undefined)).toBeNull();
		expect(updatedDay('2024-12-06Z-03:00', '')).toBeNull();
		expect(updatedDay('2024-12-06Z-03:00', 'no es una fecha')).toBeNull();
	});

	it('sin fecha de publicación, la de actualización', () => {
		expect(updatedDay(undefined, '2024-04-20Z-03:00')).toBe('2024-04-20');
	});
});

describe('articleAuthors: el perfil si la página lo enlaza, si no el nombre', () => {
	const profiles = [{ path: '/amigues/Alguien_Inventade', meta: { postID: 'Alguien Inventade' } }];

	it('con perfil, la dirección entera; sin perfil, el nombre', () => {
		expect(
			articleAuthors(['Alguien Inventade', 'Otre Inventade'], profiles, 'https://kinkyvibe.ar/')
		).toEqual(['https://kinkyvibe.ar/amigues/Alguien_Inventade', 'Otre Inventade']);
	});

	it('sin autores o con datos raros, nada inventado', () => {
		expect(articleAuthors(undefined, profiles, 'https://kinkyvibe.ar')).toEqual([]);
		expect(articleAuthors(['', 3, 'Une'], null, 'https://kinkyvibe.ar')).toEqual(['Une']);
		// Un perfil sin dirección del sitio no se usa.
		const raro = [{ path: 'https://otro.sitio/x', meta: { postID: 'Une' } }];
		expect(articleAuthors(['Une'], raro, 'https://kinkyvibe.ar')).toEqual(['Une']);
	});
});
