import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseDocument } from 'yaml';
import {
	splitMarkdown,
	joinMarkdown,
	readEventFields,
	applyFrontmatterChanges,
	REMOVE,
	parseEventDate,
	formatEventDate,
	formatPostDate,
	todayInArgentina,
	addDays,
	daysBetween,
	validateSchedule,
	describeSchedule,
	deriveSlug,
	slugify,
	validateSlug,
	uniqueSlug,
	detectImageType,
	isNumericFeatured,
	buildEventMarkdown,
	formFromSource,
	NEW_EVENT_TEMPLATE
} from './eventDraft.js';

/** @param {string} slug */
const post = (slug) =>
	readFileSync(new URL(`../posts/calendario/${slug}.md`, import.meta.url), 'utf8');

/** @param {string} md */
const meta = (md) => parseDocument(splitMarkdown(md).frontmatter).toJS();

describe('splitMarkdown / joinMarkdown', () => {
	it('splits a real event and joins it back unchanged', () => {
		const raw = post('picantearla-2026-09');
		const { frontmatter, body } = splitMarkdown(raw);
		expect(frontmatter.startsWith('published_date: 2026-09-03Z-03:00')).toBe(true);
		expect(body.startsWith('## 🤩 LA IDEA DEL EVENTO')).toBe(true);
		expect(joinMarkdown(frontmatter, body)).toBe(raw.replace(/\n\n---\n/, '\n---\n'));
	});
	it('normalizes CRLF files', () => {
		const { frontmatter } = splitMarkdown(post('amichis-2024-09'));
		expect(frontmatter.includes('\r')).toBe(false);
		expect(readEventFields(frontmatter).start).toBe('2024-10-05T23:59-03:00');
	});
	it('handles events without body', () => {
		const { body } = splitMarkdown(post('punto-fijo-2026-09'));
		expect(body).toBe('');
	});
	it('rejects files without frontmatter', () => {
		expect(() => splitMarkdown('# hola')).toThrow();
		// real broken file in the repo (whole file indented by two spaces)
		expect(() => splitMarkdown(post('taller-shibari-intensivo-2024-02'))).toThrow();
	});
});

describe('dates', () => {
	it('parses site dates keeping the wall-clock time', () => {
		expect(parseEventDate('2026-09-12T20:00-03:00')).toEqual({ date: '2026-09-12', time: '20:00' });
		expect(parseEventDate('2026-09-13T01:30-03:00')).toEqual({ date: '2026-09-13', time: '01:30' });
		expect(parseEventDate('2026-09-08Z-03:00')).toEqual({ date: '2026-09-08', time: '' });
		expect(parseEventDate('')).toEqual({ date: '', time: '' });
		expect(parseEventDate(undefined)).toEqual({ date: '', time: '' });
		expect(parseEventDate(new Date('2026-09-12T20:00-03:00'))).toEqual({
			date: '2026-09-12',
			time: '20:00'
		});
	});
	it('formats site dates', () => {
		expect(formatEventDate('2026-10-10', '20:00')).toBe('2026-10-10T20:00-03:00');
		expect(() => formatEventDate('2026-02-30', '20:00')).toThrow();
		expect(() => formatEventDate('2026-10-10', '25:00')).toThrow();
		expect(formatPostDate('2026-09-29')).toBe('2026-09-29Z-03:00');
	});
	it('computes today in Argentina', () => {
		expect(todayInArgentina(new Date('2026-09-30T02:00:00Z'))).toBe('2026-09-29');
		expect(todayInArgentina(new Date('2026-09-30T03:00:00Z'))).toBe('2026-09-30');
	});
	it('does day arithmetic across months', () => {
		expect(addDays('2026-09-30', 1)).toBe('2026-10-01');
		expect(daysBetween('2026-09-12', '2026-09-13')).toBe(1);
		expect(daysBetween('2026-12-31', '2027-01-01')).toBe(1);
	});
	it('validates schedules', () => {
		expect(validateSchedule('2026-10-10T20:00-03:00', '2026-10-11T01:30-03:00')).toBe(null);
		expect(validateSchedule('2026-10-10T20:00-03:00', undefined)).toBe(null);
		// real mistake seen in aberraciones-2024-03: ends "before" it starts
		expect(validateSchedule('2024-03-17T21:00-03:00', '2024-03-17T01:00-03:00')).toMatch(/terminar/);
		expect(validateSchedule('', '')).toMatch(/inicio/);
	});
	it('describes schedules in Spanish', () => {
		expect(describeSchedule('2026-09-12T20:00-03:00', '2026-09-13T01:30-03:00')).toBe(
			'sábado 12 de septiembre de 2026, de 20:00 a 01:30 (del domingo 13 de septiembre de 2026)'
		);
		expect(describeSchedule('2026-10-10T20:00-03:00')).toBe('sábado 10 de octubre de 2026, a las 20:00');
	});
});

