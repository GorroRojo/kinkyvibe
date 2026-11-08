/**
 * La descripción corta de un PR para el aviso «Cada deploy» (./resumen.js). Cuerpos INVENTADOS.
 */
import { describe, expect, it } from 'vitest';
import { SUMMARY_MAX, plainText, prSummary, shorten } from './resumen.js';

describe('plainText', () => {
	it('saca links, imágenes, código, negritas, itálicas, comentarios y etiquetas', () => {
		expect(
			plainText(
				'**Fix:** `height: auto` en [la tapa](https://x.test/a) ![img](a.png) <!-- nota --> *ya* <br> anda __bien__'
			)
		).toBe('Fix: height: auto en la tapa ya anda bien');
	});

	it('no toca guiones bajos de snake_case ni asteriscos sueltos', () => {
		expect(plainText('event_venues y 2 * 3')).toBe('event_venues y 2 * 3');
	});
});

describe('shorten', () => {
	it('si entra, entero', () => {
		expect(shorten('Corto.')).toBe('Corto.');
	});

	it('si no entra, la primera oración', () => {
		const first = 'Production bug that gorrite saw on an event page with a library cover.';
		expect(shorten(`${first} ${'More words here. '.repeat(20)}`)).toBe(first);
	});

	it('si la primera oración tampoco entra, corta en una palabra con «…»', () => {
		const out = shorten('palabra '.repeat(60).trim());
		expect(out.length).toBeLessThanOrEqual(SUMMARY_MAX);
		expect(out.endsWith('palabra…')).toBe(true);
	});
});

describe('prSummary', () => {
	it('el primer párrafo, sin la línea del plan ni markdown', () => {
		const body = [
			'Plan: avisos-deploy',
			'',
			'Production bug: an event page returned **500**. See [#628](https://github.com/x/y/pull/628).',
			'',
			'## Cause',
			'Something else.'
		].join('\n');
		expect(prSummary({ body })).toBe('Production bug: an event page returned 500. See #628.');
	});

	it('saltea títulos y, si el primer párrafo es una lista, toma el primer ítem', () => {
		const body = '## Summary\n\n- Adds the deploy notice.\n- Adds tests.\n\nMore.';
		expect(prSummary({ body })).toBe('Adds the deploy notice.');
	});

	it('una línea «Aviso:» gana sobre todo lo demás', () => {
		const body = [
			'Long English paragraph about the change.',
			'',
			'Resumen: no es esta.',
			'',
			'Aviso: ahora el bot avisa cada deploy.'
		].join('\n');
		expect(prSummary({ body })).toBe('ahora el bot avisa cada deploy.');
	});

	it('«**Aviso:**» en negrita también vale', () => {
		expect(prSummary({ body: 'Texto.\n\n**Aviso:** algo para gorrite.' })).toBe(
			'algo para gorrite.'
		);
	});

	it('una línea «Resumen:» o «Qué cambia:» gana sobre el primer párrafo', () => {
		expect(prSummary({ body: 'English intro.\n\nResumen: cambia el afiche.' })).toBe(
			'cambia el afiche.'
		);
		expect(prSummary({ body: 'English intro.\n\n**Qué cambia:** el menú.' })).toBe('el menú.');
	});

	it('un título «## Qué cambia»: el párrafo de abajo', () => {
		const body = 'Intro.\n\n## Qué cambia\n\n**A.** El panel muestra los precios.\n\n## Tests';
		expect(prSummary({ body })).toBe('A. El panel muestra los precios.');
	});

	it('ignora bloques de código, tablas y comentarios HTML', () => {
		const body = '<!-- plantilla -->\n```\ncode\n```\n\n| a | b |\n|---|---|\n\nEl texto real.';
		expect(prSummary({ body })).toBe('El texto real.');
	});

	it('un comentario armado de dos o sin cerrar tampoco queda', () => {
		expect(prSummary({ body: '<!<!-- a -->-- b -->\n\nEl texto real.' })).toBe('El texto real.');
		expect(prSummary({ body: 'El texto real.\n\n<!-- sin cerrar\n\nOtra cosa.' })).toBe(
			'El texto real.'
		);
	});

	it('sin cuerpo: el del mensaje del commit, sin el título ni los trailers', () => {
		const commitMessage = [
			'Título del commit (#12)',
			'',
			'Explica el cambio.',
			'',
			'Co-Authored-By: Alguien <noreply@example.com>'
		].join('\n');
		expect(prSummary({ body: '', commitMessage })).toBe('Explica el cambio.');
		expect(prSummary({ body: null, commitMessage: 'Solo título' })).toBe('');
	});

	it('el cuerpo con solo la línea del plan y la firma cae al commit', () => {
		const body =
			'Plan: ninguno\n\n🤖 Generated with [Claude Code](https://claude.com/claude-code)\n\nhttps://claude.ai/code/session_x';
		expect(prSummary({ body, commitMessage: 'T\n\nDel commit.' })).toBe('Del commit.');
	});

	it('largo: recortado a 200 como mucho', () => {
		const out = prSummary({ body: `${'a'.repeat(300)} final` });
		expect(out.length).toBeLessThanOrEqual(SUMMARY_MAX);
		expect(out.endsWith('…')).toBe(true);
	});
});
