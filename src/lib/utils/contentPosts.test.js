import { describe, it, expect } from 'vitest';
import {
	buildContentMarkdown,
	contentProblems,
	contentRow,
	duplicateContentForm,
	fieldsFor,
	filterContentRows,
	freeContentSlug,
	quickTagGroups,
	readContentForm,
	setUnlistedFlag,
	suggestContentSlug,
	toggleQuickTag,
	topTags,
	validateContentSlug
} from './contentPosts.js';
import tagsFactory from './tags.js';

const MATERIAL = `---
published_date: 2019-05-10Z-03:00
#updated_date: 2023-11-04Z-03:00
title: Anatomía de prueba
summary: Un resumen.
tags:
  - español # español | inglés #
  - pago # gratis | pago #
  - fanzine
layout: material
category: material
authors:
  - DemonWeb
featured: 1
#force_unlisted: false
link: https://example.com/tienda
---

## Hola

Texto con [[bondage]].
`;

const PROFILE = `---
published_date: 2024-01-11Z-03:00
title: Perfil de Prueba
summary: 'Algo.'
tags:
  - español
  - profesional
layout: amigues
category: amigues
authors:
  - Gorro_Rojo
featured: 1
pronoun: https://pronombr.es/elle
link: https://example.com
email: fake@example.com
tel: +54 9 11 0000 0000
---
Cuerpo.
`;

describe('fields', () => {
	it('material and amigues have the fields their posts use', () => {
		const m = fieldsFor('material').map((f) => f.key);
		expect(m).toEqual(
			expect.arrayContaining([
				'title',
				'summary',
				'published_date',
				'link',
				'redirect',
				'force_unlisted'
			])
		);
		const a = fieldsFor('amigues');
		expect(a.map((f) => f.key)).toEqual(expect.arrayContaining(['pronoun', 'job_title', 'link']));
		// Contact data only in its own (public, collapsed) section, and nothing beyond /edit's fields.
		expect(a.filter((f) => f.section === 'contacto').map((f) => f.key)).toEqual([
			'email',
			'tel',
			'location',
			'bday'
		]);
		expect(fieldsFor('wiki')).toEqual([]);
	});
});

describe('slugs', () => {
	it('suggests kebab-case for material and handles for amigues', () => {
		expect(suggestContentSlug('¡Guía de Cuerdas Básica!', 'material')).toBe(
			'guia-de-cuerdas-basica'
		);
		expect(suggestContentSlug('Mi Pieza Acción Gráfica', 'amigues')).toBe('MiPiezaAccionGrafica');
		expect(suggestContentSlug('   ', 'material')).toBe('');
	});
	it('validates format, templates and collisions ignoring case', () => {
		expect(validateContentSlug('', 'material')).toMatch(/Falta/);
		expect(validateContentSlug('Con Mayus', 'material')).toMatch(/minúsculas/);
		expect(validateContentSlug('_post_template', 'material')).toMatch(/plantillas/);
		expect(validateContentSlug('la.colectiver', 'amigues')).toBeNull();
		expect(validateContentSlug('a..b', 'amigues')).toMatch(/solo puede/);
		expect(validateContentSlug('demonweb', 'amigues', ['DemonWeb'])).toMatch(/Ya existe.*DemonWeb/);
		expect(validateContentSlug('nuevo-zine', 'material', ['otro'])).toBeNull();
	});
	it('finds a free slug', () => {
		expect(freeContentSlug('zine', 'material', ['zine', 'zine-2'])).toBe('zine-3');
		expect(freeContentSlug('Perfil', 'amigues', ['perfil'])).toBe('Perfil2');
		expect(freeContentSlug('libre', 'material', ['otro'])).toBe('libre');
	});
});

