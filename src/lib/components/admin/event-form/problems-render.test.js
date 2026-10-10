/**
 * «Antes de guardar» en los editores (auditoría, punto 7): editar un evento (PostEditor) y
 * material / amigues (ContentEditor) usan el mismo resumen que crear un evento (FormProblems):
 * cada problema es un link a su campo, no un texto suelto. Y el «guardado» es el aviso verde
 * compartido (Notice), sin «✅». Datos inventados.
 */
import { describe, expect, it, vi } from 'vitest';
import { render } from 'svelte/server';
import { readable } from 'svelte/store';
import { textOf, withoutComments } from '$lib/testing/html.js';

vi.mock('$app/stores', () => ({
	page: readable({ url: new URL('http://localhost/admin/contenido/material/guia-de-prueba') })
}));

const { default: PostEditor } = await import('$lib/components/admin/PostEditor.svelte');
const { default: ContentEditor } =
	await import('$lib/components/admin/content/ContentEditor.svelte');

const common = { tagUsage: {}, profiles: [], authorUsage: {}, maxImageBytes: 5 * 1024 * 1024 };

/** @param {string} s */
const squash = (s) => textOf(s).replace(/\s+/g, ' ').trim();

/** El resumen de problemas (el <div class="problems"> con ese id). @param {string} body */
function summary(body, id = 'save-problems') {
	const start = body.indexOf(`id="${id}"`);
	if (start < 0) return null;
	const from = body.lastIndexOf('<div', start);
	const end = body.indexOf('</div>', start);
	return body.slice(from, end + '</div>'.length);
}

/** Los links de un pedazo de HTML: [href, texto]. @param {string} html */
const links = (html) =>
	[...html.matchAll(/<a\b[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g)].map((m) => [
		m[1],
		squash(m[2])
	]);

/** @param {string} body @param {string} id */
const hasId = (body, id) => body.includes(`id="${id}"`);

/* ---------- editar un evento ---------- */

const EVENT_WITHOUT_TITLE = `---
title: ''
summary: Una fiesta inventada para las pruebas
published_date: 2031-09-01Z-03:00
category: calendario
layout: calendario
status: abierto
start: 2031-12-19T22:00-03:00
tags:
  - español
  - AMBA
authors:
  - Persona Inventada
---

Texto de prueba.
`;

/** @param {string} raw @param {any} [form] */
const editEvent = (raw, form = null) =>
	withoutComments(
		render(PostEditor, {
			props: {
				data: {
					...common,
					post: { raw, sha: 'sha-de-prueba', path: 'src/lib/posts/calendario/fiesta.md' },
					image: null,
					sales: null
				},
				form,
				category: 'calendario',
				postID: 'fiesta-de-prueba',
				embedded: true
			}
		}).body
	);

describe('PostEditor: «Antes de guardar» con links a los campos', () => {
	const body = editEvent(EVENT_WITHOUT_TITLE);
	const box = summary(body) ?? '';

	it('el mismo resumen que al crear, con el título de siempre', () => {
		expect(box).toMatch(/^<div class="problems[^"]*" role="alert" id="save-problems">/);
		expect(box).toContain('<strong>Antes de guardar:</strong>');
	});

	it('cada problema lleva a su campo, y el campo existe en la página', () => {
		const found = links(box);
		expect(found).toContainEqual(['#title-input', 'Falta «Título».']);
		for (const [href] of found) expect(hasId(body, href.slice(1)), href).toBe(true);
	});

	it('el botón de la barra sigue llevando a «Antes de guardar»', () => {
		expect(squash(body)).toContain('Revisá «Antes de guardar»');
	});
});

describe('PostEditor: el «guardado» es el aviso verde compartido', () => {
	const EVENT = EVENT_WITHOUT_TITLE.replace("title: ''", 'title: Fiesta de prueba');
	const body = editEvent(EVENT, { save: 'Guardado.', savedToDb: true });

	it('Notice verde con su ícono, sin «✅»', () => {
		const at = body.indexOf('id="save-result"');
		expect(at).toBeGreaterThan(-1);
		const tag = body.slice(body.lastIndexOf('<div', at), body.indexOf('>', at) + 1);
		expect(tag).toMatch(/class="kv-notice ok\b/);
		expect(tag).toContain('role="status"');
		expect(squash(body)).toContain('Guardado.');
		expect(squash(body)).toContain('Se ve enseguida en el sitio.');
		expect(body).not.toContain('✅');
	});

	it('sin problemas, no hay resumen', () => {
		expect(summary(body)).toBeNull();
	});
});

/* ---------- material / amigues ---------- */

const MATERIAL_WITHOUT_TAGS = `---
title: Guía de prueba
summary: Un material inventado
published_date: 2031-09-01Z-03:00
category: material
tags: []
authors: []
---

Texto.
`;

/** @param {Record<string, any>} [props] */
const editMaterial = (props = {}) =>
	withoutComments(
		render(ContentEditor, {
			props: /** @type {any} */ ({
				data: {
					...common,
					category: 'material',
					mode: 'editar',
					raw: MATERIAL_WITHOUT_TAGS,
					sha: 'sha-de-prueba',
					slug: 'guia-de-prueba',
					source: null,
					fromTemplate: false,
					taken: [],
					imageUrl: null,
					today: '2031-10-02',
					mock: false
				},
				form: null,
				...props
			})
		}).body
	);

describe('ContentEditor: «Antes de guardar» con links a los campos', () => {
	it('antes de tocar Guardar, no se muestra (como siempre)', () => {
		expect(summary(editMaterial())).toBeNull();
	});

	it('al tocar Guardar: el mismo resumen, cada problema con link a su campo', () => {
		const body = editMaterial({ showProblems: true });
		const box = summary(body) ?? '';
		expect(box).toMatch(/^<div class="problems[^"]*" role="alert" id="save-problems">/);
		expect(box).toContain('<strong>Antes de guardar:</strong>');
		expect(links(box)).toEqual([
			['#tags-input', 'Poné al menos una etiqueta.'],
			['#authors-input', 'Poné al menos une autore.']
		]);
		for (const [href] of links(box)) expect(hasId(body, href.slice(1)), href).toBe(true);
	});
});
