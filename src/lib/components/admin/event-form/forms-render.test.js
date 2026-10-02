/**
 * El mismo formulario para crear y editar (opción 2B de gorrite): crear un evento
 * (/admin/eventos/nuevo), editarlo (PostEditor) y material / amigues (ContentEditor) se arman con
 * las mismas secciones de esta carpeta. Estas pruebas renderizan las tres páginas y revisan que
 * estén las secciones compartidas y los ids que usan las pruebas de punta a punta.
 */
import { describe, expect, it, vi } from 'vitest';
import { render } from 'svelte/server';
import { readable } from 'svelte/store';

vi.mock('$app/stores', () => ({
	page: readable({ url: new URL('http://localhost/admin/contenido/material/guia-de-prueba') })
}));

const { default: PostEditor } = await import('$lib/components/admin/PostEditor.svelte');
const { default: ContentEditor } =
	await import('$lib/components/admin/content/ContentEditor.svelte');
const { default: NewEvent } =
	await import('../../../../routes/(authed)/admin/eventos/nuevo/+page.svelte');

const EVENT = `---
title: Fiesta de prueba
summary: Una fiesta inventada para las pruebas
published_date: 2026-09-01Z-03:00
category: calendario
layout: calendario
status: abierto
start: 2026-12-19T22:00-03:00
end: 2026-12-20T03:00-03:00
location: Calle Falsa 123
link_text: Inscribirme
tags:
  - español
  - AMBA
authors:
  - Persona Inventada
---

Texto de **prueba**.
`;

const common = { tagUsage: {}, profiles: [], authorUsage: {}, maxImageBytes: 5 * 1024 * 1024 };

/** @param {string} body @param {string} id */
const hasId = (body, id) => body.includes(`id="${id}"`);

describe('PostEditor (Editar un evento)', () => {
	const body = render(PostEditor, {
		props: {
			data: {
				...common,
				post: { raw: EVENT, sha: 'sha-de-prueba', path: 'src/lib/posts/calendario/fiesta.md' },
				image: null,
				sales: null
			},
			form: null,
			category: 'calendario',
			postID: 'fiesta-de-prueba',
			embedded: true
		}
	}).body;

	it('usa «¿Cuándo es?» con el día y las horas por separado (no datetime-local)', () => {
		expect(hasId(body, 'sec-cuando')).toBe(true);
		expect(hasId(body, 'edit-start-time')).toBe(true);
		expect(body).toMatch(
			/id="edit-start-time"[^>]*value="22:00"|value="22:00"[^>]*id="edit-start-time"/
		);
		expect(body).toMatch(
			/id="edit-end-date"[^>]*value="2026-12-20"|value="2026-12-20"[^>]*id="edit-end-date"/
		);
		expect(body).not.toContain('datetime-local');
		expect(body).toContain('de 22:00 a 03:00 (del domingo 20 de diciembre de 2026)');
	});

	it('Datos, Texto con CodeMirror y la barra de guardar', () => {
		for (const id of ['sec-datos', 'title-input', 'location_map-input', 'sec-texto', 'save'])
			expect(hasId(body, id), id).toBe(true);
		expect(hasId(body, 'start-input')).toBe(false);
	});

	it('sin cambios, «Guardar» está apagado y el archivo es el mismo (salvo la fecha de hoy)', () => {
		expect(body).toMatch(/<button[^>]*id="save"[^>]*disabled/);
		const preview = body.match(/<pre class="markdown[^"]*">([\s\S]*?)<\/pre>/)?.[1] ?? '';
		expect(preview).toContain('start: 2026-12-19T22:00-03:00');
		expect(preview).toContain('end: 2026-12-20T03:00-03:00');
	});
});

describe('/admin/eventos/nuevo (crear un evento)', () => {
	const body = render(NewEvent, {
		props: {
			data: /** @type {any} */ ({
				...common,
				source: null,
				seriesPrompt: null,
				template: EVENT,
				today: '2026-10-02',
				prefill: { date: '', startTime: '', endTime: '' },
				duplicables: [],
				takenSlugs: [],
				mock: false
			}),
			form: null
		}
	}).body;

	it('los mismos ids de siempre en Fecha y Datos', () => {
		for (const id of [
			'sec-cuando',
			'ev-start-date',
			'ev-start-time',
			'sec-datos',
			'ev-title',
			'ev-summary',
			'ev-status',
			'ev-location',
			'ev-location-map',
			'ev-location-name',
			'ev-link',
			'ev-link-text',
			'ev-authors',
			'ev-image',
			'to-preview',
			'save-draft'
		])
			expect(hasId(body, id), id).toBe(true);
	});

	it('el texto también usa CodeMirror (BodySection)', () => {
		expect(hasId(body, 'ev-body')).toBe(true);
		expect(body).not.toMatch(/<textarea[^>]*id="ev-body"/);
	});
});

describe('ContentEditor (material en el panel)', () => {
	const MATERIAL = `---
title: Guía de prueba
summary: Un material inventado
published_date: 2026-09-01Z-03:00
category: material
tags:
  - BDSM
authors:
  - Persona Inventada
---

Texto.
`;
	const body = render(ContentEditor, {
		props: {
			data: /** @type {any} */ ({
				...common,
				category: 'material',
				mode: 'editar',
				raw: MATERIAL,
				sha: 'sha-de-prueba',
				slug: 'guia-de-prueba',
				source: null,
				fromTemplate: false,
				taken: [],
				imageUrl: null,
				today: '2026-10-02',
				mock: false
			}),
			form: null
		}
	}).body;

	it('el mismo armazón: índice de secciones, secciones compartidas y barra fija', () => {
		for (const id of [
			'sec-datos',
			'sec-imagen',
			'sec-etiquetas',
			'sec-texto',
			'sec-lista',
			'title-input',
			'authors-input',
			'content-image',
			'content-form',
			'save'
		])
			expect(hasId(body, id), id).toBe(true);
		expect(body).toMatch(
			/class="bar sticky[^"]*"[^>]*id="content-form"|id="content-form"[^>]*class="bar sticky/
		);
		expect(body).toContain('Vista previa');
	});
});
