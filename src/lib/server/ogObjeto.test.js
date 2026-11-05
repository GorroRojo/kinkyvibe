/**
 * Lo que va en la vista previa de un objeto sin imagen (src/lib/server/ogObjeto.js): la página y la
 * ruta de la imagen arman lo mismo (así el hash coincide), siempre como lo ve alguien sin cuenta;
 * sin tarjeta propia si tiene imagen o si es un perfil fuera de los buscadores. Las lecturas de la
 * base son de mentira. Datos inventados.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

/** @type {Record<string, any>} */
let posts = {};
/** @type {any} */
let venue = null;
/** @type {any} */
let profile = null;
/** @type {any} */
let wikiEntry = null;
const calls = /** @type {any[]} */ ([]);

vi.mock('$lib/server/db', () => ({ getDB: () => ({}) }));
vi.mock('$lib/server/contenido/posts.js', () => ({
	siteEvent: async (/** @type {any} */ _p, /** @type {string} */ slug, /** @type {any} */ opts) => {
		calls.push(['siteEvent', slug, opts]);
		return posts[`calendario/${slug}`] ?? null;
	},
	siteContent: async (
		/** @type {any} */ _p,
		/** @type {string} */ cat,
		/** @type {string} */ slug,
		/** @type {any} */ opts
	) => {
		calls.push(['siteContent', cat, slug, opts]);
		return posts[`${cat}/${slug}`] ?? null;
	}
}));
vi.mock('$lib/server/amigues/venues.js', () => ({
	eventPageVenue: async (
		/** @type {any} */ _db,
		/** @type {string} */ _slug,
		/** @type {any} */ locals
	) => {
		calls.push(['eventPageVenue', locals]);
		return venue;
	}
}));
vi.mock('$lib/server/amigues/pages.js', () => ({
	findProfileForPage: async (
		/** @type {any} */ _db,
		/** @type {string} */ _slug,
		/** @type {any} */ locals
	) => {
		calls.push(['findProfileForPage', locals]);
		return profile ? { object: {}, legacySlug: null, avatarKey: null } : null;
	}
}));
vi.mock('$lib/server/amigues/asPost.js', () => ({ toPublic: async () => profile }));
const TAGS = new Map([
	['bdsm', { id: 'bdsm', visible_name: 'BDSM' }],
	['guía', { id: 'guía', visible_name: 'guía' }]
]);
vi.mock('$lib/server/etiquetas/source.js', () => ({
	siteTagSource: async () => ({}),
	tagManagerOf: () => ({ get: (/** @type {string} */ id) => TAGS.get(id) })
}));
vi.mock('$lib/server/wiki/site.js', () => ({
	wikiLinkedTags: async (/** @type {any} */ _p, /** @type {string[]} */ ids) =>
		(ids ?? []).filter((t) => TAGS.has(t)),
	siteWikiEntry: async () => ({ entry: wikiEntry, tags: {} }),
	wikiPost: (/** @type {any} */ e) => ({ meta: { title: e.title, summary: e.summary } })
}));

const { cardTagNames, eventCard, materialCard, objectCardSpecFor, profileCard, wikiCard } =
	await import('./ogObjeto.js');
const { objectCardHash } = await import('$lib/utils/ogObjeto.js');

const EVENT_META = {
	title: 'Taller Inventado',
	start: '2026-11-12T21:00-03:00',
	summary: 'Para probar.',
	location_name: 'Galpón de Prueba',
	tags: ['bdsm', 'taller']
};

beforeEach(() => {
	posts = {};
	venue = null;
	profile = null;
	wikiEntry = null;
	calls.length = 0;
});

/** El hash de la dirección de una imagen. @param {{ url: string } | null} image */
const hashOf = (image) => image?.url.split('/').pop()?.slice(0, 16);

