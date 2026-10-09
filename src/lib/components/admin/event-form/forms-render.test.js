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

/** @param {string} html */
const text = (html) =>
	html
		.replace(/<[^>]*>/g, '')
		.replace(/\s+/g, ' ')
		.trim();
/** El ícono de Lucide de un pedazo de HTML (la clase `lucide-…` de su <svg>). @param {string} html */
const lucide = (html) => html.match(/\blucide-(?!icon\b)([a-z0-9-]+)/)?.[1] ?? null;

/** Las entradas del índice de secciones: id al que salta, nombre e ícono. @param {string} body */
function indexEntries(body) {
	const nav = body.match(/<nav class="section-index[\s\S]*?<\/nav>/)?.[0] ?? '';
	return [...nav.matchAll(/<a[^>]*href="#([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)].map((m) => ({
		id: m[1],
		label: text(m[2]),
		icon: lucide(m[2])
	}));
}

/** El título (<legend> o <h2>) de la sección con ese id. @param {string} body @param {string} id */
function headingOf(body, id) {
	const start = body.search(new RegExp(`<(fieldset|section)[^>]*\\bid="${id}"`));
	if (start < 0) return null;
	const m = body.slice(start).match(/<(legend|h2)\b[^>]*>([\s\S]*?)<\/\1>/);
	return m ? { label: text(m[2]), icon: lucide(m[2]) } : null;
}

/**
 * Cada sección del índice tiene un título con el mismo nombre y el mismo ícono de Lucide, y
 * ningún título lleva emoji (los emoji quedan para el contenido y las etiquetas).
 * @param {string} body
 */
