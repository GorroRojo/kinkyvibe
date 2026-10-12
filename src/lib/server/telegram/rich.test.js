/**
 * Mensajes enriquecidos (rich.js): qué va en cada uno (título, resumen, el texto en párrafos, la
 * línea de «sigue en el sitio» si el índice lo recortó y el pie), el escape de todo lo que viene del
 * sitio, y qué no va (amigues, algo sin nada más que el título). Datos inventados.
 */
import { describe, expect, it } from 'vitest';
import { PARAGRAPH_TARGET, paragraphs, richDocMessage } from './rich.js';
import { runWithBotTexts } from './texts.js';

const NOW = Date.parse('2031-01-10T12:00:00-03:00');

/** @typedef {import('$lib/utils/search').SearchDoc} SearchDoc */

/** @param {Partial<SearchDoc>} o @returns {SearchDoc} */
const wiki = (o = {}) => ({
	c: 'wiki',
	h: '/wiki/cuerdas-inventadas',
	t: 'Cuerdas inventadas',
	s: 'Una definición inventada.',
	b: 'Un texto inventado. Con dos oraciones.',
	...o
});

describe('paragraphs', () => {
	it('junta oraciones hasta el largo buscado y corta siempre al final de una oración', () => {
		const sentence = 'Esta es una oración inventada de prueba con varias palabras.';
		const text = Array.from({ length: 30 }, () => sentence).join(' ');
		const out = paragraphs(text);
		expect(out.length).toBeGreaterThan(1);
		for (const p of out) {
			expect(p.length).toBeLessThanOrEqual(PARAGRAPH_TARGET);
			expect(p.endsWith('.')).toBe(true);
		}
		expect(out.join(' ')).toBe(text);
	});

	it('una oración sola muy larga queda entera; vacío, nada', () => {
		const long = 'palabra '.repeat(100).trim();
		expect(paragraphs(long)).toEqual([long]);
		expect(paragraphs('')).toEqual([]);
		expect(paragraphs('   ')).toEqual([]);
	});
});

describe('richDocMessage', () => {
	it('una entrada de la Kinkipedia: título, resumen, el texto y el pie', () => {
		const m = richDocMessage(wiki(), { title: '📖 Cuerdas inventadas', now: NOW });
		expect(m).toEqual({
			html:
				'<h3>📖 Cuerdas inventadas</h3>' +
				'<p><i>Una definición inventada.</i></p>' +
				'<p>Un texto inventado. Con dos oraciones.</p>' +
				'<footer>Kinkipedia · Kinky Vibe</footer>'
		});
	});

	it('si el índice recortó el texto («…»), suma que el resto está en el sitio', () => {
		const m = richDocMessage(wiki({ c: 'material', b: 'Empieza y sigue…' }), {
			title: 'Guía inventada',
			now: NOW
		});
		expect(m?.html).toContain('<p>Empieza y sigue…</p>');
		expect(m?.html).toContain(
			'<p><i>Esto es el comienzo. El resto está en el sitio: tocá «Ver en el sitio».</i></p>'
		);
		expect(m?.html).toContain('<footer>Material · Kinky Vibe</footer>');
	});

	it('no repite el resumen si el texto empieza igual', () => {
		const m = richDocMessage(
			wiki({ s: 'Una definición inventada.', b: 'Una definición inventada. Y algo más.' }),
			{ title: 'X', now: NOW }
		);
		expect(m?.html.match(/Una definición inventada/g)).toHaveLength(1);
		expect(m?.html).toContain('<p>Y algo más.</p>');
	});

	it('todo lo que viene del sitio va escapado (también la foto)', () => {
		const m = richDocMessage(wiki({ s: '<b>resumen</b>', b: 'a & b "c" <script>x</script>' }), {
			title: '<i>Título</i>',
			now: NOW,
			photo: 'https://kinkyvibe.ar/x.jpg?a="b"'
		});
		const html = m?.html ?? '';
		expect(html).not.toContain('<script>');
		expect(html).not.toContain('<b>resumen');
		expect(html).toContain('<h3>&lt;i&gt;Título&lt;/i&gt;</h3>');
		expect(html).toContain('a &amp; b &quot;c&quot; &lt;script&gt;');
		expect(html.startsWith('<figure><img src="https://kinkyvibe.ar/x.jpg?a=&quot;b&quot;"/>')).toBe(
			true
		);
	});

	it('un evento: la fecha (tg-time), el lugar como la página, la venta si no se puede comprar', () => {
		const m = richDocMessage(
			{
				c: 'calendario',
				h: '/calendario/fiesta-inventada',
				t: 'Fiesta inventada',
				d: '2031-01-20T23:00:00.000Z',
				s: 'Resumen inventado.'
			},
			{
				title: 'Fiesta inventada',
				now: NOW,
				event: { place: 'Barrio Inventado', ticket: { kind: 'note', text: 'Agotadas' } }
			}
		);
		const html = m?.html ?? '';
		expect(html).toMatch(/^<h3>Fiesta inventada<\/h3><p>📅 <tg-time unix="\d+" format="wdt">/);
		expect(html).toContain('<p>📍 Barrio Inventado</p>');
		expect(html).toContain('<p>🎟 Agotadas</p>');
		expect(html).toContain('<p><i>Resumen inventado.</i></p>');
		expect(html).toContain('<footer>Evento · Kinky Vibe</footer>');
	});

	it('amigues no va; algo sin resumen ni texto, tampoco (alcanza la tarjeta de siempre)', () => {
		expect(
			richDocMessage({ c: 'amigues', h: '/amigues/x', t: 'X', s: 'Bio' }, { title: 'X', now: NOW })
		).toBeNull();
		expect(
			richDocMessage({ c: 'material', h: '/material/x', t: 'X' }, { title: 'X', now: NOW })
		).toBeNull();
	});

	it('usa los textos cambiados en el panel', () => {
		const m = runWithBotTexts(
			{ 'compartir.pie': '{tipo} en el sitio de la comunidad', 'sitio.tipo_wiki': 'Wiki' },
			() => richDocMessage(wiki(), { title: 'X', now: NOW })
		);
		expect(m?.html).toContain('<footer>Wiki en el sitio de la comunidad</footer>');
	});
});