describe('slugs', () => {
	it('replaces the year-month of real slugs', () => {
		expect(deriveSlug('picantearla-2026-08', '2026-10-10')).toBe('picantearla-2026-10');
		expect(deriveSlug('taller-ecofetichismo-2026-09-cordoba', '2026-11-01')).toBe(
			'taller-ecofetichismo-2026-11-cordoba'
		);
		expect(deriveSlug('cine-para-sucixs-2026-06-montevideo', '2027-01-05')).toBe(
			'cine-para-sucixs-2027-01-montevideo'
		);
		expect(deriveSlug('contra-la-moral-sexual-2024-11-parte-2', '2026-10-01')).toBe(
			'contra-la-moral-sexual-2026-10-parte-2'
		);
		expect(deriveSlug('aberraciones-2025-07-la-ceremonie', '2026-10-01')).toBe(
			'aberraciones-2026-10-la-ceremonie'
		);
	});
	it('modernizes old-style slugs', () => {
		expect(deriveSlug('cine-para-sucixs-sep-2023', '2026-10-01')).toBe('cine-para-sucixs-2026-10');
		expect(deriveSlug('picantearla-diciembre-2023', '2026-10-01')).toBe('picantearla-2026-10');
		expect(deriveSlug('festival-24-7-2023', '2026-10-01')).toBe('festival-24-7-2026-10');
		expect(deriveSlug('cine-para-sucixs', '2026-10-01')).toBe('cine-para-sucixs-2026-10');
		expect(deriveSlug('charla-debate-sobre-dominacion', '2026-10-01')).toBe(
			'charla-debate-sobre-dominacion-2026-10'
		);
	});
	it('does not mistake numbers that are not dates', () => {
		expect(deriveSlug('festival-24-7', '2026-10-01')).toBe('festival-24-7-2026-10');
	});
	it('keeps the slug when there is no date yet', () => {
		expect(deriveSlug('picantearla-2026-08', '')).toBe('picantearla-2026-08');
	});
	it('slugifies titles', () => {
		expect(slugify('¡Córdoba! Taller de Ecofetichismo')).toBe('cordoba-taller-de-ecofetichismo');
		expect(slugify('Someter: cómo dominar eróticamente un cuerpo')).toBe(
			'someter-como-dominar-eroticamente-un-cuerpo'
		);
	});
	it('validates slugs', () => {
		expect(validateSlug('picantearla-2026-10')).toBe(null);
		expect(validateSlug('')).toMatch(/Falta/);
		expect(validateSlug('Picantearla')).toMatch(/minúsculas/);
		expect(validateSlug('pican tearla')).toMatch(/minúsculas/);
		expect(validateSlug('-picantearla')).toMatch(/minúsculas/);
		expect(validateSlug('córdoba')).toMatch(/minúsculas/);
		expect(validateSlug('../etc')).toMatch(/minúsculas/);
		expect(validateSlug('picantearla-2026-09', ['picantearla-2026-09'])).toMatch(/Ya existe/);
		expect(validateSlug('picantearla-2026-09', (s) => s === 'picantearla-2026-09')).toMatch(/Ya existe/);
	});
	it('resolves collisions with -2, -3', () => {
		const taken = new Set(['picantearla-2026-09', 'picantearla-2026-09-2']);
		expect(uniqueSlug('picantearla-2026-10', taken)).toBe('picantearla-2026-10');
		expect(uniqueSlug('picantearla-2026-09', taken)).toBe('picantearla-2026-09-3');
	});
});