function expectHeadingsLikeIndex(body) {
	const entries = indexEntries(body);
	expect(entries.length).toBeGreaterThan(3);
	for (const e of entries) {
		expect(e.icon, e.id).toBeTruthy();
		expect(headingOf(body, e.id), e.id).toEqual({ label: e.label, icon: e.icon });
	}
	for (const m of body.matchAll(/<legend\b[^>]*>([\s\S]*?)<\/legend>/g))
		expect(text(m[1])).not.toMatch(/\p{Extended_Pictographic}/u);
}

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

	it('los títulos de las secciones son los del índice (ícono de Lucide, sin emoji)', () => {
		expectHeadingsLikeIndex(body);
		expect(headingOf(body, 'sec-cuando')?.label).toBe('Fecha y hora');
	});

	it('usa «Fecha y hora» con el día y las horas por separado (no datetime-local)', () => {
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

/*
 * «Personas en una sola sección»: Organizan y Personas son una sola sección («Personas») en los
 * tres formularios, con el buscador de siempre (mismo id) y, con el interruptor personas_eventos,
 * el rol de cada persona y «+ Nuevo rol…».
 */
describe('Personas: una sola sección', () => {
	const WITH_PERSONAS = EVENT.replace(
		'---\n\nTexto',
		'personas:\n  - perfil: colectivo-de-prueba\n    rol: Facilita\n  - nombre: Persona Sin Perfil\n    rol: Fotografía\n---\n\nTexto'
	);
	const personasData = {
		roles: ['Autore', 'Organiza', 'Facilita', 'Fotografía'],
		profiles: [
			{
				slug: 'colectivo-de-prueba',
				title: 'Colectivo de Prueba',
				kind: 'proyecto',
				href: '/amigues/colectivo-de-prueba'
			}
		]
	};
	/** @param {any} personas */
	const edit = (personas) =>
		render(PostEditor, {
			props: {
				data: {
					...common,
					post: {
						raw: WITH_PERSONAS,
						sha: 'sha-de-prueba',
						path: 'src/lib/posts/calendario/fiesta.md'
					},
					image: null,
					sales: null,
					personas
				},
				form: null,
				category: 'calendario',
				postID: 'fiesta-de-prueba',
				embedded: true
			}
		}).body;

	it('con el interruptor: una sola lista con rol por persona, Organiza primero, y «+ Nuevo rol…»', () => {
		const body = edit(personasData);
		expect(hasId(body, 'sec-personas')).toBe(true);
		expect(hasId(body, 'authors-input')).toBe(true);
		// Nada de Organizan en Datos ni de la vieja fila de perfil.
		expect(body).not.toContain('edit-personas-perfil-0');
		for (const id of ['edit-personas-rol-0', 'edit-personas-rol-1', 'edit-personas-rol-2'])
			expect(hasId(body, id), id).toBe(true);
		expect(body.indexOf('Persona Inventada')).toBeLessThan(body.indexOf('Colectivo de Prueba'));
		expect(body).toContain('Persona Sin Perfil');
		expect(body).toContain('+ Nuevo rol…');
		expect(body).toMatch(/<option value="Facilita"[^>]*selected/);
	});

	it('sin cambios, el archivo es el mismo (solo la fecha de hoy): authors y personas como estaban', () => {
		const body = edit(personasData);
		expect(body).toMatch(/<button[^>]*id="save"[^>]*disabled/);
		const preview = (body.match(/<pre class="markdown[^"]*">([\s\S]*?)<\/pre>/)?.[1] ?? '')
			.replaceAll('&lt;', '<')
			.replaceAll('&gt;', '>')
			.replaceAll('&quot;', '"')
			.replaceAll('&#39;', "'")
			.replaceAll('&amp;', '&');
		expect(preview).toContain('authors:\n  - Persona Inventada\n');
		expect(preview).toContain(
			'personas:\n  - perfil: colectivo-de-prueba\n    rol: Facilita\n  - nombre: Persona Sin Perfil\n    rol: Fotografía\n'
		);
	});

	it('sin el interruptor: el «Organizan» de siempre (sin roles ni «+ Nuevo rol…») y personas: no se toca', () => {
		const body = edit(null);
		expect(hasId(body, 'sec-personas')).toBe(true);
		expect(hasId(body, 'authors-input')).toBe(true);
		expect(body).not.toContain('edit-personas-rol-0');
		expect(body).not.toContain('+ Nuevo rol…');
		expect(body).toContain('Persona Inventada');
		expect(body).not.toContain('Colectivo de Prueba');
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
			'sec-personas',
			'ev-image',
			'to-preview',
			'save-draft'
		])
			expect(hasId(body, id), id).toBe(true);
	});

	it('los títulos de las secciones son los del índice (ícono de Lucide, sin emoji)', () => {
		expectHeadingsLikeIndex(body);
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
			'sec-personas',
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

	it('los títulos de las secciones son los del índice (ícono de Lucide, sin emoji)', () => {
		expectHeadingsLikeIndex(body);
	});
});

/*
 * Contenido en la base (el interruptor `contenido_db` quedó fijo): ningún texto de los formularios habla de
 * GitHub ni de esperar minutos; apagado, los textos son los de siempre. Y la barra de guardar
 * usa SaveButton (la ruedita y «Guardando…» mientras guarda).
 */
describe('textos según adónde se guarda (savesToDb)', () => {
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
	/** @param {boolean | undefined} savesToDb */
	const editBody = (savesToDb) =>
		render(PostEditor, {
			props: {
				data: {
					...common,
					post: { raw: EVENT, sha: 'sha-de-prueba', path: 'src/lib/posts/calendario/fiesta.md' },
					image: null,
					sales: null,
					savesToDb
				},
				form: null,
				category: 'calendario',
				postID: 'fiesta-de-prueba',
				embedded: true
			}
		}).body;
	/** @param {boolean | undefined} savesToDb */
	const newBody = (savesToDb) =>
		render(NewEvent, {
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
					mock: false,
					savesToDb
				}),
				form: null
			}
		}).body;
	/** @param {boolean | undefined} savesToDb */
	const contentBody = (savesToDb) =>
		render(ContentEditor, {
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
					mock: false,
					savesToDb
				}),
				form: null
			}
		}).body;
	/**
	 * El texto entre etiquetas, con los espacios juntados (solo para buscar frases en lo que
	 * renderiza el servidor; no limpia HTML).
	 * @param {string} html
	 */
	const text = (html) =>
		html
			.split(/<[^>]*>/)
			.join(' ')
			.split(/\s+/)
			.join(' ');

	describe('apagado (GitHub): los textos de siempre', () => {
		it('Editar: el aviso de las pruebas automáticas y @Gorro_Rojo', () => {
			for (const body of [editBody(false), editBody(undefined)]) {
				expect(text(body)).toContain(
					'Al guardar, el cambio pasa por las pruebas automáticas y se publica solo: tarda unos minutos (normalmente menos de 15) en verse. Si pasa más tiempo, avisale a @Gorro_Rojo .'
				);
				expect(text(body)).toContain('Ver el archivo que se va a guardar');
			}
		});

		it('Crear: «Ver el archivo que se va a guardar»', () => {
			expect(text(newBody(false))).toContain('Ver el archivo que se va a guardar');
		});

		it('Material: los cambios tardan unos minutos', () => {
			const t = text(contentBody(false));
			expect(t).toContain(
				'Los cambios tardan unos minutos (normalmente entre 2 y 5) en verse en el sitio.'
			);
			expect(t).toContain('Ver el archivo que se va a guardar');
		});
	});

	describe('prendido (la base): sin GitHub ni minutos de espera', () => {
		const NOT_GITHUB = /GitHub|pruebas automáticas|deploy|Si pasa más tiempo/;

		it('Editar', () => {
			const t = text(editBody(true));
			expect(t).toContain(
				'Al guardar, el cambio se ve enseguida en el sitio y queda en el historial.'
			);
			expect(t).toContain('Ver los datos que se van a guardar');
			expect(t).not.toMatch(NOT_GITHUB);
			expect(t).not.toContain('unos minutos');
		});

		it('Crear', () => {
			const t = text(newBody(true));
			expect(t).toContain('Ver los datos que se van a guardar');
			expect(t).not.toMatch(NOT_GITHUB);
			expect(t).not.toContain('unos minutos');
		});

		it('Material', () => {
			const t = text(contentBody(true));
			expect(t).toContain('Los cambios se ven enseguida en el sitio');
			expect(t).toContain('Ver los datos que se van a guardar');
			expect(t).not.toMatch(NOT_GITHUB);
			expect(t).not.toContain('normalmente entre 2 y 5');
		});
	});

	it('la barra de guardar usa SaveButton en los tres (mismos ids)', () => {
		for (const [body, id] of /** @type {const} */ ([
			[editBody(true), 'save'],
			[contentBody(true), 'save'],
			[newBody(true), 'to-preview'],
			[newBody(true), 'save-draft'],
			[editBody(false), 'save'],
			[contentBody(false), 'save'],
			[newBody(false), 'save-draft']
		])) {
			expect(body, id).toMatch(new RegExp(`<button[^>]*id="${id}"[^>]*class="[^"]*save-button`));
		}
		// Sin guardar todavía: ni ruedita ni confirmación.
		expect(editBody(true)).not.toContain('aria-busy');
		expect(editBody(true)).not.toContain('id="save-status"');
	});
});

