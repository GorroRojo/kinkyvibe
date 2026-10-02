/**
 * Personas en una sola lista (./personasList.js) y la sección «Personas» de los formularios
 * (./personasPicker.js): ida y vuelta entre los campos de los .md (`authors:` + `personas:`) y la
 * lista única, y que guardar desde el formulario escribe en los .md exactamente lo de siempre
 * (también con TODOS los posts reales del repo, que ya son públicos). Datos inventados.
 */
import { describe, expect, it } from 'vitest';
import { parseDocument } from 'yaml';
import { REMOVE, applyFrontmatterChanges, splitMarkdown } from './eventDraft.js';
import { mergeRoles } from './personas.js';
import {
	authorRoleOf,
	personaItemsProblems,
	personasForData,
	personasFromData,
	personasFromMd,
	personasToMd,
	reshapePersonas,
	validatePersonaItems
} from './personasList.js';
import {
	formPersonas,
	formPersonasChanges,
	personaOptions,
	personaView,
	restorePeople,
	slugOfHref
} from './personasPicker.js';

/** @param {any} v @returns {string[]} */
const list = (v) => (Array.isArray(v) ? v.map(String) : v ? [String(v)] : []);

const PERSONAS = [
	{ perfil: 'colectivo-de-prueba', rol: 'Facilita' },
	{ nombre: 'Persona Sin Perfil', rol: 'Fotografía' },
	{ perfil: 'persona-de-prueba', rol: 'Organiza' }
];

describe('md ⇄ lista única', () => {
	it('authors primero (con el rol de autores de la categoría), después personas, en orden', () => {
		const items = personasFromMd(['KinkyVibe', 'Persona Inventada'], PERSONAS, 'calendario');
		expect(items).toEqual([
			{ name: 'KinkyVibe', role: 'Organiza' },
			{ name: 'Persona Inventada', role: 'Organiza' },
			{ profile: 'colectivo-de-prueba', role: 'Facilita' },
			{ name: 'Persona Sin Perfil', role: 'Fotografía' },
			{ profile: 'persona-de-prueba', role: 'Organiza' }
		]);
		expect(authorRoleOf('calendario')).toBe('Organiza');
		expect(authorRoleOf('material')).toBe('Autore');
		expect(authorRoleOf('wiki')).toBe('Autore');
	});

	it('ida y vuelta: los mismos authors y personas (un perfil con Organiza sigue en personas)', () => {
		for (const category of ['calendario', 'material']) {
			const authors = ['Persona Inventada', 'Otra Persona'];
			expect(personasToMd(personasFromMd(authors, PERSONAS, category), category)).toEqual({
				authors,
				personas: PERSONAS
			});
		}
	});

	it('de la lista a los .md: nombres con el rol de autores → authors; el resto → personas', () => {
		const items = [
			{ name: 'Facilitadore Libre', role: 'Facilita' },
			{ name: 'KinkyVibe', role: 'Organiza' },
			{ profile: 'colectivo-de-prueba', role: 'Organiza' },
			{ name: 'Autore En Un Evento', role: 'Autore' }
		];
		expect(personasToMd(items, 'calendario')).toEqual({
			authors: ['KinkyVibe'],
			personas: [
				{ nombre: 'Facilitadore Libre', rol: 'Facilita' },
				{ perfil: 'colectivo-de-prueba', rol: 'Organiza' },
				{ nombre: 'Autore En Un Evento', rol: 'Autore' }
			]
		});
		expect(personasToMd(items, 'material').authors).toEqual(['Autore En Un Evento']);
	});

	it('una fila del formulario con nombre y perfil: con el rol de autores, su nombre; si no, su perfil', () => {
		const both = { name: 'Gorro_Rojo', profile: 'gorro-rojo' };
		expect(personasToMd([{ ...both, role: 'Organiza' }], 'calendario')).toEqual({
			authors: ['Gorro_Rojo'],
			personas: []
		});
		expect(personasToMd([{ ...both, role: 'Facilita' }], 'calendario')).toEqual({
			authors: [],
			personas: [{ perfil: 'gorro-rojo', rol: 'Facilita' }]
		});
	});

	it('lo que no es un objeto en personas no entra', () => {
		expect(personasFromMd([], ['suelto', null, { perfil: 'x' }], 'material')).toEqual([
			{ profile: 'x', role: '' }
		]);
		expect(personasFromMd([], 'no es lista', 'material')).toEqual([]);
	});
});