describe('readContentForm / buildContentMarkdown', () => {
	it('reads the fields, tags, authors and body', () => {
		const f = readContentForm('material', MATERIAL);
		expect(f.values.title).toBe('Anatomía de prueba');
		expect(f.values.published_date).toBe('2019-05-10');
		expect(f.values.updated_date).toBe('');
		expect(f.values.redirect).toBe(false);
		expect(f.tags).toEqual(['español', 'pago', 'fanzine']);
		expect(f.authors).toEqual(['DemonWeb']);
		expect(f.featured).toBe('1');
		expect(f.body).toContain('## Hola');
	});

	it('gives back the same file when nothing changed', () => {
		const f = readContentForm('material', MATERIAL);
		expect(buildContentMarkdown('material', MATERIAL, f, structuredClone(f))).toBe(MATERIAL);
	});

	it('writes only what changed and keeps comments', () => {
		const initial = readContentForm('material', MATERIAL);
		const f = structuredClone(initial);
		f.values.title = 'Otro título';
		f.values.force_unlisted = true;
		f.tags = ['español', 'gratis', 'fanzine'];
		f.body = '\nNuevo cuerpo.\n';
		const out = buildContentMarkdown('material', MATERIAL, initial, f, {
			touchUpdated: '2026-09-30'
		});
		expect(out).toContain('title: Otro título');
		expect(out).toContain('force_unlisted: true');
		expect(out).toContain('updated_date: 2026-09-30Z-03:00');
		expect(out).toContain('  - español # español | inglés #');
		expect(out).toContain('  - gratis');
		expect(out).not.toContain('  - pago');
		expect(out).toContain('link: https://example.com/tienda');
		expect(out.endsWith('---\n\nNuevo cuerpo.\n')).toBe(true);
	});

	it('comments out cleared fields and removes an empty authors list', () => {
		const initial = readContentForm('material', MATERIAL);
		const f = structuredClone(initial);
		f.values.link = '';
		f.authors = [];
		const out = buildContentMarkdown('material', MATERIAL, initial, f);
		expect(out).toContain('#link: https://example.com/tienda');
		expect(out).not.toMatch(/^authors:/m);
	});

	it('sets or comments out featured', () => {
		const initial = readContentForm('material', MATERIAL);
		expect(buildContentMarkdown('material', MATERIAL, initial, initial, { featured: 3 })).toContain(
			'featured: 3'
		);
		expect(
			buildContentMarkdown('material', MATERIAL, initial, initial, { featured: null })
		).toContain('#featured: 1');
	});

	it('forces keys for a new post (template values are only a guide)', () => {
		const initial = readContentForm('material', MATERIAL);
		const f = structuredClone(initial);
		const out = buildContentMarkdown('material', MATERIAL, initial, f, {
			forceKeys: ['published_date']
		});
		expect(out).toContain('published_date: 2019-05-10Z-03:00');
	});

	it('throws a readable error for broken frontmatter', () => {
		expect(() => readContentForm('material', '---\ntitle: [roto\n---\n')).toThrow(/formato/);
		expect(() => readContentForm('material', 'sin frontmatter')).toThrow();
	});
});

describe('contentProblems', () => {
	it('asks for title, date and a tag and checks links and mails', () => {
		const f = readContentForm('amigues', PROFILE);
		expect(contentProblems('amigues', f)).toEqual([]);
		f.values.title = '';
		f.values.link = 'instagram.com/x';
		f.values.email = 'no-es-mail';
		f.tags = [];
		const p = contentProblems('amigues', f);
		expect(p).toContain('Falta «Título».');
		expect(p.some((x) => x.includes('https://'))).toBe(true);
		expect(p.some((x) => x.includes('mail'))).toBe(true);
		expect(p).toContain('Poné al menos una etiqueta.');
	});
	it('material needs an author (its page lists them)', () => {
		const f = readContentForm('material', MATERIAL);
		expect(contentProblems('material', f)).toEqual([]);
		f.authors = [];
		expect(contentProblems('material', f)).toContain('Poné al menos une autore.');
	});
	it('redirect needs a link', () => {
		const f = readContentForm('material', MATERIAL);
		f.values.redirect = true;
		f.values.link = '';
		expect(contentProblems('material', f)).toContain('Para ir directo al link hace falta el link.');
	});
});

describe('duplicateContentForm', () => {
	it('marks the copy, dates it today and drops image and contact data', () => {
		const f = readContentForm('amigues', PROFILE);
		const d = duplicateContentForm('amigues', f, '2026-09-30');
		expect(d.values.title).toBe('Perfil de Prueba (copia)');
		expect(d.values.published_date).toBe('2026-09-30');
		expect(d.values.email).toBe('');
		expect(d.values.tel).toBe('');
		expect(d.featured).toBe('');
		expect(f.values.email).toBe('fake@example.com'); // original untouched
	});
});

