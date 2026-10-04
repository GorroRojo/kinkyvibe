import { describe, expect, it } from 'vitest';
import {
	eventLinkProblem,
	isMailtoLink,
	isWebLink,
	linkFileErrors,
	safeEventLink
} from './eventLink.js';

describe('eventLinkProblem', () => {
	it('acepta web, mail (mailto:), teléfono y páginas del sitio', () => {
		for (const ok of [
			'https://forms.gle/inventado',
			'http://ejemplo.test/inscripcion',
			'mailto:hola@ejemplo.test',
			'mailto:hola@ejemplo.test?subject=Inscripci%C3%B3n',
			'mailto:una@ejemplo.test,otra@ejemplo.test',
			'MAILTO:Hola@Ejemplo.test',
			'tel:+5491100000000',
			'/calendario/fiesta-inventada',
			'#entradas'
		]) {
			expect(eventLinkProblem(ok), ok).toBeNull();
		}
	});

	it('rechaza javascript:, data: y cualquier otro esquema', () => {
		for (const bad of [
			'javascript:alert(1)',
			'JavaScript:alert(1)',
			'data:text/html,<b>x</b>',
			'vbscript:msgbox(1)',
			'file:///etc/passwd',
			'ftp://ejemplo.test/archivo'
		]) {
			expect(eventLinkProblem(bad), bad).toMatch(/link web .*mail .*página del sitio/);
		}
	});

	it('un mailto: sin dirección, un texto suelto o algo enorme no valen', () => {
		expect(eventLinkProblem('mailto:')).toMatch(/mail sin dirección/);
		expect(eventLinkProblem('mailto:?subject=hola')).toMatch(/mail sin dirección/);
		expect(eventLinkProblem('mailto:hola')).toMatch(/mail sin dirección/);
		expect(eventLinkProblem('hola@ejemplo.test')).toMatch(/no es un link válido/);
		expect(eventLinkProblem('//otra.web/x')).toMatch(/no es un link válido/);
		expect(eventLinkProblem('https://ejemplo.test/' + 'a'.repeat(2000))).toBe('es demasiado largo');
	});
});

describe('safeEventLink / isMailtoLink / isWebLink', () => {
	it('devuelve el link solo si vale (sin espacios alrededor)', () => {
		expect(safeEventLink(' mailto:hola@ejemplo.test ')).toBe('mailto:hola@ejemplo.test');
		expect(safeEventLink('https://forms.gle/x')).toBe('https://forms.gle/x');
		expect(safeEventLink('javascript:alert(1)')).toBe('');
		expect(safeEventLink('')).toBe('');
		expect(safeEventLink(undefined)).toBe('');
		expect(safeEventLink(42)).toBe('');
	});

	it('distingue mail de web', () => {
		expect(isMailtoLink('mailto:hola@ejemplo.test')).toBe(true);
		expect(isMailtoLink('https://forms.gle/x')).toBe(false);
		expect(isWebLink('https://forms.gle/x')).toBe(true);
		expect(isWebLink('http://ejemplo.test')).toBe(true);
		expect(isWebLink('mailto:hola@ejemplo.test')).toBe(false);
		expect(isWebLink('/calendario/x')).toBe(false);
		expect(isWebLink(null)).toBe(false);
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