describe('images', () => {
	it('detects image types by magic bytes', () => {
		expect(detectImageType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe('jpg');
		expect(detectImageType(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe('png');
		const webp = new TextEncoder().encode('RIFF\0\0\0\0WEBPVP8 ');
		expect(detectImageType(webp)).toBe('webp');
		expect(detectImageType(new TextEncoder().encode('<svg xmlns='))).toBe(null);
	});
	it('recognizes numeric featured ids', () => {
		expect(isNumericFeatured(1)).toBe(true);
		expect(isNumericFeatured('2')).toBe(true);
		expect(isNumericFeatured('picantearla-miniatura.webp')).toBe(false);
		expect(isNumericFeatured(undefined)).toBe(false);
	});
});

describe('applyFrontmatterChanges', () => {
	const fm = splitMarkdown(post('picantearla-2026-09')).frontmatter;

	it('keeps comments, order and untouched lines', () => {
		const out = applyFrontmatterChanges(fm, { start: '2026-10-10T20:00-03:00' });
		expect(out).toContain('start: 2026-10-10T20:00-03:00 # [YYYY]-[MM]-[DD]T[hh]:[mm]-03:00');
		expect(out).toContain('status: abierto # abierto | anunciado | agotadas | cancelado');
		expect(out).toContain('# updated_date: 2024-02-30Z-03:00');
		expect(out).toContain('# location_name: Sigue la polilla');
		expect(out).toContain('#force_unpublished: false');
		const keys = Object.keys(parseDocument(out).toJS());
		expect(keys).toEqual(Object.keys(parseDocument(fm).toJS()));
	});
	it('re-activates commented keys in place', () => {
		const out = applyFrontmatterChanges(fm, { location_name: 'El Surco' });
		expect(out).toContain('location_name: El Surco');
		expect(out).not.toContain('Sigue la polilla');
		const lines = out.split('\n');
		expect(lines.findIndex((l) => l.startsWith('location_name:'))).toBeGreaterThan(
			lines.findIndex((l) => l.startsWith('location:'))
		);
	});
	it('comments out cleared keys, including multi-line values', () => {
		const out = applyFrontmatterChanges(fm, { location: '', summary: null });
		expect(out).toContain('#location: Agrelo 3399');
		expect(out).toMatch(/#summary: Espacio cuir[^\n]*\n#\s+Pensado/);
		const data = parseDocument(out).toJS();
		expect(data.location).toBeUndefined();
		expect(data.summary).toBeUndefined();
		expect(data.title).toBe('Picantearla (61ª Edición)');
	});
	it('removes keys with REMOVE', () => {
		const eco = splitMarkdown(post('taller-ecofetichismo-2026-09-cordoba')).frontmatter;
		const out = applyFrontmatterChanges(eco, { updated_date: REMOVE });
		expect(parseDocument(out).toJS().updated_date).toBeUndefined();
		expect(out).toContain('#updated_date:   2025-07-04Z-03:00');
	});
	it('quotes values that need it', () => {
		const out = applyFrontmatterChanges(fm, { title: 'Picantearla: edición #62' });
		expect(parseDocument(out).toJS().title).toBe('Picantearla: edición #62');
	});
	it('keeps inline comments of list items that stay', () => {
		const ps = splitMarkdown(post('punto-fijo-2026-09')).frontmatter;
		const out = applyFrontmatterChanges(ps, {
			tags: ['español', 'KinkyVibe', 'pago', 'Córdoba', 'cuerdas']
		});
		expect(out).toContain('  - KinkyVibe # etiqueta especial #');
		expect(out).toContain('  - pago # pago | gratis | a la gorra #');
		expect(parseDocument(out).toJS().tags).toEqual(['español', 'KinkyVibe', 'pago', 'Córdoba', 'cuerdas']);
	});
});

describe('buildEventMarkdown (duplicating real events)', () => {
	const today = '2026-09-29';

	it('duplicates picantearla with a new date', () => {
		const src = post('picantearla-2026-09');
		const form = formFromSource(src, { today });
		expect(form.startDate).toBe('2026-09-12');
		expect(form.endDate).toBe('2026-09-13');
		expect(form.featuredMode).toBe('keep');
		const md = buildEventMarkdown(src, {
			...form,
			startDate: '2026-10-10',
			endDate: '2026-10-11',
			title: 'Picantearla (62ª Edición)'
		});
		const m = meta(md);
		expect(m.start).toBe('2026-10-10T20:00-03:00');
		expect(m.end).toBe('2026-10-11T01:30-03:00');
		expect(m.published_date).toBe('2026-09-29Z-03:00');
		expect(m.title).toBe('Picantearla (62ª Edición)');
		expect(m.featured).toBe('picantearla-miniatura.webp');
		expect(m.tags).toEqual(meta(src).tags);
		expect(m.authors).toEqual(['KinkyVibe']);
		expect(splitMarkdown(md).body).toBe(splitMarkdown(src).body);
		// Only the changed lines differ (plus the trailing blank line before ---)
		const before = splitMarkdown(src).frontmatter.trimEnd().split('\n');
		const after = splitMarkdown(md).frontmatter.trimEnd().split('\n');
		const changed = after.filter((l) => !before.includes(l));
		expect(changed).toEqual([
			'published_date: 2026-09-29Z-03:00',
			'title: Picantearla (62ª Edición)',
			'start: 2026-10-10T20:00-03:00 # [YYYY]-[MM]-[DD]T[hh]:[mm]-03:00',
			'end: 2026-10-11T01:30-03:00 # [YYYY]-[MM]-[DD]T[hh]:[mm]-03:00'
		]);
	});

	it('removes the active updated_date and keeps a numeric featured', () => {
		const src = post('taller-ecofetichismo-2026-09-cordoba');
		const form = formFromSource(src, { today });
		const md = buildEventMarkdown(src, { ...form, startDate: '2026-11-01', endDate: '2026-11-01' });
		const m = meta(md);
		expect(m.updated_date).toBeUndefined();
		expect(m.featured).toBe(1);
		expect(m.location).toBeUndefined();
		expect(md).toContain('#location: Thames 240');
		expect(m.status).toBe('cancelado');
	});

	it('handles CRLF sources and uploaded images', () => {
		const src = post('amichis-2024-09');
		const form = formFromSource(src, { today });
		const md = buildEventMarkdown(src, {
			...form,
			startDate: '2026-10-17',
			endDate: '2026-10-18',
			featuredMode: 'upload',
			status: 'anunciado'
		});
		expect(md.includes('\r')).toBe(false);
		const m = meta(md);
		expect(m.featured).toBe(1);
		expect(m.status).toBe('anunciado');
		expect(m.start).toBe('2026-10-17T23:59-03:00');
		expect(m.end).toBe('2026-10-18T05:00-03:00');
		expect(m.updated_date).toBeUndefined();
	});

	it('supports events with only a start and drafts', () => {
		const src = post('punto-fijo-2026-09');
		const form = formFromSource(src, { today });
		const md = buildEventMarkdown(src, {
			...form,
			startDate: '2026-10-16',
			hasEnd: false,
			unlisted: true,
			featuredMode: 'none'
		});
		const m = meta(md);
		expect(m.start).toBe('2026-10-16T19:00-03:00');
		expect(m.end).toBeUndefined();
		expect(md).toContain('#end: 2026-09-18T23:00-03:00');
		expect(m.force_unlisted).toBe(true);
		expect(m.featured).toBeUndefined();
		expect(md).toContain('#featured: punto-fijo-miniatura.webp');
	});

	it('publishes a copy of an unlisted draft as listed', () => {
		const src = post('punto-fijo-2026-09').replace('#force_unlisted: false', 'force_unlisted: true');
		const md = buildEventMarkdown(src, { ...formFromSource(src, { today }), startDate: '2026-10-16', endDate: '2026-10-16' });
		expect(meta(md).force_unlisted).toBeUndefined();
	});

	it('rejects impossible schedules', () => {
		const src = post('aberraciones-2024-03');
		const form = formFromSource(src, { today });
		expect(() => buildEventMarkdown(src, { ...form, startDate: '2026-10-10', endDate: '2026-10-10' })).toThrow(
			/terminar/
		);
		const md = buildEventMarkdown(src, { ...form, startDate: '2026-10-10', endDate: '2026-10-11' });
		expect(meta(md).end).toBe('2026-10-11T01:00-03:00');
	});

	it("creates an event from the owner's _event_template.md", () => {
		const tpl = post('_event_template');
		const form = formFromSource(tpl, { today, fromTemplate: true });
		const md = buildEventMarkdown(tpl, {
			...form,
			title: 'Charla nueva',
			startDate: '2026-10-21',
			endDate: '2026-10-21',
			startTime: '19:00',
			endTime: '21:00',
			location: 'Boedo 830, Ciudad Autónoma de Buenos Aires'
		});
		const m = meta(md);
		expect(m).toMatchObject({
			published_date: '2026-09-29Z-03:00',
			title: 'Charla nueva',
			status: 'abierto',
			start: '2026-10-21T19:00-03:00',
			end: '2026-10-21T21:00-03:00',
			location: 'Boedo 830, Ciudad Autónoma de Buenos Aires',
			link_text: 'Inscribirme'
		});
		expect(m.link).toBeUndefined();
		expect(m.summary).toBeUndefined();
		expect(md).toContain('#location_name: Cooperativa Cultural Qi');
		expect(md).toContain('#updated_date:   2025-07-04Z-03:00');
	});

	it('creates an event from the template', () => {
		const form = formFromSource(NEW_EVENT_TEMPLATE, { today, fromTemplate: true });
		expect(form.title).toBe('');
		const md = buildEventMarkdown(NEW_EVENT_TEMPLATE, {
			...form,
			title: 'Taller de prueba',
			summary: 'Un taller',
			startDate: '2026-10-20',
			endDate: '2026-10-20',
			startTime: '19:00',
			endTime: '22:00',
			location: 'Boedo 830, Ciudad Autónoma de Buenos Aires',
			link: 'https://forms.gle/abc',
			tags: 'español, KinkyVibe, pago, AMBA, taller',
			featuredMode: 'upload'
		});
		const m = meta(md);
		expect(m).toMatchObject({
			published_date: '2026-09-29Z-03:00',
			title: 'Taller de prueba',
			summary: 'Un taller',
			layout: 'calendario',
			category: 'calendario',
			status: 'anunciado',
			start: '2026-10-20T19:00-03:00',
			end: '2026-10-20T22:00-03:00',
			location: 'Boedo 830, Ciudad Autónoma de Buenos Aires',
			link: 'https://forms.gle/abc',
			link_text: 'Inscribirme',
			featured: 1,
			tags: ['español', 'KinkyVibe', 'pago', 'AMBA', 'taller'],
			authors: ['KinkyVibe']
		});
		expect(m.location_name).toBeUndefined();
		expect(md).toContain('  - KinkyVibe # etiqueta especial #');
		expect(md).toContain("# !!  IMPORTANTE LA 'T' Y EL -03:00  !!");
	});
});
