import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { parseDocument } from 'yaml';
import {
	normalizeText,
	eventTagGroups,
	splitEventTags,
	joinEventTags,
	validateEventTags,
	withEventTagDefaults,
	buildTagOptions,
	searchTagOptions,
	exactTagOption,
	excludedFromPicker,
	cleanNewTag
} from './adminTags.js';

describe('eventTagGroups (from the real tag tree)', () => {
	const g = eventTagGroups();
	it('spoken languages exclude LSA, default español', () => {
		expect(g.languages).toEqual(['español', 'inglés']);
		expect(g.signLanguage).toBe('LSA');
		expect(g.defaultLanguage).toBe('español');
	});
	it('places are the leaves of "lugar"', () => {
		expect(g.places).toContain('Online');
		expect(g.places).toContain('AMBA');
		expect(g.places).toContain('Córdoba');
		expect(g.places).toContain('Montevideo');
		expect(g.places).not.toContain('Presencial');
		expect(g.places).not.toContain('Argentina');
		expect(g.places).not.toContain('Uruguay');
	});
	it('prices', () => {
		expect(g.prices).toEqual(['pago', 'a la gorra', 'gratis']);
	});
});

describe('splitEventTags / joinEventTags', () => {
	it('splits a typical event and joins it back in the same order', () => {
		const tags = ['español', 'KinkyVibe', 'pago', 'Córdoba', 'taller'];
		const s = splitEventTags(tags);
		expect(s).toMatchObject({
			kinkyvibe: true,
			language: 'español',
			sign: false,
			place: 'Córdoba',
			prices: ['pago'],
			rest: ['taller']
		});
		expect(joinEventTags(s)).toEqual(tags);
	});
	it('resolves aliases and keeps the rest as written', () => {
		const s = splitEventTags(['espanol', 'kinkyvibe', 'online', 'bdsm', 'queer', 'bdsm']);
		expect(s.language).toBe('español');
		expect(s.kinkyvibe).toBe(true);
		expect(s.place).toBe('Online');
		expect(s.rest).toEqual(['bdsm', 'queer']);
	});
	it('LSA is an extra, not a language', () => {
		const s = splitEventTags(['LSA', 'español', 'AMBA']);
		expect(s.sign).toBe(true);
		expect(s.languages).toEqual(['español']);
		expect(joinEventTags(s)).toEqual(['español', 'LSA', 'AMBA']);
	});
	it('join drops rule tags smuggled into the rest and duplicates', () => {
		expect(
			joinEventTags({
				kinkyvibe: false,
				language: 'inglés',
				place: 'AMBA',
				prices: ['gratis', 'pago'],
				rest: ['taller', 'Online', 'KinkyVibe', 'taller', 'BDSM', 'bdsm']
			})
		).toEqual(['inglés', 'pago', 'gratis', 'AMBA', 'taller', 'BDSM']);
	});
});

describe('validateEventTags', () => {
	it('accepts a correct event', () => {
		expect(validateEventTags(['español', 'KinkyVibe', 'pago', 'AMBA'])).toEqual([]);
		expect(validateEventTags(['español', 'LSA', 'Online', 'gratis', 'pago'])).toEqual([]);
	});
	it('needs exactly one language', () => {
		expect(validateEventTags(['AMBA'])[0]).toMatch(/Falta el idioma/);
		expect(validateEventTags(['LSA', 'AMBA'])[0]).toMatch(/Falta el idioma/);
		expect(validateEventTags(['español', 'inglés', 'AMBA'])[0]).toMatch(/un solo idioma/);
	});
	it('needs exactly one place', () => {
		expect(validateEventTags(['español'])[0]).toMatch(/Falta dónde/);
		expect(validateEventTags(['español', 'AMBA', 'Online'])[0]).toMatch(/un solo lugar/);
		// intermediate nodes are not places
		expect(validateEventTags(['español', 'Argentina'])[0]).toMatch(/Falta dónde/);
	});
	it('every recent event in the repo passes (2025 on)', () => {
		const dir = new URL('../posts/calendario/', import.meta.url);
		const bad = [];
		let checked = 0;
		for (const f of readdirSync(dir)) {
			if (!f.endsWith('.md') || f.startsWith('_')) continue;
			const raw = readFileSync(new URL(f, dir), 'utf8').replace(/\r/g, '');
			const m = raw.match(/^---\n([\s\S]*?)\n---/);
			if (!m) continue;
			const doc = parseDocument(m[1]);
			if (doc.errors.length) continue;
			const meta = doc.toJS() ?? {};
			if (String(meta.start ?? '') < '2025') continue;
			checked++;
			const errors = validateEventTags(meta.tags ?? []);
			if (errors.length) bad.push(`${f}: ${errors.join(' ')}`);
		}
		expect(checked).toBeGreaterThan(100);
		expect(bad).toEqual([]);
	});
});

