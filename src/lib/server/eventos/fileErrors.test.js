import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { MAP_LINK_ERROR } from '$lib/utils/eventPlace.js';
import { linkFileErrors, placeFileErrors } from './fileErrors.js';

describe('guardado', () => {
	/** @param {string} fm */
	const file = (fm) => `---\ntitle: Evento de prueba\n${fm}\n---\nTexto.\n`;
	it('solo se queja de un link al mapa que no sirve', () => {
		expect(placeFileErrors(file('location: Plaza de Prueba'))).toEqual([]);
		expect(placeFileErrors(file('location_map: https://osm.org/go/abc'))).toEqual([]);
		expect(placeFileErrors(file('location_map: http://ejemplo.com'))).toEqual([MAP_LINK_ERROR]);
		// Un archivo que no se puede leer lo valida el resto del guardado.
		expect(placeFileErrors('sin propiedades')).toEqual([]);
		expect(placeFileErrors(file('location_map: [roto'))).toEqual([]);
	});
});

describe('linkFileErrors (guardado de un archivo de evento)', () => {
	/** @param {string} line */
	const md = (line) =>
		['---', 'title: Evento inventado', 'category: calendario', line, '---', 'Texto.', ''].join(
			'\n'
		);

	it('mailto: y https pasan; sin link, también', () => {
		expect(linkFileErrors(md('link: mailto:hola@ejemplo.test'))).toEqual([]);
		expect(linkFileErrors(md('link: https://forms.gle/x'))).toEqual([]);
		expect(linkFileErrors(md('link_text: Inscribirme'))).toEqual([]);
		expect(linkFileErrors(md("link: ''"))).toEqual([]);
	});

	it('javascript: u otro esquema frena el guardado con un mensaje claro', () => {
		expect(linkFileErrors(md("link: 'javascript:alert(1)'"))).toEqual([
			'Link de inscripción: tiene que ser un link web (https://), un mail (mailto:) o una página del sitio.'
		]);
		expect(linkFileErrors(md("link: 'mailto:'"))[0]).toMatch(/mail sin dirección/);
	});

	it('un frontmatter que no se puede leer lo valida el resto del guardado', () => {
		expect(linkFileErrors('---\ntitle: [roto\n---\n')).toEqual([]);
	});
});

describe('la página pública no baja yaml', () => {
	it('eventPlace.js y eventLink.js no importan yaml (ni eventDraft.js, que lo trae)', () => {
		for (const file of ['eventPlace.js', 'eventLink.js']) {
			const src = fs.readFileSync(new URL(`../../utils/${file}`, import.meta.url), 'utf8');
			expect(src, file).not.toMatch(/from\s+['"]yaml['"]/);
			expect(src, file).not.toMatch(/import\(\s*['"]yaml['"]\s*\)/);
			expect(src, file).not.toMatch(/eventDraft(\.js)?['"]/);
		}
	});
});