describe('la página y la ruta dicen lo mismo', () => {
	it('evento: misma dirección, leído sin cuenta, con los nombres de las etiquetas de la Kinkipedia', async () => {
		posts['calendario/taller-inventado'] = { meta: EVENT_META };
		const page = await eventCard(undefined, 'taller-inventado', {
			meta: EVENT_META,
			venue: null,
			wikiTags: ['bdsm']
		});
		const spec = await objectCardSpecFor(undefined, 'evento', 'taller-inventado');
		expect(spec?.tags).toEqual(['BDSM']);
		expect(hashOf(page)).toBe(await objectCardHash(/** @type {any} */ (spec)));
		expect(page?.url).toMatch(/^\/og\/objeto\/evento\/taller-inventado\/[0-9a-f]{16}\.jpg$/);
		// como alguien sin cuenta: quien mira, anónimo, y sin locals de sesión
		expect(calls).toContainEqual([
			'siteEvent',
			'taller-inventado',
			{ viewer: { role: 'anon' }, html: false }
		]);
		expect(calls).toContainEqual(['eventPageVenue', {}]);
	});

	it('material: misma dirección', async () => {
		const meta = {
			title: 'Guía Inventada',
			tags: ['guía', 'descargable'],
			summary: 'Para probar.'
		};
		posts['material/guia-inventada'] = { meta };
		const page = await materialCard(undefined, 'guia-inventada', { meta, wikiTags: ['guía'] });
		const spec = await objectCardSpecFor(undefined, 'material', 'guia-inventada');
		expect(spec?.label).toBe('Material · Guía descargable');
		expect(hashOf(page)).toBe(await objectCardHash(/** @type {any} */ (spec)));
	});

	it('perfil: misma dirección', async () => {
		profile = { title: 'Perfil Inventado', kind: 'proyecto', bio: 'Una bio.', tags: ['bdsm'] };
		const page = await profileCard(undefined, 'Perfil_Inventado', { profile, wikiTags: ['bdsm'] });
		const spec = await objectCardSpecFor(undefined, 'perfil', 'Perfil_Inventado');
		expect(spec?.label).toBe('Amigues · Proyecto');
		expect(hashOf(page)).toBe(await objectCardHash(/** @type {any} */ (spec)));
		expect(calls).toContainEqual(['findProfileForPage', {}]);
	});

	it('entrada de la Kinkipedia: misma dirección', async () => {
		wikiEntry = { title: 'Término', summary: 'Qué es.', slug: 'Termino' };
		const page = await wikiCard('Termino', { title: 'Término', summary: 'Qué es.' });
		const spec = await objectCardSpecFor(undefined, 'wiki', 'Termino');
		expect(hashOf(page)).toBe(await objectCardHash(/** @type {any} */ (spec)));
	});
});

describe('sin tarjeta propia', () => {
	it('con portada (evento, material) o imagen (perfil): ninguna, ni en la página ni en la ruta', async () => {
		const featured = '/media/img/' + 'a'.repeat(64) + '.webp';
		expect(await eventCard(undefined, 'x', { meta: { ...EVENT_META, featured } })).toBeNull();
		expect(await materialCard(undefined, 'x', { meta: { title: 'X', featured } })).toBeNull();
		expect(
			await profileCard(undefined, 'x', { profile: { title: 'X', image: featured } })
		).toBeNull();
		posts['calendario/x'] = { meta: { ...EVENT_META, featured } };
		expect(await objectCardSpecFor(undefined, 'evento', 'x')).toBeNull();
		profile = { title: 'X', image: featured };
		expect(await objectCardSpecFor(undefined, 'perfil', 'x')).toBeNull();
	});

	it('un perfil que pidió no aparecer en buscadores sigue con la tarjeta del sitio', async () => {
		profile = { title: 'Perfil Inventado', kind: 'persona', noindex: true };
		expect(await profileCard(undefined, 'x', { profile, noindex: true })).toBeNull();
		expect(await profileCard(undefined, 'x', { profile })).toBeNull();
		expect(await objectCardSpecFor(undefined, 'perfil', 'x')).toBeNull();
	});

	it('lo que no se ve sin cuenta (o no existe): ninguna', async () => {
		expect(await objectCardSpecFor(undefined, 'evento', 'oculto')).toBeNull();
		expect(await objectCardSpecFor(undefined, 'material', 'oculto')).toBeNull();
		expect(await objectCardSpecFor(undefined, 'perfil', 'oculto')).toBeNull();
		expect(await objectCardSpecFor(undefined, 'wiki', 'nada')).toBeNull();
	});

	it('un material que redirige a otro sitio: ninguna', async () => {
		posts['material/tienda'] = {
			meta: { title: 'Tienda', redirect: true, link: 'https://x.test' }
		};
		expect(await objectCardSpecFor(undefined, 'material', 'tienda')).toBeNull();
	});
});

describe('cardTagNames', () => {
	it('el nombre que se ve de cada etiqueta, o el id si no está en el árbol', async () => {
		expect(await cardTagNames(undefined, ['bdsm', 'otra'])).toEqual(['BDSM', 'otra']);
		expect(await cardTagNames(undefined, [])).toEqual([]);
	});
});