describe('withEventTagDefaults', () => {
	it('adds español when there is no language', () => {
		expect(withEventTagDefaults(['AMBA', 'taller'])).toEqual(['español', 'AMBA', 'taller']);
	});
	it('replaces the place with a hint', () => {
		expect(withEventTagDefaults(['español', 'pago', 'AMBA'], { place: 'online' })).toEqual([
			'español',
			'pago',
			'Online'
		]);
	});
	it('leaves correct lists untouched (same array content, same order)', () => {
		const tags = ['español', 'BDSM', 'KinkyVibe', 'AMBA'];
		expect(withEventTagDefaults(tags)).toEqual(tags);
	});
});

describe('picker options', () => {
	const usage = { inicial: 98, bdsm: 45, BDSM: 167, queer: 76, taller: 191, AMBA: 270 };
	const options = buildTagOptions({ category: 'calendario', usage });
	const ids = options.map((o) => o.id);
	it('events: no rule groups, no other categories, no structural nodes', () => {
		for (const t of ['español', 'AMBA', 'Online', 'pago', 'KinkyVibe', 'LSA'])
			expect(ids).not.toContain(t);
		for (const t of ['web', 'guía', 'emprendimiento', 'tipo de evento', 'calendario', 'root'])
			expect(ids).not.toContain(t);
		expect(ids).toContain('taller');
		expect(ids).toContain('shibari');
	});
	it('counts aliases towards the canonical tag and includes used tags outside the tree', () => {
		expect(options.find((o) => o.id === 'BDSM')?.count).toBe(212);
		expect(options.find((o) => o.id === 'cuir')?.count).toBe(76);
		const inicial = options.find((o) => o.id === 'inicial');
		expect(inicial).toMatchObject({ inTree: false, count: 98 });
	});
	it('material keeps its own tags and the place tags', () => {
		const m = buildTagOptions({ category: 'material' }).map((o) => o.id);
		expect(m).toContain('guía');
		expect(m).toContain('web');
		expect(m).toContain('español');
		expect(m).not.toContain('taller');
		expect(excludedFromPicker('material').has('tipo de material')).toBe(true);
	});
	it('search: accents, prefixes, aliases', () => {
		expect(searchTagOptions(options, 'practic')[0].id).toBe('prácticas');
		const bondage = searchTagOptions(options, 'rope bunny')[0];
		expect(bondage.id).toBe('bottom de cuerdas');
		expect(bondage.matched).toBe('rope bunny');
		expect(searchTagOptions(options, 'queer')[0].id).toBe('cuir');
		expect(searchTagOptions(options, 'nalg').map((o) => o.id)).toContain('nalgueadas');
	});
	it('search: skips selected tags (also by alias) and empty query lists used tags', () => {
		expect(
			searchTagOptions(options, 'bdsm', { selected: ['bdsm'] }).map((o) => o.id)
		).not.toContain('BDSM');
		const popular = searchTagOptions(options, '', { limit: 3 }).map((o) => o.id);
		expect(popular).toContain('taller');
	});
	it('exact matches and new tags', () => {
		expect(exactTagOption(options, 'Shibari')?.id).toBe('shibari');
		expect(exactTagOption(options, 'kinbaku')?.id).toBe('shibari');
		expect(exactTagOption(options, 'algo nuevo')).toBeUndefined();
		expect(cleanNewTag('  juegos,  de #mesa ')).toBe('juegos de mesa');
		expect(cleanNewTag('   ')).toBe('');
		expect(cleanNewTag('x'.repeat(41))).toBe('');
	});
	it('normalizeText', () => {
		expect(normalizeText(' Córdoba  Capital ')).toBe('cordoba capital');
	});
});
