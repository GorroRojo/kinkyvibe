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
			authors: ['KinkyVibe', 'Persona Inventada'],
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
				// Un fin semanas antes del inicio es un error de tipeo del .md: la importación lo
				// informa y ese evento sigue saliendo del .md (no se adivina la fecha).
				const typo =
					v.errors.every((e) => e.path === 'end') &&
					Date.parse(String(meta.end)) < Date.parse(String(meta.start));
				if (!typo) problems.push(`${slug}: ${v.errors.map((e) => e.message).join('; ')}`);
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
		const merged = mergePosts([], { claimed: new Set() }, fromDb.reverse());
		expect(merged.map((p) => p.meta.postID)).toEqual(
			fromMd.filter((p) => imported.has(p.meta.postID)).map((p) => p.meta.postID)
		);
	});
});