describe('después de guardar: la confirmación según adónde se guardó', () => {
	/** @param {any} form */
	const editSaved = (form) =>
		render(PostEditor, {
			props: {
				data: {
					...common,
					post: { raw: EVENT, sha: 'sha-de-prueba', path: 'src/lib/posts/calendario/fiesta.md' },
					image: null,
					sales: null,
					savesToDb: Boolean(form.savedToDb)
				},
				form,
				category: 'calendario',
				postID: 'fiesta-de-prueba',
				embedded: true
			}
		}).body;
	const PR = { number: 7, url: 'https://example.invalid/pr/7', state: 'auto' };

	it('Editar, en la base: «Guardado. Se ve enseguida en el sitio.» en la barra', () => {
		const body = editSaved({ save: 'Guardado', publish: null, savedToDb: true });
		expect(body).toMatch(/id="save-status"[\s\S]*Guardado\. Se ve enseguida en el sitio\./);
		expect(body).toMatch(/<p class="note[^"]*" role="status">[\s\S]*Se ve enseguida en el sitio/);
		expect(body).not.toContain('PR #7');
	});

	it('Editar, con GitHub: el PR, como siempre', () => {
		const body = editSaved({ save: 'Guardado', publish: PR, savedToDb: false });
		expect(body).toMatch(
			/id="save-status"[\s\S]*Guardado\. Se publica en unos minutos, cuando pasen las pruebas\./
		);
		expect(body).toContain('PR #7');
		expect(body).not.toContain('Se ve enseguida');
	});

	/** @param {any} form */
	const newDone = (form) =>
		render(NewEvent, {
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
					mock: false,
					savesToDb: Boolean(form.savedToDb)
				}),
				form: {
					success: true,
					slug: 'fiesta-de-prueba',
					mode: 'publicar',
					commitUrl: 'https://example.invalid/commit/1',
					eventUrl: '/calendario/fiesta-de-prueba',
					files: ['src/lib/posts/calendario/fiesta-de-prueba.md'],
					warnings: [],
					...form
				}
			}
		}).body;

	it('Crear, en la base: ya está en el sitio, sin GitHub', () => {
		const body = newDone({ savedToDb: true, publish: null, commitUrl: '/calendario/x' }).replace(
			/\s+/g,
			' '
		);
		expect(body).toContain('Ya está en');
		expect(body).toContain('Ya se ve en el sitio.');
		expect(body).toContain('Guardado en la base, con historial');
		expect(body).not.toMatch(/GitHub|ver el commit|tarda unos minutos/);
	});

	it('Crear, con GitHub: el texto de siempre', () => {
		const body = newDone({ savedToDb: false, publish: null }).replace(/\s+/g, ' ');
		expect(body).toContain('Va a estar en');
		expect(body).toContain('El sitio tarda unos minutos');
		expect(body).toContain('Cambio guardado en GitHub');
		expect(body).not.toContain('Guardado en la base');
	});
});
