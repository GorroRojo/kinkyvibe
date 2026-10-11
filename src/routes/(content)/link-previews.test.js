/**
 * La vista previa al compartir un link (WhatsApp, Telegram, Instagram, X…) de cada tipo de página
 * pública: el `<head>` que arma el servidor, con las etiquetas Open Graph y de Twitter
 * (SeoHead.svelte, src/lib/utils/seo.js, docs/compartir.md). Las direcciones se comparan con
 * `new URL()` y el HTML se lee con src/lib/testing/html.js (sin expresiones regulares).
 * Datos inventados.
 */
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'svelte/server';
import { writable } from 'svelte/store';
import { metaTags, tagsOf } from '$lib/testing/html.js';
import { venueView } from '$lib/utils/venues.js';

const ORIGIN = 'https://sitio.test';
const pageStore = writable({ url: new URL(ORIGIN + '/'), params: {}, data: {} });
vi.mock('$app/stores', () => ({ page: pageStore }));
vi.mock('$app/navigation', () => ({ goto: vi.fn(), afterNavigate: vi.fn() }));

/** @param {string} path */
function at(path) {
	pageStore.set({ url: new URL(ORIGIN + path), params: {}, data: { wiki: [] } });
}

const BEFORE = new Date('2026-10-01T12:00:00-03:00');
beforeEach(() => {
	vi.useFakeTimers({ toFake: ['Date'] });
	vi.setSystemTime(BEFORE);
});
afterAll(() => {
	vi.useRealTimers();
});

/**
 * Las meta del head, con cada clave una sola vez (si se repite, la prueba falla: WhatsApp toma la
 * primera y se ve cualquier cosa).
 * @param {string} head
 */
function single(head) {
	const all = metaTags(head);
	/** @type {Record<string, string>} */
	const out = {};
	for (const [key, values] of Object.entries(all)) {
		expect(values, `«${key}» repetida`).toHaveLength(1);
		out[key] = values[0];
	}
	return out;
}

/** La canónica del head (una sola). @param {string} head */
function canonical(head) {
	const links = tagsOf(head, 'link').filter((l) => l.rel === 'canonical');
	expect(links).toHaveLength(1);
	return links[0].href;
}

/**
 * Lo que tiene que tener toda vista previa: las direcciones enteras (https y del sitio),
 * `og:url` igual a la canónica, `es_AR` y la tarjeta grande.
 * @param {Record<string, string>} meta
 * @param {string} head
 * @param {string} path el camino canónico esperado
 */
function expectComplete(meta, head, path) {
	const url = new URL(meta['og:url']);
	expect(url.origin).toBe(ORIGIN);
	expect(url.pathname).toBe(path);
	expect(url.search).toBe('');
	expect(new URL(canonical(head)).href).toBe(url.href);
	const image = new URL(meta['og:image']);
	expect(image.protocol).toBe('https:');
	expect(new URL(meta['twitter:image']).href).toBe(image.href);
	expect(meta['og:locale']).toBe('es_AR');
	expect(meta['og:site_name']).toBe('Kinky Vibe');
	expect(meta['twitter:card']).toBe('summary_large_image');
	expect(meta['twitter:site']).toBe('@kinkyvibearg');
	expect(meta['og:title']).toBeTruthy();
	expect(meta['twitter:title']).toBe(meta['og:title']);
	expect(meta['og:description']).toBeTruthy();
	expect(meta['twitter:description']).toBe(meta['og:description']);
	expect(meta.description).toBe(meta['og:description']);
	for (const value of Object.values(meta)) expect(value).not.toContain('undefined');
}

/** @param {Record<string, string>} meta */
function expectDefaultImage(meta) {
	const image = new URL(meta['og:image']);
	expect(image.origin).toBe(ORIGIN);
	expect(image.pathname).toBe('/android-chrome-512x512.png');
	expect(meta['og:image:width']).toBe('512');
	expect(meta['og:image:height']).toBe('512');
	expect(meta['og:image:alt']).toBeTruthy();
}

describe('inicio', () => {
	it('website, con el logo', async () => {
		at('/?tags=algo');
		const { default: Home } = await import('./+page.svelte');
		const { head } = render(Home, { props: { data: /** @type {any} */ ({ posts: [] }) } });
		const meta = single(head);
		expectComplete(meta, head, '/');
		expect(meta['og:type']).toBe('website');
		expect(meta['og:title']).toBe('Kinky Vibe');
		expectDefaultImage(meta);
	});
});

