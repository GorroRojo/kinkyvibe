/**
 * El resumen «Falta completar» / «Antes de guardar» (FormProblems), el mismo en los tres
 * formularios largos: cada problema es un link a su campo (el foco va ahí, `focusField`, probado
 * en formProblems.test.js), uno sin campo va como texto y la caja se anuncia (`role="alert"`).
 */
import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import FormProblems from './FormProblems.svelte';
import { textOf, withoutComments } from '$lib/testing/html.js';

/** @param {Record<string, any>} props */
const html = (props) =>
	withoutComments(render(FormProblems, { props: /** @type {any} */ (props) }).body);

/** @param {string} s */
const squash = (s) => textOf(s).replace(/\s+/g, ' ').trim();

/** Los links del resumen: [href, texto]. @param {string} body */
const links = (body) =>
	[...body.matchAll(/<a\b[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g)].map((m) => [
		m[1],
		squash(m[2])
	]);

/** Los renglones de la lista, como texto. @param {string} body */
const items = (body) => [...body.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/g)].map((m) => squash(m[1]));

describe('FormProblems', () => {
	const problems = [
		{ text: 'Falta «Título».', field: 'title-input' },
		{ text: 'Falta la hora de inicio.', field: 'edit-start-time' },
		{ text: 'No se pudo armar el archivo.', field: '' }
	];

	it('el título y cada problema, en orden, en una caja que se anuncia', () => {
		const body = html({ problems, title: 'Antes de guardar:', id: 'save-problems' });
		expect(body).toMatch(/^<div class="problems[^"]*" role="alert" id="save-problems">/);
		expect(body).toMatch(/<strong>Antes de guardar:<\/strong>/);
		expect(items(body)).toEqual([
			'Falta «Título».',
			'Falta la hora de inicio.',
			'No se pudo armar el archivo.'
		]);
	});

	it('cada problema con campo es un link a ese campo (el destino del foco)', () => {
		expect(links(html({ problems }))).toEqual([
			['#title-input', 'Falta «Título».'],
			['#edit-start-time', 'Falta la hora de inicio.']
		]);
	});

	it('un problema sin campo va como texto, sin link', () => {
		const body = html({ problems: [{ text: 'No se pudo armar el archivo.', field: '' }] });
		expect(links(body)).toEqual([]);
		expect(items(body)).toEqual(['No se pudo armar el archivo.']);
	});

	it('por defecto dice «Falta completar:» (el de crear un evento), sin id', () => {
		const body = html({ problems: problems.slice(0, 1) });
		expect(body).toMatch(/<strong>Falta completar:<\/strong>/);
		expect(body).not.toContain(' id=');
	});
});