describe('la base: la lista única y la forma de antes', () => {
	it('para guardar: textos limpios, sin filas vacías (con aviso)', () => {
		const r = personasForData(
			['KinkyVibe'],
			[
				{ perfil: ' colectivo-de-prueba ', rol: ' Facilita ' },
				{ perfil: '', rol: 'Facilita' },
				{ nombre: 'Persona Sin Perfil', rol: '' }
			],
			'calendario'
		);
		expect(r.items).toEqual([
			{ name: 'KinkyVibe', role: 'Organiza' },
			{ profile: 'colectivo-de-prueba', role: 'Facilita' }
		]);
		expect(r.warnings).toEqual([
			'personas, fila 2: sin perfil, nombre o rol (no se guarda)',
			'personas, fila 3: sin perfil, nombre o rol (no se guarda)'
		]);
		expect(personaItemsProblems(r.items)).toEqual([]);
	});

	it('lee las dos formas: `personas` (nueva) y `authors` + `extra.personas` (de antes)', () => {
		const nueva = {
			personas: [
				{ name: 'KinkyVibe', role: 'Organiza' },
				{ profile: 'colectivo-de-prueba', role: 'Facilita' }
			]
		};
		const vieja = {
			authors: ['KinkyVibe'],
			extra: { personas: [{ perfil: 'colectivo-de-prueba', rol: 'Facilita' }] }
		};
		expect(personasFromData(vieja, 'calendario')).toEqual(nueva.personas);
		expect(personasFromData(nueva, 'calendario')).toEqual(nueva.personas);
		expect(personasFromData({}, 'calendario')).toEqual([]);
		expect(personasFromData(null, 'calendario')).toEqual([]);
	});

	it('para comparar con lo que daría importar: la forma de antes pasa a la lista única', () => {
		const vieja = {
			summary: 'Inventado',
			authors: ['KinkyVibe'],
			extra: { tickets: [], personas: [{ perfil: 'colectivo-de-prueba', rol: 'Facilita' }] }
		};
		expect(reshapePersonas(vieja, 'calendario')).toEqual({
			summary: 'Inventado',
			extra: { tickets: [] },
			personas: [
				{ name: 'KinkyVibe', role: 'Organiza' },
				{ profile: 'colectivo-de-prueba', role: 'Facilita' }
			]
		});
		expect(reshapePersonas({ authors: ['A'], extra: { personas: [] } }, 'material')).toEqual({
			personas: [{ name: 'A', role: 'Autore' }]
		});
		const nueva = { personas: [{ name: 'A', role: 'Autore' }] };
		expect(reshapePersonas(nueva, 'material')).toEqual(nueva);
		expect(reshapePersonas(null, 'material')).toEqual({});
	});

	it('el chequeo del tipo: forma, uno solo entre perfil y nombre, y el tope', () => {
		expect(personaItemsProblems(undefined)).toEqual([]);
		expect(personaItemsProblems('x')).toEqual(['Personas: tiene que ser una lista']);
		expect(
			personaItemsProblems([
				{ name: 'A', role: 'Organiza' },
				{ name: 'B', profile: 'b', role: 'Facilita' },
				{ role: 'Facilita' },
				{ name: '  ', role: 'Facilita' },
				{ name: 'C', role: '' },
				{ name: 'D', role: 'Facilita', otra: 1 },
				'suelto'
			])
		).toEqual([
			'Personas, fila 2: tiene que tener un perfil o un nombre (uno solo)',
			'Personas, fila 3: tiene que tener un perfil o un nombre (uno solo)',
			'Personas, fila 4: el perfil o el nombre está vacío o es muy largo',
			'Personas, fila 5: falta el rol',
			'Personas, fila 6: no conoce otra',
			'Personas, fila 7: tiene que ser { profile o name, role }'
		]);
		const many = Array.from({ length: 61 }, (_, i) => ({ name: `P${i}`, role: 'Organiza' }));
		expect(personaItemsProblems(many)).toEqual(['Personas: hasta 60']);
	});
});

describe('validar el formulario (voseo)', () => {
	const roles = mergeRoles(['Cuida la puerta']);
	it('cada fila con un perfil o un nombre, un rol de la lista y sin repetir', () => {
		expect(
			validatePersonaItems(
				[
					{ name: 'KinkyVibe', role: 'Organiza' },
					{ name: '  ', role: 'Organiza' },
					{ profile: 'colectivo-de-prueba', role: 'Inventado' },
					{ name: 'kinkyvibe', role: 'Organiza' },
					{ name: 'KinkyVibe', role: 'Cuida la puerta' },
					{ profile: 'colectivo-de-prueba', role: '' },
					{ name: 'x'.repeat(101), role: 'Facilita' }
				],
				roles
			)
		).toEqual([
			'Personas, fila 2: elegí un perfil o escribí un nombre.',
			'Personas, fila 3: «Inventado» no es un rol de la lista.',
			'Personas, fila 4: esa persona ya tiene el rol Organiza.',
			'Personas, fila 6: elegí un rol.',
			'Personas, fila 7: el nombre es muy largo (hasta 100 letras).'
		]);
		expect(validatePersonaItems([], roles)).toEqual([]);
		const many = Array.from({ length: 31 }, (_, i) => ({ name: `P${i}`, role: 'Organiza' }));
		expect(validatePersonaItems(many, roles)[0]).toBe('Personas: hasta 30 por publicación.');
	});
});

