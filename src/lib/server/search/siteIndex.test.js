/**
 * El índice de la búsqueda global armado con datos inventados: las etiquetas del archivo y de la
 * base (alias como `aka` o como `{ id, aliasOf }`), las series, las fichas .md o los perfiles de la
 * base (interruptor `perfiles_publicos`), y lo que nunca entra: lo oculto, lo no listado, los
 * lugares, las direcciones y el contacto.
 */
import { describe, expect, it } from 'vitest';
import tagsFactory from '$lib/utils/tags.js';
import { prepareIndex, search } from '$lib/utils/search.js';
import { buildSearchIndex, indexableProfile, plainBody, tagAliases } from './siteIndex.js';

/** Un árbol chico con una serie y sus series hijas, como lo da el archivo (alias con `aka`). */
function fileTags() {
	return tagsFactory(
		/** @type {any} */ ([
			{ id: 'root', children: ['calendario', 'prácticas'] },
			{ id: 'calendario', children: ['evento recurrente'] },
			{ id: 'evento recurrente', children: ['Serie Inventada'] },
			{
				id: 'Serie Inventada',
				icon: '🔥',
				children: ['Serie Inventada: Lujo', 'Serie Inventada: Formal']
			},
			{ id: 'Serie Inventada: Lujo', icon: '💎' },
			{ id: 'Serie Inventada: Formal', icon: '📝', description: 'La edición formal.' },
			{ id: 'prácticas', children: ['cuidados posteriores'] },
			{
				id: 'cuidados posteriores',
				icon: '🫂',
				description: 'Lo que pasa después de una escena.',
				aka: ['aftercare']
			},
			{ id: 'Rancheadita Kinky', visible_name: 'Rancheadita Kinky', aka: ['ranchada'] }
		])
	);
}

/** El mismo árbol como lo da la base (`recordsToRawTags`): los alias son entradas aparte. */
function dbTags() {
	return tagsFactory(
		/** @type {any} */ ([
			{ id: 'root', children: ['calendario', 'prácticas'] },
			{ id: 'calendario', children: ['evento recurrente'] },
			{ id: 'evento recurrente', children: ['Serie Inventada'] },
			{
				id: 'Serie Inventada',
				icon: '🔥',
				children: ['Serie Inventada: Lujo', 'Serie Inventada: Formal']
			},
			{ id: 'Serie Inventada: Lujo', icon: '💎' },
			{ id: 'Serie Inventada: Formal', icon: '📝', description: 'La edición formal.' },
			{ id: 'prácticas', children: ['cuidados posteriores'] },
			{ id: 'cuidados posteriores', icon: '🫂', description: 'Lo que pasa después de una escena.' },
			{ id: 'Rancheadita Kinky' },
			{ id: 'aftercare', aliasOf: 'cuidados posteriores' },
			{ id: 'ranchada', aliasOf: 'Rancheadita Kinky' }
		])
	);
}

/**
 * @param {string} path
 * @param {Record<string, any>} meta
 */
const post = (path, meta) =>
	/** @type {import('./siteIndex.js').IndexPost} */ (
		/** @type {unknown} */ ({
			path,
			meta: { postID: path.split('/').pop(), tags: [], authors: [], ...meta }
		})
	);

const POSTS = [
	post('/calendario/fiesta-inventada-2031', {
		category: 'calendario',
		title: 'Fiesta Inventada',
		summary: 'Una fiesta de prueba',
		start: '2031-03-01T20:00:00-03:00',
		tags: ['Serie Inventada: Lujo'],
		location: 'Calle Inventada 123',
		location_name: 'Galpón Inventado',
		location_map: 'https://maps.example.invalid/galpon'
	}),
	post('/calendario/evento-oculto', {
		category: 'calendario',
		title: 'Evento Oculto Inventado',
		force_unpublished: true
	}),
	post('/calendario/evento-no-listado', {
		category: 'calendario',
		title: 'Evento No Listado Inventado',
		force_unlisted: true
	}),
	post('/material/nota-inventada', {
		category: 'material',
		title: 'Nota Inventada',
		tags: ['aftercare']
	}),
	post('/amigues/Ficha_Vieja', { category: 'amigues', title: 'Ficha Vieja Inventada' }),
	post('/amigues/Ficha_Sola', { category: 'amigues', title: 'Ficha Sola Inventada' })
];

const WIKI = [
	post('/wiki/cuidados-posteriores', {
		category: 'wiki',
		wiki: 'cuidados posteriores',
		title: 'Cuidados posteriores'
	})
];

/** @type {Record<string, string>} */
const BODIES = {
	'/calendario/fiesta-inventada-2031': 'Vení a **bailar** toda la noche.',
	'/material/nota-inventada': 'Un texto largo sobre cuidados.',
	'/amigues/Ficha_Vieja': 'Texto de la ficha vieja.',
	'/amigues/Ficha_Sola': 'Texto de la ficha sola.',
	'/wiki/cuidados-posteriores': 'Contenido secreto'
};

