/**
 * Texto raro pegado de un celular o de otro programa no rompe la página (PR #628: un U+2028 en el
 * texto de un evento daba 500). Cada texto de abajo pasa por el armado del texto libre y por el de
 * un evento, un material y una entrada de la wiki como los muestra su página (metadata, post y
 * cuerpo, con HTML libre y con la lista corta); nada tira. Textos inventados.
 */
import { describe, expect, it } from 'vitest';
import { legacyEmphasis, likeMdsvex, renderFreeBody, smartypants } from './freeHtml.js';
import { renderContentBody } from './render.js';
import { eventToMeta, normalizeBody } from './eventos.js';
import { materialToMeta } from './material.js';
import { processPost } from '$lib/utils';

/** Los textos raros: separadores de línea, caracteres invisibles, HTML a medias, links rotos. */
const NASTY = {
	'U+2028': 'Primera línea segunda línea',
	'U+2029': 'Un párrafo otro párrafo',
	'\\r solo': 'una\rdos\r\rtres',
	'\\r\\n mezclado con \\n y \\r': 'una\r\ndos\ntres\r\n\r\ncuatro\n\r\ncinco\r\rseis',
	'U+0085': 'línea\u0085otra',
	NUL: 'antes\u0000después',
	BOM: '﻿# Título con BOM\n\ntexto',
	'zero-width': 'a‍b‌c​d⁠e',
	'línea muy larga': 'palabra '.repeat(20000),
	'< sin cerrar': 'hola <b sin cerrar\n\n<div\n\n< > <<<',
	'link con % roto':
		'[link](https://ejemplo.org/%E0%A4%A) y [otro](/calendario/%E0%A4%A) y <https://ejemplo.org/%>',
	emoji: 'fiesta 🎉👩🏽‍🤝‍👩🏻',
	'espacios raros': 'a b　c d e',
	'marcas RTL': '‮otxet‬ ‏ ‎',
	'cita y lista con U+2028': '> cita sigue\n- ítem más\n1. \n\n```\ncódigo \n```',
	'títulos raros': '##  \n\n### \u0000\n\n#### ﻿',
	'wiki y menciones raras': '[[ ]] @  #[[a b]] [[a|b#\u0085]]',
	vacío: '',
	'solo espacios': ' \t\n  \r\n '
};

const CASES = Object.entries(NASTY);

describe('el texto libre no tira con texto raro', () => {
	it.each(CASES)('%s', async (_name, text) => {
		expect(() => likeMdsvex(text)).not.toThrow();
		expect(() => smartypants(text)).not.toThrow();
		expect(() => legacyEmphasis(text)).not.toThrow();
		const { html } = await renderFreeBody(text, { vars: { title: text } });
		expect(typeof html).toBe('string');
	});
});

describe('un evento, un material y una entrada de la wiki con texto raro en todo se arman', () => {
	it.each(CASES)('%s', async (_name, text) => {
		const data = {
			summary: text,
			status: text,
			start: text,
			end: text,
			link: text,
			link_text: text,
			location: text,
			location_name: text,
			location_map: text,
			published_date: text,
			updated_date: text,
			tags: [text],
			authors: [text],
			body: normalizeBody(text)
		};
		for (const [toMeta, category] of /** @type {const} */ ([
			[eventToMeta, 'calendario'],
			[materialToMeta, 'material'],
			[materialToMeta, 'wiki']
		])) {
			const meta = toMeta({ title: text, data, visibility: 'public' });
			const post = await processPost(undefined, 'inventado', /** @type {any} */ (meta), true);
			for (const body_html of ['libre', 'corta']) {
				const out = await renderContentBody({ ...data, body_html }, category, 'inventado', {
					vars: post.meta
				});
				expect(typeof out.html).toBe('string');
			}
		}
	});
});