describe('el formulario', () => {
	const profiles = [
		{ slug: 'Gorro_Rojo', title: 'Gorro Rojo', thumb: '/gorro.webp' },
		{ slug: 'KinkyVibe', title: 'KinkyVibe' }
	];
	const dbProfiles = /** @type {const} */ ([
		{ slug: 'gorro-rojo', title: 'Gorro Rojo', kind: 'persona', href: '/amigues/Gorro_Rojo' },
		{
			slug: 'colectivo-de-prueba',
			title: 'Colectivo de Prueba',
			kind: 'proyecto',
			href: '/amigues/colectivo-de-prueba'
		}
	]);

	it('el buscador: una sugerencia por persona (ficha + perfil importado juntos)', () => {
		const opts = personaOptions(profiles, [...dbProfiles], { 'Persona Inventada': 3 });
		expect(opts.find((o) => o.name === 'Gorro_Rojo')).toMatchObject({ profile: 'gorro-rojo' });
		expect(opts.find((o) => o.profile === 'colectivo-de-prueba')).toMatchObject({
			label: 'Colectivo de Prueba',
			hasProfile: true
		});
		expect(opts.find((o) => o.profile === 'colectivo-de-prueba')?.name).toBeUndefined();
		expect(opts.find((o) => o.name === 'Persona Inventada')).toMatchObject({ count: 3 });
		expect(opts.filter((o) => o.profile === 'gorro-rojo')).toHaveLength(1);
		expect(slugOfHref('/amigues/Gorro_Rojo')).toBe('Gorro_Rojo');
		expect(slugOfHref('/otra/cosa')).toBe('');
	});

	it('al abrir: los nombres de authors traen su perfil (para cambiarles el rol); sin el interruptor, solo authors', () => {
		const options = personaOptions(profiles, [...dbProfiles]);
		const items = formPersonas(['Gorro_Rojo', 'Sin Perfil'], PERSONAS, 'calendario', {
			withPersonas: true,
			options
		});
		expect(items.slice(0, 2)).toEqual([
			{ name: 'Gorro_Rojo', role: 'Organiza', profile: 'gorro-rojo' },
			{ name: 'Sin Perfil', role: 'Organiza' }
		]);
		expect(items).toHaveLength(5);
		expect(formPersonas(['Gorro_Rojo'], PERSONAS, 'calendario', { options })).toHaveLength(1);
		// Con otro rol, Gorro_Rojo se guarda con su perfil.
		const changed = items.map((it, i) => (i === 0 ? { ...it, role: 'Facilita' } : it));
		expect(personasToMd(changed, 'calendario').personas[0]).toEqual({
			perfil: 'gorro-rojo',
			rol: 'Facilita'
		});
	});

	it('cómo se ve cada fila', () => {
		const bySlug = new Map(dbProfiles.map((p) => [p.slug, p]));
		expect(
			personaView({ name: 'Gorro_Rojo', role: 'Organiza' }, 'calendario', profiles, bySlug)
		).toMatchObject({
			label: 'Gorro_Rojo',
			thumb: '/gorro.webp',
			linked: true
		});
		expect(
			personaView(
				{ profile: 'colectivo-de-prueba', role: 'Facilita' },
				'calendario',
				profiles,
				bySlug
			)
		).toMatchObject({ label: 'Colectivo de Prueba', linked: true });
		expect(
			personaView({ profile: 'oculto', role: 'Facilita' }, 'calendario', profiles, bySlug)
		).toMatchObject({
			label: 'oculto (no público)',
			linked: false
		});
		expect(
			personaView({ name: 'Libre', role: 'Facilita' }, 'calendario', profiles, bySlug)
		).toMatchObject({
			label: 'Libre',
			linked: false
		});
	});

	it('guardar sin tocar las personas no cambia nada', () => {
		const items = formPersonas(['A', 'B'], PERSONAS, 'calendario', { withPersonas: true });
		expect(
			formPersonasChanges(items, structuredClone(items), 'calendario', {
				withPersonas: true,
				remove: REMOVE
			})
		).toEqual({});
	});

	it('sumar, sacar y cambiar escriben lo mismo que «Organizan» y la vieja sección «Personas»', () => {
		const initial = formPersonas(['A', 'B'], PERSONAS, 'calendario', { withPersonas: true });
		const opts = { withPersonas: true, remove: REMOVE };
		// Sumar a alguien que organiza: solo cambia authors.
		expect(
			formPersonasChanges(
				initial,
				[...initial, { name: 'C', role: 'Organiza' }],
				'calendario',
				opts
			)
		).toEqual({ authors: ['A', 'B', 'C'] });
		// Sumar un perfil con otro rol: solo cambia personas.
		expect(
			formPersonasChanges(
				initial,
				[...initial, { profile: 'nuevo', role: 'Enseña' }],
				'calendario',
				opts
			)
		).toEqual({ personas: [...PERSONAS, { perfil: 'nuevo', rol: 'Enseña' }] });
		// Sacar a todes les de otro rol: se borra la clave; sacar a todes les que organizan: authors: [].
		expect(formPersonasChanges(initial, initial.slice(0, 2), 'calendario', opts)).toEqual({
			personas: REMOVE
		});
		expect(formPersonasChanges(initial, initial.slice(2), 'calendario', opts)).toEqual({
			authors: []
		});
		// Material, como su editor: sin autores, se borra la clave.
		const mat = formPersonas(['A'], [], 'material');
		expect(
			formPersonasChanges(mat, [], 'material', { remove: REMOVE, emptyAuthors: 'remove' })
		).toEqual({ authors: REMOVE });
		// Sin el interruptor, personas nunca se escribe.
		expect(
			formPersonasChanges(initial, [], 'calendario', { remove: REMOVE }).personas
		).toBeUndefined();
	});

	it('recupera borradores nuevos (people) y de antes (authors)', () => {
		const current = [
			{ name: 'Viejo', role: 'Organiza' },
			{ profile: 'colectivo-de-prueba', role: 'Facilita' }
		];
		expect(
			restorePeople({ people: [{ name: 'X', role: 'Organiza' }, 'roto'] }, current, 'Organiza')
		).toEqual([{ name: 'X', role: 'Organiza' }]);
		expect(restorePeople({ authors: ['Nuevo'] }, current, 'Organiza')).toEqual([
			{ name: 'Nuevo', role: 'Organiza' },
			{ profile: 'colectivo-de-prueba', role: 'Facilita' }
		]);
		expect(restorePeople({}, current, 'Organiza')).toBe(current);
	});
});

