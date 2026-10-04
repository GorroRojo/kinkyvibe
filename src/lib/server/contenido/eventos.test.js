/**
 * El mapa .md ↔ evento, con datos inventados y con TODOS los eventos reales del repo (que ya son
 * públicos): cada uno se importa sin errores y vuelve a dar la misma metadata que usa el sitio.
 */
import { describe, expect, it } from 'vitest';
import { coreTypes, validateData } from '../objects/types/index.js';
import { EVENT_FIELDS, eventToMeta, mdToEvent, nextDay } from './eventos.js';
import { metaDiff, normalizeMeta } from './parity.js';
import { splitMarkdown } from '../amigues/importer.js';
import { stripMarkdown } from '$lib/utils/search.js';
import { processPost } from '$lib/utils';
import { mergePosts } from './posts.js';
import { eventToMarkdown, markdownToEvent } from './markdown.js';

const evento = /** @type {import('../objects/types/index.js').CoreType} */ (
	coreTypes.get('evento')
);
const TEXT_KEYS = Object.entries(EVENT_FIELDS)
	.filter(([, f]) => f.kind === 'text' || f.kind === 'datetime' || f.kind === 'url')
	.map(([k]) => k);

/** La metadata como la da mdsvex en este deploy (la misma que usa el sitio). */
const metas = /** @type {Record<string, Record<string, any> | undefined>} */ (
	import.meta.glob('/src/lib/posts/calendario/*.md', { import: 'metadata', eager: true })
);
const raws = /** @type {Record<string, string>} */ (
	import.meta.glob('/src/lib/posts/calendario/*.md', {
		query: '?raw',
		import: 'default',
		eager: true
	})
);

/** @param {Record<string, unknown>} meta */
const norm = (meta) => normalizeMeta(meta, { textKeys: TEXT_KEYS });

const FAKE = {
	title: '  Taller Inventado de Nudos ',
	summary: 'Un resumen inventado',
	tags: ['español', 'KinkyVibe', 'pago', 'AMBA', 'pago'],
	layout: 'calendario',
	category: 'calendario',
	authors: ['KinkyVibe', 'Persona Inventada'],
	status: 'abierto',
	start: '2031-02-02T21:00-03:00',
	end: '2031-02-02T01:00-03:00',
	featured: 1,
	link: 'https://ejemplo.test/inscripcion',
	link_text: 'Inscribirme',
	location: 'Calle Falsa 123',
	published_date: '2031-01-10Z-03:00',
	force_unlisted: true,
	carrousel_color: 'white',
	tickets: [{ id: 'general', name: 'General', price: 1000 }]
};

describe('mdToEvent', () => {
	it('copia los campos con el mismo nombre y deja lo desconocido en `extra`', () => {
		const m = mdToEvent('taller-inventado-2031-02', FAKE, '\n\nHola **mundo**  \n');
		expect(m.title).toBe('Taller Inventado de Nudos');
		expect(m.visibility).toBe('public');
		expect(m.data).toMatchObject({
			summary: 'Un resumen inventado',
			tags: ['español', 'KinkyVibe', 'pago', 'AMBA', 'pago'],
			personas: [
				{ name: 'KinkyVibe', role: 'Organiza' },
				{ name: 'Persona Inventada', role: 'Organiza' }
			],
			featured: '1',
			unlisted: true,
			body: 'Hola **mundo**',
			extra: {
				carrousel_color: 'white',
				tickets: [{ id: 'general', name: 'General', price: 1000 }]
			}
		});
		expect(m.data).not.toHaveProperty('layout');
		expect(validateData(evento, m.data).ok).toBe(true);
	});

	it('un fin antes del inicio el mismo día es al día siguiente (con aviso)', () => {
		const m = mdToEvent('x', FAKE, '');
		expect(m.data.end).toBe('2031-02-03T01:00-03:00');
		expect(m.warnings.join(' ')).toMatch(/día siguiente/);
		expect(nextDay('2031-12-31T23:30-03:00')).toBe('2032-01-01T23:30-03:00');
	});

	it('force_unpublished es la visibilidad oculta', () => {
		expect(mdToEvent('x', { ...FAKE, force_unpublished: true }, '').visibility).toBe('hidden');
	});

	it('vuelve a dar la misma metadata', () => {
		const m = mdToEvent('x', FAKE, '');
		const v = validateData(evento, m.data);
		if (!v.ok) throw new Error(JSON.stringify(v.errors));
		const back = eventToMeta({ title: m.title, data: v.data, visibility: m.visibility });
		expect(metaDiff(norm(back), norm(FAKE))).toEqual([]);
	});
});