describe('calendario', () => {
	it('website, con una descripción', async () => {
		at('/calendario');
		const { default: Calendario } = await import('./calendario/+page.svelte');
		const { head } = render(Calendario, {
			props: { data: /** @type {any} */ ({ posts: [], ticketStates: null }) }
		});
		const meta = single(head);
		expectComplete(meta, head, '/calendario');
		expect(meta['og:type']).toBe('website');
		expect(meta['og:title']).toBe('Calendario');
		expectDefaultImage(meta);
	});
});

/** Una portada de la biblioteca inventada. */
const COVER = '/media/img/' + 'a'.repeat(64) + '.webp';

/**
 * @param {Record<string, any>} [meta]
 * @param {Record<string, any>} [extra]
 */
async function eventHead(meta = {}, extra = {}) {
	at('/calendario/taller-inventado');
	const { default: Page } = await import('./calendario/[event]/+page.svelte');
	return render(Page, {
		props: {
			data: /** @type {any} */ ({
				meta: {
					title: 'Taller Inventado',
					postID: 'taller-inventado',
					category: 'calendario',
					start: '2026-10-02T15:00:00-03:00',
					end: '2026-10-02T19:00:00-03:00',
					status: 'abierto',
					authors: [],
					tags: [],
					summary: 'Un taller inventado para las pruebas',
					location_name: 'Galpón de Prueba',
					featured: COVER,
					...meta
				},
				cover: { width: 1200, height: 900, alt: 'Cuerdas de prueba sobre una mesa' },
				venue: null,
				tickets: null,
				relatedPosts: [],
				relatedPastCount: 0,
				authorsProfiles: Promise.resolve([]),
				series: null,
				personas: null,
				propinas: false,
				html: '<p>Texto inventado del evento.</p>',
				...extra
			})
		}
	}).head;
}

describe('un evento', () => {
	it('event, con la fecha y el lugar en la descripción y la portada entera con sus medidas', async () => {
		const head = await eventHead();
		const meta = single(head);
		expectComplete(meta, head, '/calendario/taller-inventado');
		expect(meta['og:type']).toBe('event');
		expect(meta['og:title']).toBe('Taller Inventado');
		expect(meta['og:description']).toBe(
			'Viernes 2 de octubre de 2026, 15:00 · Galpón de Prueba · Un taller inventado para las pruebas'
		);
		const image = new URL(meta['og:image']);
		expect(image.origin).toBe(ORIGIN);
		expect(image.pathname).toBe(COVER);
		expect(meta['og:image:width']).toBe('1200');
		expect(meta['og:image:height']).toBe('900');
		expect(meta['og:image:alt']).toBe('Cuerdas de prueba sobre una mesa');
		expect(meta).not.toHaveProperty('robots');
	});

	it('sin portada, el logo; sin texto alternativo, el título', async () => {
		const meta = single(await eventHead({ featured: undefined }, { cover: null }));
		expectDefaultImage(meta);
		const legacy = single(
			await eventHead({ featured: '/_app/immutable/assets/1.x.webp' }, { cover: null })
		);
		expect(new URL(legacy['og:image']).pathname).toBe('/_app/immutable/assets/1.x.webp');
		expect(legacy).not.toHaveProperty('og:image:width');
		expect(legacy['og:image:alt']).toBe('Taller Inventado');
	});

	it('con lugar vinculado, solo lo que deja ver su nivel', async () => {
		const place = {
			title: 'Galpón Escondido',
			data: { address: 'Calle Secreta 99', area: 'Barrio Inventado', city: 'Ciudad de Prueba' }
		};
		const head = await eventHead(
			{ location_name: undefined },
			{ venue: venueView(place, 'area', '/amigues/galpon-escondido') }
		);
		expect(head).not.toContain('Calle Secreta');
		expect(head).not.toContain('Galpón Escondido');
		expect(single(head)['og:description']).toContain('Barrio Inventado, Ciudad de Prueba');
	});

	it('no listado (o borrador): se puede compartir, pero con noindex', async () => {
		const meta = single(await eventHead({ force_unlisted: true }));
		expect(meta.robots).toBe('noindex');
		expect(meta['og:title']).toBe('Taller Inventado');
	});
});