/**
 * @param {string} slug
 * @param {string} title
 * @param {Record<string, any>} [data]
 * @param {Partial<{ visibility: string, legacySlug: string | null }>} [o]
 */
const profile = (slug, title, data = {}, { visibility = 'public', legacySlug = null } = {}) => ({
	object: { slug, title, visibility, data: { kind: 'persona', ...data } },
	legacySlug
});

const PROFILES = [
	profile(
		'ficha-vieja',
		'Ficha Vieja Inventada',
		{ bio: 'Desde la base' },
		{
			legacySlug: 'Ficha_Vieja'
		}
	),
	profile('persona-nueva', 'Persona Nueva Inventada', {
		bio: 'Hace talleres de prueba',
		tags: ['aftercare'],
		body: 'Mi **texto** de presentación.',
		email: 'contacto@example.invalid',
		tel: '+54 9 11 0000-0000',
		address: 'Pasaje Privado 77'
	}),
	profile('proyecto-nuevo', 'Proyecto Nuevo Inventado', { kind: 'proyecto' }),
	profile('lugar-listado', 'Lugar Listado Inventado', {
		kind: 'lugar',
		address: 'Avenida del Lugar 456',
		area: 'Barrio Inventado',
		venue_privacy: 'public'
	}),
	profile('persona-no-listada', 'Persona No Listada Inventada', { unlisted: true }),
	profile('persona-oculta', 'Persona Oculta Inventada', {}, { visibility: 'hidden' }),
	profile('persona-con-cuenta', 'Persona Solo Con Cuenta', {}, { visibility: 'members' })
];

/**
 * @param {{ tags?: TagManager, profiles?: boolean, series?: boolean }} [o]
 */
function build({ tags = fileTags(), profiles = false, series = true } = {}) {
	return buildSearchIndex({
		posts: POSTS,
		wikiPosts: WIKI,
		tags,
		body: (p) => BODIES[p.path],
		profiles: profiles ? { list: PROFILES, imported: new Set(['Ficha_Vieja']) } : null,
		series
	});
}

/** @param {import('$lib/utils/search').RawSearchIndex} index */
const hrefs = (index) => index.docs.map((d) => d.h);

describe('tagAliases', () => {
	it('da lo mismo con los alias del archivo (aka) y los de la base ({ id, aliasOf })', () => {
		for (const tags of [fileTags(), dbTags()]) {
			const aliases = tagAliases(tags);
			expect(aliases.get('cuidados posteriores')).toEqual(['aftercare']);
			expect(aliases.get('Rancheadita Kinky')).toEqual(['ranchada']);
			expect(aliases.has('aftercare')).toBe(false);
		}
	});
});