/*
 * «Personas en una sola sección»: en la base, `authors:` y `personas:` son una sola lista
 * (`data.personas`). La metadata que reciben las páginas (y el .md que arma la base para el
 * editor) vuelve a tener `authors` y `personas` como siempre. Lo importado antes, con
 * `data.authors` y `extra.personas`, se sigue leyendo igual.
 */
describe('personas: una sola lista en la base', () => {
	const WITH_PERSONAS = {
		...FAKE,
		personas: [
			{ perfil: 'colectivo-de-prueba', rol: 'Facilita' },
			{ nombre: 'Persona Sin Perfil', rol: 'Fotografía' },
			{ perfil: 'persona-de-prueba', rol: 'Organiza' }
		]
	};
	const LIST = [
		{ name: 'KinkyVibe', role: 'Organiza' },
		{ name: 'Persona Inventada', role: 'Organiza' },
		{ profile: 'colectivo-de-prueba', role: 'Facilita' },
		{ name: 'Persona Sin Perfil', role: 'Fotografía' },
		{ profile: 'persona-de-prueba', role: 'Organiza' }
	];

	it('importar guarda una sola lista (quienes organizan incluides), nada en extra', () => {
		const m = mdToEvent('x', WITH_PERSONAS, '');
		expect(m.data.personas).toEqual(LIST);
		expect(m.data).not.toHaveProperty('authors');
		expect(/** @type {any} */ (m.data.extra)).not.toHaveProperty('personas');
		const v = validateData(evento, m.data);
		expect(v.ok).toBe(true);
	});

	it('la metadata vuelve a tener authors (los que organizan, en orden) y personas', () => {
		const m = mdToEvent('x', WITH_PERSONAS, '');
		const back = eventToMeta({ title: m.title, data: m.data, visibility: m.visibility });
		expect(back.authors).toEqual(['KinkyVibe', 'Persona Inventada']);
		expect(back.personas).toEqual(WITH_PERSONAS.personas);
		expect(metaDiff(norm(back), norm(WITH_PERSONAS))).toEqual([]);
	});

	it('el .md que arma la base para el editor tiene los campos de siempre, y vuelve a la misma lista', () => {
		const m = mdToEvent('x', WITH_PERSONAS, 'Hola');
		const text = eventToMarkdown({ title: m.title, data: m.data, visibility: m.visibility });
		expect(text).toContain('authors:\n  - KinkyVibe\n  - Persona Inventada\n');
		expect(text).toContain('personas:\n  - perfil: colectivo-de-prueba\n    rol: Facilita\n');
		expect(text).toContain('  - nombre: Persona Sin Perfil\n    rol: Fotografía\n');
		expect(markdownToEvent('x', text).data.personas).toEqual(LIST);
	});

	it('lo importado con la forma de antes se lee igual (y pasa a la nueva al guardarlo)', () => {
		const nueva = mdToEvent('x', WITH_PERSONAS, '');
		const { personas, ...rest } = /** @type {Record<string, any>} */ (nueva.data);
		const vieja = {
			...rest,
			authors: ['KinkyVibe', 'Persona Inventada'],
			extra: { ...rest.extra, personas: WITH_PERSONAS.personas }
		};
		expect(personas).toEqual(LIST);
		// La forma de antes sigue siendo válida para el tipo (no hace falta migrar nada).
		expect(validateData(evento, vieja).ok).toBe(true);
		const fromOld = eventToMeta({ title: nueva.title, data: vieja, visibility: 'public' });
		const fromNew = eventToMeta({ title: nueva.title, data: nueva.data, visibility: 'public' });
		expect(fromOld.authors).toEqual(fromNew.authors);
		expect(fromOld.personas).toEqual(fromNew.personas);
		expect(metaDiff(norm(fromOld), norm(fromNew))).toEqual([]);
		// Guardar desde el panel pasa por el .md: queda con la forma nueva.
		const resaved = markdownToEvent(
			'x',
			eventToMarkdown({ title: nueva.title, data: vieja, visibility: 'public' })
		);
		expect(resaved.data.personas).toEqual(LIST);
		expect(resaved.data).not.toHaveProperty('authors');
	});

	it('el tipo no acepta una lista mal armada', () => {
		const v = validateData(evento, {
			start: '2031-02-02T21:00-03:00',
			personas: [{ role: 'Organiza' }]
		});
		expect(v.ok).toBe(false);
		expect(validateData(evento, { start: '2031-02-02T21:00-03:00', personas: {} }).ok).toBe(false);
	});
});