describe('un material', () => {
	it('article, con su resumen', async () => {
		at('/material/guia-inventada');
		const { default: Page } = await import('./material/[post]/+page.svelte');
		const { head } = render(Page, {
			props: {
				data: /** @type {any} */ ({
					meta: {
						title: 'Guía Inventada',
						postID: 'guia-inventada',
						category: 'material',
						authors: [],
						tags: [],
						summary: 'Una guía inventada para las pruebas',
						featured: COVER
					},
					cover: { width: 800, height: 800, alt: 'Tapa de la guía' },
					relatedPosts: [],
					relatedPastCount: 0,
					authorsProfiles: Promise.resolve([]),
					personas: null,
					html: '<p>Texto inventado.</p>'
				})
			}
		});
		const meta = single(head);
		expectComplete(meta, head, '/material/guia-inventada');
		expect(meta['og:type']).toBe('article');
		expect(meta['og:title']).toBe('Guía Inventada');
		expect(meta['og:description']).toBe('Una guía inventada para las pruebas');
		expect(new URL(meta['og:image']).pathname).toBe(COVER);
		expect(meta['og:image:alt']).toBe('Tapa de la guía');
	});
});

/** @param {string} path @param {Record<string, any>} data */
async function wikiHead(path, data) {
	at(path);
	const { default: Page } = await import('./wiki/[term]/+page.svelte');
	return render(Page, {
		props: { data: /** @type {any} */ ({ relatedPosts: [], relatedPastCount: 0, ...data }) }
	}).head;
}

describe('la Kinkipedia', () => {
	it('una entrada: article, con su resumen', async () => {
		const head = await wikiHead('/wiki/termino-inventado', {
			meta: {
				title: 'Término Inventado',
				wiki: 'Término Inventado',
				summary: 'Un término inventado para las pruebas.'
			}
		});
		const meta = single(head);
		expectComplete(meta, head, '/wiki/termino-inventado');
		expect(meta['og:type']).toBe('article');
		expect(meta['og:title']).toBe('Término Inventado');
		expect(meta['og:description']).toBe('Un término inventado para las pruebas.');
		expectDefaultImage(meta);
	});

	it('una etiqueta sin entrada: website, con su nombre y una descripción', async () => {
		const head = await wikiHead('/wiki/Etiqueta-Inventada', {
			tag: { id: 'Etiqueta Inventada', visible_name: 'Etiqueta Inventada' }
		});
		const meta = single(head);
		expectComplete(meta, head, '/wiki/Etiqueta-Inventada');
		expect(meta['og:type']).toBe('website');
		expect(meta['og:title']).toBe('Etiqueta Inventada');
		expect(meta['og:description']).toBe(
			'Material, amigues y eventos de «Etiqueta Inventada» en Kinky Vibe.'
		);
	});
});

/** @param {Record<string, any>} [profile] @param {Record<string, any>} [extra] */
async function profileHead(profile = {}, extra = {}) {
	at('/amigues/Perfil_Inventado');
	const { default: Page } = await import('./amigues/[profile]/+page.svelte');
	return render(Page, {
		props: {
			form: null,
			data: /** @type {any} */ ({
				mode: 'db',
				profile: {
					title: 'Perfil Inventado',
					slug: 'Perfil_Inventado',
					kind: 'persona',
					bio: 'Una bio inventada.',
					image: '/media/img/' + 'b'.repeat(64) + '.webp',
					authors: [],
					tags: [],
					links: [],
					...profile
				},
				profileId: 1,
				canonical: '/amigues/Perfil_Inventado',
				bodyHtml: '',
				authors: [],
				members: [],
				location: null,
				venueEvents: [],
				relatedPosts: [],
				relatedPastCount: 0,
				badges: { hidden: false, membersOnly: false, pending: false },
				claim: null,
				participa: null,
				...extra
			})
		}
	}).head;
}

describe('un perfil de amigues', () => {
	it('profile, con su bio y su imagen entera', async () => {
		const head = await profileHead();
		const meta = single(head);
		expectComplete(meta, head, '/amigues/Perfil_Inventado');
		expect(meta['og:type']).toBe('profile');
		expect(meta['og:title']).toBe('Perfil Inventado');
		expect(meta['og:description']).toBe('Una bio inventada.');
		expect(new URL(meta['og:image']).pathname).toBe('/media/img/' + 'b'.repeat(64) + '.webp');
		expect(meta['og:image:alt']).toBe('Perfil Inventado');
		expect(meta).not.toHaveProperty('robots');
	});

	it('sin bio ni imagen: una descripción y el logo', async () => {
		const meta = single(await profileHead({ bio: '', image: undefined }));
		expect(meta['og:description']).toBe('Perfil Inventado en Amigues de Kinky Vibe.');
		expectDefaultImage(meta);
	});

	it('no listado: noindex', async () => {
		expect(single(await profileHead({}, { unlisted: true })).robots).toBe('noindex');
	});
});
