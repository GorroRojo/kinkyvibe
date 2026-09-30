import { describe, it, expect } from 'vitest';
import { readdirSync } from 'node:fs';
import {
	profileSlugFor,
	findProfile,
	buildOrganizerOptions,
	searchOrganizers,
	organizerValue
} from './organizers.js';

const profiles = [
	{ slug: 'DemonWeb', title: 'DemonWeb / Mel' },
	{ slug: 'KinkyVibe', title: 'KinkyVibe', thumb: '/kv.png' },
	{ slug: 'MiPiezaAccionGrafica', title: 'Mi Pieza Acción Gráfica' },
	{ slug: 'la.colectiver', title: 'La Colectiver' },
	{ slug: 'Sogashibari', title: 'Soga Shibari' }
];

describe('findProfile', () => {
	it('same lookup as the site: spaces → dashes', () => {
		expect(profileSlugFor('Flor Sandulli')).toBe('Flor-Sandulli');
		expect(findProfile(profiles, 'DemonWeb')?.slug).toBe('DemonWeb');
	});
	it('tolerates case, accents, spaces and dots', () => {
		expect(findProfile(profiles, 'Mi Pieza Acción Gráfica')?.slug).toBe('MiPiezaAccionGrafica');
		expect(findProfile(profiles, 'SogaShibari')?.slug).toBe('Sogashibari');
		expect(findProfile(profiles, 'lacolectiver')?.slug).toBe('la.colectiver');
		expect(findProfile(profiles, 'Mel')).toBeUndefined();
		expect(findProfile(profiles, '')).toBeUndefined();
	});
	it('resolves most organizers of real events to a real profile', () => {
		const slugs = readdirSync(new URL('../posts/amigues/', import.meta.url))
			.filter((f) => f.endsWith('.md') && !f.startsWith('_'))
			.map((f) => ({ slug: f.slice(0, -3), title: f.slice(0, -3) }));
		for (const name of [
			'KinkyVibe',
			'DemonWeb',
			'Sogashibari',
			'SogaShibari',
			'Chivy',
			'la.colectiver'
		])
			expect(findProfile(slugs, name), name).toBeTruthy();
	});
});

describe('organizer options & search', () => {
	const usage = {
		KinkyVibe: 383,
		DemonWeb: 142,
		SogaShibari: 1,
		Lynx: 8,
		'Flor Sandulli': 6,
		'@flor.sandulli': 1,
		Nada: 1
	};
	const options = buildOrganizerOptions(profiles, usage);
	it('merges usage into profiles and keeps names without profile', () => {
		expect(options.find((o) => o.value === 'Sogashibari')?.count).toBe(1);
		expect(options.find((o) => o.value === 'KinkyVibe')).toMatchObject({
			hasProfile: true,
			count: 383,
			thumb: '/kv.png'
		});
		expect(options.find((o) => o.value === 'Lynx')).toMatchObject({
			hasProfile: false,
			detail: 'sin perfil'
		});
	});
	it('folds two spellings of the same name without profile, keeping the most used', () => {
		const flor = options.filter((o) => /flor/i.test(o.value));
		expect(flor).toHaveLength(1);
		expect(flor[0]).toMatchObject({ value: 'Flor Sandulli', count: 7 });
	});
	it('searches by slug and title, profiles first', () => {
		expect(searchOrganizers(options, 'mel')[0].value).toBe('DemonWeb');
		expect(searchOrganizers(options, 'accion')[0].value).toBe('MiPiezaAccionGrafica');
		expect(searchOrganizers(options, 'lyn')[0].value).toBe('Lynx');
		expect(searchOrganizers(options, 'kinky', { selected: ['KinkyVibe'] })).toEqual([]);
	});
	it('empty query: profiles and names used more than once', () => {
		const values = searchOrganizers(options, '', { limit: 20 }).map((o) => o.value);
		expect(values).toContain('DemonWeb');
		expect(values).toContain('Lynx');
		expect(values).not.toContain('Nada');
	});
	it('organizerValue writes the profile slug when there is one', () => {
		expect(organizerValue(profiles, ' soga shibari ')).toBe('Sogashibari');
		expect(organizerValue(profiles, 'Alguien Nuevo')).toBe('Alguien Nuevo');
		expect(organizerValue(profiles, ' , ')).toBe('');
	});
});