describe('los eventos reales del repo', () => {
	const entries = Object.entries(metas).filter(([path]) => !path.split('/').pop()?.startsWith('_'));

	it('están todos (los que el sitio muestra)', () => {
		expect(entries.filter(([, meta]) => meta).length).toBeGreaterThan(400);
	});

	it('cada uno se importa sin errores y vuelve a dar la misma metadata', () => {
		/** @type {string[]} */
		const problems = [];
		for (const [path, meta] of entries) {
			if (!meta) continue; // el sitio tampoco lo muestra (error en el frontmatter)
			const slug = path.split('/').pop()?.replace(/\.md$/, '') ?? '';
			const { body } = splitMarkdown(raws[path]);
			const m = mdToEvent(slug, meta, body);
			const v = validateData(evento, m.data);
			if (!v.ok) {
				// Sin excepciones: el sitio ya no muestra un evento desde su .md, así que uno que no se
				// puede importar desaparecería. (Antes se toleraba un fin semanas antes del inicio, que
				// seguía saliendo del .md; esos dos .md se corrigieron.)
				problems.push(`${slug}: ${v.errors.map((e) => e.message).join('; ')}`);
				continue;
			}
			const back = eventToMeta({ title: m.title, data: v.data, visibility: m.visibility });
			const diff = metaDiff(norm(back), norm(meta));
			if (diff.length) problems.push(`${slug}: difiere ${diff.join(', ')}`);
		}
		expect(problems).toEqual([]);
	});

	it('el texto para la búsqueda es el mismo desde el cuerpo guardado', () => {
		/** @type {string[]} */
		const problems = [];
		for (const [path, meta] of entries) {
			if (!meta) continue;
			const slug = path.split('/').pop()?.replace(/\.md$/, '') ?? '';
			const { body } = splitMarkdown(raws[path]);
			const stored = String(mdToEvent(slug, meta, body).data.body ?? '');
			if (stripMarkdown(stored).trim() !== stripMarkdown(raws[path]).trim()) problems.push(slug);
		}
		expect(problems).toEqual([]);
	});

	it('el texto .md que arma la base (para el editor) vuelve a dar los mismos datos', () => {
		/** @type {string[]} */
		const problems = [];
		for (const [path, meta] of entries) {
			if (!meta) continue;
			const slug = path.split('/').pop()?.replace(/\.md$/, '') ?? '';
			const m = mdToEvent(slug, meta, splitMarkdown(raws[path]).body);
			const v = validateData(evento, m.data);
			if (!v.ok) continue;
			const object = { title: m.title, data: v.data, visibility: m.visibility };
			const again = markdownToEvent(slug, eventToMarkdown(object));
			const v2 = validateData(evento, again.data);
			if (!v2.ok) {
				problems.push(`${slug}: ${v2.errors.map((e) => e.message).join('; ')}`);
				continue;
			}
			if (again.title !== m.title || again.visibility !== m.visibility)
				problems.push(`${slug}: título`);
			if (JSON.stringify(v2.data) !== JSON.stringify(v.data)) problems.push(`${slug}: datos`);
		}
		expect(problems).toEqual([]);
	});

	it('las listas quedan en el mismo orden (también con fechas repetidas)', async () => {
		/** @type {any[]} */
		const fromMd = [];
		/** @type {any[]} */
		const fromDb = [];
		for (const [path, meta] of entries) {
			if (!meta || meta.force_unpublished) continue;
			const slug = path.split('/').pop()?.replace(/\.md$/, '') ?? '';
			fromMd.push(await processPost(undefined, slug, /** @type {any} */ (meta), true));
			const m = mdToEvent(slug, meta, '');
			const v = validateData(evento, m.data);
			if (!v.ok) continue;
			const back = eventToMeta({ title: m.title, data: v.data, visibility: m.visibility });
			fromDb.push(await processPost(undefined, slug, /** @type {any} */ (back), true));
		}
		// Como loadMarkdownPosts: en el orden del glob, ordenado por fecha (sort estable).
		/** @param {any} x */
		const time = (x) =>
			new Date(x.meta?.start ?? x.meta?.updated_date ?? x.meta?.published_date).getTime();
		fromMd.sort((a, b) => time(b) - time(a));
		const imported = new Set(fromDb.map((p) => p.meta.postID));
		const merged = mergePosts([], fromDb.reverse());
		expect(merged.map((p) => p.meta.postID)).toEqual(
			fromMd.filter((p) => imported.has(p.meta.postID)).map((p) => p.meta.postID)
		);
	});
});
