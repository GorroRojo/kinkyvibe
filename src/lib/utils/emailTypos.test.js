import { describe, expect, it } from 'vitest';
import { suggestEmail } from './emailTypos.js';

describe('suggestEmail', () => {
	it.each([
		['persona@gmai.com', 'persona@gmail.com'],
		['persona@hotmial.com', 'persona@hotmail.com'],
		['persona@gmail.con', 'persona@gmail.com'],
		['persona@gmial.com', 'persona@gmail.com'],
		['persona@outlok.com', 'persona@outlook.com'],
		['persona@yahooo.com', 'persona@yahoo.com'],
		['persona@hotmial.com.ar', 'persona@hotmail.com.ar'],
		['persona@empresa.con', 'persona@empresa.com'],
		['persona@gmal.con', 'persona@gmail.com'],
		// Una letra de distancia de un dominio grande, aunque no esté en el mapa.
		['persona@gmaik.com', 'persona@gmail.com'],
		['persona@hotmaiil.com', 'persona@hotmail.com'],
		// La parte de antes de la arroba queda como está; el dominio, en minúsculas.
		['  Persona.Demo@GMAI.COM ', 'Persona.Demo@gmail.com']
	])('%s → %s', (email, suggestion) => {
		expect(suggestEmail(email)).toBe(suggestion);
	});

	it.each([
		'persona@gmail.com',
		'persona@hotmail.es',
		'persona@outlook.es',
		'persona@live.com.ar',
		'persona@yahoo.com.ar',
		'persona@hotmail.com.ar',
		'persona@outlook.com.ar',
		'persona@live.cl',
		'persona@ymail.com',
		'persona@mail.com',
		'persona@gmx.com',
		'persona@me.com',
		'persona@mac.com',
		'persona@fibertel.com.ar',
		'persona@example.com',
		'persona@kinkyvibe.ar'
	])('no sugiere nada para %s', (email) => {
		expect(suggestEmail(email)).toBeNull();
	});

	it('no sugiere nada si no parece un mail', () => {
		for (const raw of ['', 'gmai.com', '@gmai.com', 'persona@', 'persona@gmai', null, 3]) {
			expect(suggestEmail(raw)).toBeNull();
		}
	});
});