describe('buildSearchIndex', () => {
	it('eventos y material listados, sin lo oculto ni lo no listado', async () => {
		const index = await build();
		expect(hrefs(index)).toContain('/calendario/fiesta-inventada-2031');
		expect(hrefs(index)).toContain('/material/nota-inventada');
		const json = JSON.stringify(index);
		expect(json).not.toContain('Evento Oculto');
		expect(json).not.toContain('Evento No Listado');
		const event = index.docs.find((d) => d.h === '/calendario/fiesta-inventada-2031');
		expect(event).toMatchObject({
			c: 'calendario',
			t: 'Fiesta Inventada',
			d: '2031-03-01T23:00:00.000Z',
			b: 'Vení a bailar toda la noche.'
		});
	});

	it('nunca lleva el «Dónde» de un evento', async () => {
		const json = JSON.stringify(await build());
		expect(json).not.toContain('Calle Inventada');
		expect(json).not.toContain('Galpón Inventado');
		expect(json).not.toContain('maps.example.invalid');
	});

	it('los alias de las etiquetas salen igual con el archivo y con la base', async () => {
		for (const tags of [fileTags(), dbTags()]) {
			const index = await build({ tags });
			expect(index.tags['cuidados posteriores']).toEqual(['aftercare']);
			const wiki = index.docs.find((d) => d.h === '/wiki/cuidados-posteriores');
			expect(wiki).toMatchObject({ c: 'wiki', k: ['aftercare'], i: '🫂' });
			// «contenido secreto» no va al índice.
			expect(wiki?.b).toBeUndefined();
			// Una etiqueta sin descripción pero con otros nombres tiene su entrada, con la dirección
			// de las demás páginas de etiquetas (con guiones).
			const tagDoc = index.docs.find((d) => d.t === 'Rancheadita Kinky');
			expect(tagDoc).toMatchObject({ h: '/wiki/Rancheadita-Kinky', k: ['ranchada'] });
			// Buscar por un alias encuentra lo etiquetado y la entrada.
			const found = search(prepareIndex(index), 'aftercare').map((h) => h.doc.h);
			expect(found).toContain('/material/nota-inventada');
			expect(found).toContain('/wiki/cuidados-posteriores');
		}
	});

	it('las series (interruptor prendido), con ícono y aunque no tengan descripción', async () => {
		for (const tags of [fileTags(), dbTags()]) {
			const index = await build({ tags, series: true });
			const lujo = index.docs.find((d) => d.t === 'Serie Inventada: Lujo');
			expect(lujo).toMatchObject({
				c: 'serie',
				h: '/wiki/Serie-Inventada%3A-Lujo',
				i: '💎',
				g: ['Serie Inventada: Lujo']
			});
			expect(index.docs.filter((d) => d.c === 'serie').map((d) => d.t)).toEqual([
				'Serie Inventada',
				'Serie Inventada: Lujo',
				'Serie Inventada: Formal'
			]);
			expect(index.docs.find((d) => d.t === 'Serie Inventada: Formal')?.s).toBe(
				'La edición formal.'
			);
			// Sin acentos ni mayúsculas, y con la palabra a medias.
			const found = search(prepareIndex(index), 'serie inventada luj').map((h) => h.doc.h);
			expect(found[0]).toBe('/wiki/Serie-Inventada%3A-Lujo');
		}
	});

	it('sin el interruptor de series, una serie sin descripción no tiene entrada propia', async () => {
		const index = await build({ series: false });
		expect(index.docs.some((d) => d.c === 'serie')).toBe(false);
		expect(index.docs.some((d) => d.t === 'Serie Inventada: Lujo')).toBe(false);
		// La que tiene descripción sigue como entrada de la Kinkipedia.
		expect(index.docs.find((d) => d.t === 'Serie Inventada: Formal')?.c).toBe('wiki');
	});

	it('perfiles_publicos apagado: las fichas .md, ningún perfil de la base', async () => {
		const index = await build({ profiles: false });
		const amigues = index.docs.filter((d) => d.c === 'amigues');
		expect(amigues.map((d) => d.h)).toEqual(['/amigues/Ficha_Vieja', '/amigues/Ficha_Sola']);
		expect(JSON.stringify(index)).not.toContain('Persona Nueva');
	});

	it('perfiles_publicos prendido: los perfiles de la base y las .md sin importar', async () => {
		const index = await build({ profiles: true });
		const amigues = index.docs.filter((d) => d.c === 'amigues');
		expect(amigues.map((d) => d.h).sort()).toEqual([
			'/amigues/Ficha_Sola',
			'/amigues/Ficha_Vieja',
			'/amigues/persona-nueva',
			'/amigues/proyecto-nuevo'
		]);
		// La importada sale de la base (una sola vez, con lo de la base).
		expect(amigues.find((d) => d.h === '/amigues/Ficha_Vieja')).toMatchObject({
			s: 'Desde la base'
		});
		expect(amigues.find((d) => d.h === '/amigues/persona-nueva')).toMatchObject({
			t: 'Persona Nueva Inventada',
			s: 'Hace talleres de prueba',
			g: ['cuidados posteriores'],
			b: 'Mi texto de presentación.'
		});
	});

	it('nunca: lugares, perfiles no listados, ocultos o solo con cuenta', async () => {
		const json = JSON.stringify(await build({ profiles: true }));
		for (const name of [
			'Lugar Listado',
			'lugar-listado',
			'Persona No Listada',
			'Persona Oculta',
			'Persona Solo Con Cuenta'
		]) {
			expect(json).not.toContain(name);
		}
	});

	it('nunca: direcciones ni contacto de un perfil', async () => {
		const json = JSON.stringify(await build({ profiles: true }));
		for (const secret of [
			'Avenida del Lugar',
			'Barrio Inventado',
			'Pasaje Privado',
			'contacto@example.invalid',
			'0000-0000'
		]) {
			expect(json).not.toContain(secret);
		}
	});
});

describe('indexableProfile', () => {
	it('solo personas y proyectos públicos y listados', () => {
		expect(indexableProfile(profile('a', 'A'))).toBe(true);
		expect(indexableProfile(profile('a', 'A', { kind: 'proyecto' }))).toBe(true);
		expect(indexableProfile(profile('a', 'A', { kind: 'lugar' }))).toBe(false);
		expect(indexableProfile(profile('a', 'A', { unlisted: true }))).toBe(false);
		expect(indexableProfile(profile('a', 'A', {}, { visibility: 'hidden' }))).toBe(false);
		expect(indexableProfile(profile('a', 'A', {}, { visibility: 'members' }))).toBe(false);
	});
});

describe('plainBody', () => {
	it('texto plano recortado; vacío para «contenido secreto»', () => {
		expect(plainBody('# Hola\n\n**mundo**', 'material')).toBe('Hola mundo');
		expect(plainBody('Contenido secreto', 'material')).toBe('');
		expect(plainBody(undefined, 'material')).toBe('');
		expect(plainBody('palabra '.repeat(200), 'calendario').length).toBeLessThanOrEqual(401);
	});
});