describe('setUnlistedFlag', () => {
	it('turns force_unlisted on and off changing only that line', () => {
		const on = setUnlistedFlag(MATERIAL, true);
		expect(on).toBe(MATERIAL.replace('#force_unlisted: false', 'force_unlisted: true'));
		const off = setUnlistedFlag(on, false);
		expect(off).toBe(MATERIAL.replace('#force_unlisted: false', '#force_unlisted: true'));
		expect(setUnlistedFlag(on, true)).toBe(on);
		expect(setUnlistedFlag(MATERIAL, false)).toBe(MATERIAL);
	});
	it('handles "# force_unlisted", a missing key and CRLF', () => {
		expect(setUnlistedFlag('---\ntitle: a\n# force_unlisted: true # x #\n---\nb', true)).toBe(
			'---\ntitle: a\nforce_unlisted: true # x #\n---\nb'
		);
		expect(setUnlistedFlag('---\r\ntitle: a\r\n---\r\nb', true)).toBe(
			'---\r\ntitle: a\r\nforce_unlisted: true\r\n---\r\nb'
		);
		expect(() => setUnlistedFlag('sin propiedades', true)).toThrow();
	});
});

describe('list rows', () => {
	const rows = [
		contentRow(
			'a',
			{
				title: 'Guía de cuerdas',
				tags: ['shibari', 'español'],
				authors: ['DemonWeb'],
				published_date: '2024-01-01Z-03:00'
			},
			'/a.webp'
		),
		contentRow('b', { title: 'Fanzine', tags: ['fanzine', 'espanol'], force_unlisted: true }),
		contentRow('c', { title: 'Borrador', tags: 'BDSM', force_unpublished: true })
	];
	it('builds rows', () => {
		expect(rows[0]).toMatchObject({ published: '2024-01-01', unlisted: false, thumb: '/a.webp' });
		expect(rows[2].tags).toEqual(['BDSM']);
	});
	it('filters by text, state and canonical tags', () => {
		const tm = tagsFactory();
		/** @param {string} t */
		const canon = (t) => tm.get(t)?.id ?? t;
		expect(filterContentRows(rows, { q: 'guia demon' }).map((r) => r.slug)).toEqual(['a']);
		expect(filterContentRows(rows, { state: 'no-listadas' }).map((r) => r.slug)).toEqual([
			'b',
			'c'
		]);
		expect(filterContentRows(rows, { state: 'sin-imagen' }).map((r) => r.slug)).toEqual(['b', 'c']);
		expect(filterContentRows(rows, { tags: ['español'], canon }).map((r) => r.slug)).toEqual([
			'a',
			'b'
		]);
		expect(topTags(rows, canon)[0]).toEqual({ id: 'español', count: 2 });
	});
});

describe('quick tags', () => {
	const tm = tagsFactory();
	/** @param {string} t */
	const canon = (t) => tm.get(t)?.id ?? t;
	it('come from the tag tree', () => {
		const g = quickTagGroups('material', tm);
		expect(g.map((x) => x.label)).toEqual(['Idioma', 'Precio', 'Tipo', 'Formato', 'De KinkyVibe']);
		expect(g[1].tags).toContain('gratis');
		expect(quickTagGroups('amigues', tm).find((x) => x.label === 'Dónde')?.tags).toContain('AMBA');
	});
	it('single groups keep one; aliases count', () => {
		const precio = quickTagGroups('material', tm)[1];
		expect(toggleQuickTag(['pago', 'BDSM'], 'gratis', precio, canon)).toEqual(['BDSM', 'gratis']);
		const idioma = quickTagGroups('material', tm)[0];
		expect(toggleQuickTag(['espanol'], 'español', idioma, canon)).toEqual([]);
		const tipo = quickTagGroups('material', tm)[2];
		expect(toggleQuickTag(['web'], 'descargable', tipo, canon)).toEqual(['web', 'descargable']);
	});
});