/*
 * Los .md reales: leerlos con el formulario y guardar sin tocar las personas da el mismo texto, y
 * sumar a alguien escribe exactamente lo que escribía «Organizan» (`authors:` con une más).
 */
describe('todos los posts reales del repo', () => {
	const raws = /** @type {Record<string, string>} */ (
		import.meta.glob(
			[
				'/src/lib/posts/calendario/*.md',
				'/src/lib/posts/material/*.md',
				'/src/lib/posts/wiki/*.md'
			],
			{ query: '?raw', import: 'default', eager: true }
		)
	);
	const posts = Object.entries(raws)
		.filter(([path]) => !path.split('/').at(-1)?.startsWith('_'))
		.flatMap(([path, raw]) => {
			const category = path.split('/').at(-2) ?? '';
			try {
				const { frontmatter } = splitMarkdown(raw);
				const doc = parseDocument(frontmatter);
				if (doc.errors.length) return []; // el editor los edita como texto
				const meta = doc.toJS() ?? {};
				return [{ path, category, frontmatter, meta }];
			} catch {
				return []; // los que no se pueden leer se editan como texto (y los revisa content.test.js)
			}
		});

	it('hay posts para revisar', () => {
		expect(posts.length).toBeGreaterThan(100);
	});

	it('ida y vuelta sin cambios: los mismos authors y personas, el mismo texto', () => {
		for (const p of posts) {
			const authors = list(p.meta.authors);
			const items = formPersonas(authors, p.meta.personas, p.category, { withPersonas: true });
			const md = personasToMd(items, p.category);
			expect(md.authors, p.path).toEqual(authors);
			const changes = formPersonasChanges(items, structuredClone(items), p.category, {
				withPersonas: true,
				remove: REMOVE
			});
			expect(changes, p.path).toEqual({});
			// El editor siempre arma el archivo con applyFrontmatterChanges (y lo compara con lo
			// mismo sin cambios): sin cambios de personas, lo que arma es lo de antes.
			expect(applyFrontmatterChanges(p.frontmatter, changes), p.path).toBe(
				applyFrontmatterChanges(p.frontmatter, {})
			);
		}
	});

	it('sumar a alguien escribe lo mismo que el viejo «Organizan» / «Autores»', () => {
		for (const p of posts) {
			const authors = list(p.meta.authors);
			const items = formPersonas(authors, p.meta.personas, p.category, { withPersonas: true });
			const added = [...items, { name: 'Persona Inventada', role: authorRoleOf(p.category) }];
			const now = applyFrontmatterChanges(
				p.frontmatter,
				formPersonasChanges(items, added, p.category, { withPersonas: true, remove: REMOVE })
			);
			const before = applyFrontmatterChanges(p.frontmatter, {
				authors: [...authors, 'Persona Inventada']
			});
			expect(now, p.path).toBe(before);
		}
	});
});
