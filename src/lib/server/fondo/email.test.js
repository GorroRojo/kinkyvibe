import { describe, expect, it } from 'vitest';
import { textOf } from '$lib/testing/html.js';
import { MAIL_LAYOUT_MARK } from '$lib/server/email/layout.js';
import {
	FONDO_MAIL_SUBJECT,
	FONDO_MAIL_WARNING,
	buildFondoLinkEmail,
	fondoButtonLabel
} from './email.js';

const URL_A = 'https://fondo.kinkyvibe.ar/gracias?preapproval_id=0a1b2c3d';
const URL_B = 'https://fondo.kinkyvibe.ar/gracias?preapproval_id=ABCDEF99';

/** Lo que va entre comillas en un atributo, con las entidades de vuelta. @param {string} s */
const unescapeAttr = (s) =>
	s
		.replaceAll('&quot;', '"')
		.replaceAll('&#39;', "'")
		.replaceAll('&lt;', '<')
		.replaceAll('&gt;', '>')
		.replaceAll('&amp;', '&');

/**
 * Los links (`<a href="…">texto</a>`) del HTML, sin expresiones regulares sobre etiquetas.
 * @param {string} html
 * @returns {{ href: string, label: string }[]}
 */
function anchors(html) {
	return html
		.split('<a href="')
		.slice(1)
		.map((part) => {
			const href = unescapeAttr(part.slice(0, part.indexOf('"')));
			const inner = part.slice(part.indexOf('>') + 1, part.indexOf('</a>'));
			return { href, label: textOf(inner) };
		});
}

/** Solo los botones (los links que no son `mailto:`). @param {string} html */
const buttons = (html) => anchors(html).filter((a) => new URL(a.href).protocol === 'https:');

describe('buildFondoLinkEmail', () => {
	it('un link: asunto fijo, un botón y el aviso', () => {
		const { subject, html, text } = buildFondoLinkEmail({
			links: [{ tier: 'Casual', url: URL_A }],
			origin: 'https://kinkyvibe.example'
		});
		expect(subject).toBe(FONDO_MAIL_SUBJECT);
		expect(subject).toBe('Tu link para elegir cómo aparecés en el Fondo Kinky Vibe');
		expect(html).toContain(MAIL_LAYOUT_MARK);
		const [button, ...rest] = buttons(html).filter(
			(b) => new URL(b.href).host !== 'kinkyvibe.example'
		);
		expect(rest).toHaveLength(0);
		const href = new URL(button.href);
		expect(href.origin).toBe('https://fondo.kinkyvibe.ar');
		expect(href.pathname).toBe('/gracias');
		expect(href.searchParams.get('preapproval_id')).toBe('0a1b2c3d');
		expect(button.label).toBe('Mecenas Casual: elegir cómo aparezco');
		expect(textOf(html)).toContain(FONDO_MAIL_WARNING);
		expect(text).toContain('Mecenas Casual: elegir cómo aparezco\n' + URL_A);
		expect(text).toContain(FONDO_MAIL_WARNING);
	});

	it('varios links: un botón por link, en orden', () => {
		const links = [
			{ tier: 'Visitante', url: URL_A },
			{ tier: 'Leyenda', url: URL_B }
		];
		const { html, text } = buildFondoLinkEmail({ links });
		const found = buttons(html);
		expect(found.map((b) => b.label)).toEqual(links.map((l) => fondoButtonLabel(l.tier)));
		expect(found.map((b) => new URL(b.href).searchParams.get('preapproval_id'))).toEqual([
			'0a1b2c3d',
			'ABCDEF99'
		]);
		expect(textOf(html)).toContain('Tus links de Mecenas');
		for (const l of links) expect(text).toContain(`${fondoButtonLabel(l.tier)}\n${l.url}`);
	});

	it('escapa lo que recibe (aunque la ruta ya lo valida)', () => {
		const { html } = buildFondoLinkEmail({
			links: [{ tier: '<b>Sugar</b>', url: 'https://fondo.example/?a=1&b="2"' }]
		});
		expect(html).not.toContain('<b>Sugar</b>');
		expect(html).toContain('Mecenas &lt;b&gt;Sugar&lt;/b&gt;: elegir cómo aparezco');
		expect(html).toContain('href="https://fondo.example/?a=1&amp;b=&quot;2&quot;"');
		const [button] = buttons(html);
		expect(new URL(button.href).searchParams.get('b')).toBe('"2"');
	});
});
