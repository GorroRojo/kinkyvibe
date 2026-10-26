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
import { LIST_SECTIONS } from '$lib/utils/seo.js';
import { SITE_TAGLINE } from '$lib/utils/ogCards.js';
import { PREVIEW_TEXT_DEFAULTS } from '$lib/utils/previewTexts.js';

const ORIGIN = 'https://sitio.test';
const pageStore = writable({ url: new URL(ORIGIN + '/'), params: {}, data: {} });
vi.mock('$app/stores', () => ({ page: pageStore }));
vi.mock('$app/navigation', () => ({ goto: vi.fn(), afterNavigate: vi.fn() }));

// Compilar las páginas lleva unos segundos: se cargan una vez acá, fuera del tiempo de cada prueba.
await Promise.all([
	import('./+page.svelte'),
	import('./calendario/+page.svelte'),
	import('./amigues/+page.svelte'),
	import('./calendario/[event]/+page.svelte'),
	import('./material/[post]/+page.svelte'),
	import('./wiki/[term]/+page.svelte'),
	import('./amigues/[profile]/+page.svelte')
]);

/**
 * @param {string} path
 * @param {string} [origin]
 * @param {Record<string, any>} [data] más datos de la página (`linkPreview`)
 */
function at(path, origin = ORIGIN, data = {}) {
	pageStore.set({ url: new URL(origin + path), params: {}, data: { wiki: [], ...data } });
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
	// La tarjeta chica solo para imágenes cuadradas o angostas (seoTags).
	const w = Number(meta['og:image:width']);
	const h = Number(meta['og:image:height']);
	expect(meta['twitter:card']).toBe(
		w && h && (w === h || w < 600) ? 'summary' : 'summary_large_image'
	);
	expect(meta['twitter:site']).toBe('@kinkyvibearg');
	expect(meta['og:title']).toBeTruthy();
	expect(meta['twitter:title']).toBe(meta['og:title']);
	expect(meta['og:description']).toBeTruthy();
	expect(meta['twitter:description']).toBe(meta['og:description']);
	expect(meta.description).toBe(meta['og:description']);
	for (const value of Object.values(meta)) expect(value).not.toContain('undefined');
}

/**
 * La tarjeta de static/ (la por defecto o la de una sección), entera y con sus medidas.
 * @param {Record<string, string>} meta
 * @param {string} [file]
 */
function expectDefaultImage(meta, file = '/og-default.jpg') {
	const image = new URL(meta['og:image']);
	expect(image.origin).toBe(ORIGIN);
	expect(image.pathname).toBe(file);
	expect(meta['og:image:width']).toBe('1200');
	expect(meta['og:image:height']).toBe('630');
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
		// la descripción es la frase oficial del sitio, la misma de las tarjetas
		expect(meta['og:description']).toBe(SITE_TAGLINE);
		expectDefaultImage(meta);
	});
});

describe('calendario', () => {
	/** @param {any[]} posts */
	async function calendarHead(posts, path = '/calendario') {
		at(path);
		const { default: Calendario } = await import('./calendario/+page.svelte');
		return render(Calendario, {
			props: { data: /** @type {any} */ ({ posts, ticketStates: null }) }
		}).head;
	}

	it('website, con su tarjeta y una frase fija si no hay próximos', async () => {
		const head = await calendarHead([]);
		const meta = single(head);
		expectComplete(meta, head, '/calendario');
		expect(meta['og:type']).toBe('website');
		// título aprobado por gorrite (11/10)
		expect(meta['og:title']).toBe(
			'Calendario · Próximos talleres, encuentros y eventos cuir y kinky'
		);
		expect(meta['og:description']).toBe(LIST_SECTIONS.calendario.description);
		expectDefaultImage(meta, '/og-calendario.jpg');
		expect(meta['og:image:alt']).toContain('«Calendario · ');
	});

	it('con próximos eventos, los nombra', async () => {
		/** @param {string} title @param {string} start */
		const post = (title, start) => ({
			path: '/calendario/' + title,
			meta: { title, start, layout: 'calendario', category: 'calendario', tags: [], postID: title }
		});
		const head = await calendarHead([
			post('Taller Inventado', '2026-10-05T20:00:00-03:00'),
			post('Juntada de Prueba', '2026-10-03T20:00:00-03:00')
		]);
		expect(single(head)['og:description']).toBe(
			'Próximos: Juntada de Prueba (3/10) y Taller Inventado (5/10). ' +
				LIST_SECTIONS.calendario.description
		);
	});
});

describe('amigues (la lista)', () => {
	const KINDS = { persona: 'Personas', proyecto: 'Proyectos', lugar: 'Lugares' };
	/** @param {string} path */
	async function amiguesHead(path) {
		at(path);
		const { default: Amigues } = await import('./amigues/+page.svelte');
		return render(Amigues, {
			props: { data: /** @type {any} */ ({ posts: [], kinds: KINDS }) }
		}).head;
	}

	it('sin filtros: su tarjeta, og:url igual a la canónica', async () => {
		const head = await amiguesHead('/amigues');
		const meta = single(head);
		expectComplete(meta, head, '/amigues');
		expect(meta['og:title']).toBe('Amigues · Emprendimientos y profesionales de la comunidad');
		expect(meta['og:description']).toBe(LIST_SECTIONS.amigues.description);
		expectDefaultImage(meta, '/og-amigues.jpg');
	});

	it('con ?tags=: la etiqueta en el título y la descripción; og:url guarda el filtro y la canónica no', async () => {
		const head = await amiguesHead('/amigues?utm_source=x&tags=terapia');
		const meta = single(head);
		expect(meta['og:title']).toBe('Amigues · terapia');
		expect(meta['twitter:title']).toBe('Amigues · terapia');
		expect(meta['og:description']).toBe(
			'Amigues con la etiqueta terapia. ' + LIST_SECTIONS.amigues.description
		);
		const og = new URL(meta['og:url']);
		expect(og.origin + og.pathname).toBe(ORIGIN + '/amigues');
		expect([...og.searchParams]).toEqual([['tags', 'terapia']]);
		const canon = new URL(canonical(head));
		expect(canon.href).toBe(ORIGIN + '/amigues');
		expect(canon.search).toBe('');
		expectDefaultImage(meta, '/og-amigues.jpg');
	});

	it('?tipo= y varias etiquetas, ordenadas en og:url', async () => {
		const meta = single(await amiguesHead('/amigues?tipo=persona&tags=terapia,clases'));
		expect(meta['og:title']).toBe('Amigues · Personas · terapia, clases');
		expect(meta['og:description']).toBe(
			'Personas con las etiquetas terapia y clases. ' + LIST_SECTIONS.amigues.description
		);
		const og = new URL(meta['og:url']);
		expect([...og.searchParams.keys()]).toEqual(['tags', 'tipo']);
		expect(og.searchParams.get('tags')).toBe('terapia,clases');
	});

	it('lo que viene en la dirección va escapado (las comillas no cortan el atributo)', async () => {
		const evil = '"><script>alert(1)</script>';
		const head = await amiguesHead('/amigues?tags=' + encodeURIComponent(evil));
		// la comilla va como &quot;: el texto queda adentro del atributo y no abre nada
		expect(head).not.toContain('"><script>');
		expect(tagsOf(head, 'script')).toEqual([]);
		const meta = single(head);
		expect(meta['og:title']).toBe('Amigues · ' + evil);
		expect(new URL(meta['og:url']).searchParams.get('tags')).toBe(evil);
	});

	it('las listas se indexan: sin robots', async () => {
		expect(single(await amiguesHead('/amigues'))).not.toHaveProperty('robots');
	});
});

describe('/todo', () => {
	it('noindex (sin nofollow): junta las otras listas, los buscadores siguen sus links', async () => {
		at('/todo');
		const { default: ListSeoHead } = await import('$lib/components/ListSeoHead.svelte');
		const head = render(ListSeoHead, { props: { section: 'todo', noindex: true } }).head;
		expect(single(head).robots).toBe('noindex');
		// y la página lo pide así (sin compilarla entera: la fuente alcanza)
		const { readFileSync } = await import('node:fs');
		const source = readFileSync(new URL('./todo/+page.svelte', import.meta.url), 'utf8');
		expect(source).toMatch(/<ListSeoHead section="todo" noindex \/>/);
	});
});

describe('títulos de las listas (los textos del panel)', () => {
	it('/todo: su propio <title> (no el del inicio) y un h1', async () => {
		at('/todo');
		const { default: Todo } = await import('./todo/+page.svelte');
		const { head, body } = render(Todo, { props: { data: /** @type {any} */ ({ posts: [] }) } });
		expect(head).toContain(`<title>${PREVIEW_TEXT_DEFAULTS['todo.heading']} · Kinky Vibe</title>`);
		expect(tagsOf(body, 'h1')).toHaveLength(1);
	});

	it('un texto cambiado en el panel cambia el <title>', async () => {
		const texts = { ...PREVIEW_TEXT_DEFAULTS, 'material.heading': 'Material · Inventado' };
		at('/material', ORIGIN, { linkPreview: { texts, images: {} } });
		const { default: Material } = await import('./material/+page.svelte');
		const { head } = render(Material, { props: { data: /** @type {any} */ ({ posts: [] }) } });
		expect(head).toContain('<title>Material · Inventado · Kinky Vibe</title>');
	});
});

/** Una portada de la biblioteca inventada. */
const COVER = '/media/img/' + 'a'.repeat(64) + '.webp';

/**
 * @param {Record<string, any>} [meta]
 * @param {Record<string, any>} [extra]
 * @param {string} [origin]
 */
async function eventHead(meta = {}, extra = {}, origin = ORIGIN) {
	at('/calendario/taller-inventado', origin);
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

	it('en producción, una portada pesada va achicada por Cloudflare, con las medidas que devuelve', async () => {
		const cover = { width: 1080, height: 1350, alt: 'Afiche de prueba', size: 400 * 1024 };
		const head = await eventHead({}, { cover }, 'https://kinkyvibe.ar');
		const meta = single(head);
		const image = new URL(meta['og:image']);
		expect(image.origin).toBe('https://kinkyvibe.ar');
		const [, cdn, kind, options, ...rest] = image.pathname.split('/');
		expect([cdn, kind]).toEqual(['cdn-cgi', 'image']);
		expect(options.split(',')).toContain('format=jpeg');
		expect('/' + rest.join('/')).toBe(COVER);
		expect(new URL(meta['twitter:image']).href).toBe(image.href);
		expect(meta['og:image:width']).toBe('800');
		expect(meta['og:image:height']).toBe('1000');
		// la canónica sigue siendo la página, no la imagen
		expect(new URL(meta['og:url']).pathname).toBe('/calendario/taller-inventado');
	});

	it('en un preview, la misma portada va tal cual', async () => {
		const cover = { width: 1080, height: 1350, alt: 'Afiche de prueba', size: 400 * 1024 };
		const meta = single(await eventHead({}, { cover }));
		const image = new URL(meta['og:image']);
		expect(image.origin).toBe(ORIGIN);
		expect(image.pathname).toBe(COVER);
		expect(meta['og:image:width']).toBe('1080');
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
						tags: ['guía', 'descargable'],
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
		expect(meta['og:description']).toBe('Guía descargable · Una guía inventada para las pruebas');
		expect(new URL(meta['og:image']).pathname).toBe(COVER);
		expect(meta['og:image:alt']).toBe('Tapa de la guía');
		// La tapa es cuadrada: tarjeta chica en X y Bluesky (la grande la recortaría).
		expect(meta['twitter:card']).toBe('summary');
		// Sin fecha de actualización, sin article:modified_time (antes iba vacía).
		expect(meta).not.toHaveProperty('article:modified_time');
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
		expectDefaultImage(meta, '/og-kinkipedia.jpg');
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

	it('una etiqueta sin entrada con descripción: la definición en texto y el nombre con mayúscula', async () => {
		const head = await wikiHead('/wiki/etiqueta-inventada', {
			tag: {
				id: 'etiqueta inventada',
				visible_name: 'etiqueta inventada',
				description: 'Una [[práctica]] inventada, con [[Bondage:ataduras]].'
			}
		});
		const meta = single(head);
		expect(meta['og:title']).toBe('Etiqueta inventada');
		expect(meta.description).toBe('Una práctica inventada, con ataduras.');
		expect(meta['og:description']).toBe('Una práctica inventada, con ataduras.');
		expect(head).toContain('<title>Etiqueta inventada · Kinky Vibe</title>');
		// El mismo nombre en el DefinedTerm.
		expect(head).toContain('"name": "Etiqueta inventada"');
	});
});

/** @param {Record<string, any>} [profile] @param {Record<string, any>} [extra] */
async function renderProfile(profile = {}, extra = {}) {
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
	});
}

/** @param {Record<string, any>} [profile] @param {Record<string, any>} [extra] */
async function profileHead(profile = {}, extra = {}) {
	return (await renderProfile(profile, extra)).head;
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

	it('sin etiquetas article:* (son de og:type article; un perfil es profile)', async () => {
		const meta = single(await profileHead());
		expect(Object.keys(meta).filter((k) => k.startsWith('article:'))).toEqual([]);
	});

	it('la foto de perfil dice de quién es', async () => {
		const { body } = await renderProfile();
		const photo = tagsOf(body, 'img').find((img) => /\bu-photo\b/.test(img.class ?? ''));
		expect(photo?.alt).toBe('Foto de perfil de Perfil Inventado');
	});
});

describe('textos del panel e imágenes dibujadas (linkPreview del layout)', () => {
	const CUSTOM = {
		linkPreview: {
			texts: {
				...PREVIEW_TEXT_DEFAULTS,
				'home.title': 'Inicio inventado',
				'home.description': 'Descripción inventada del inicio.',
				'calendario.heading': 'Agenda · Cosas inventadas',
				'calendario.description': 'Calendario inventado.',
				'calendario.upcomingPrefix': 'Se viene:'
			},
			images: {
				default: '/og/default/0123456789abcdef.jpg',
				calendario: '/og/calendario/fedcba9876543210.jpg'
			}
		}
	};

	it('el inicio usa sus textos y la tarjeta dibujada', async () => {
		at('/', ORIGIN, CUSTOM);
		const { default: Home } = await import('./+page.svelte');
		const { head } = render(Home, { props: { data: /** @type {any} */ ({ posts: [] }) } });
		const meta = single(head);
		expectComplete(meta, head, '/');
		expect(meta['og:title']).toBe('Inicio inventado');
		expect(meta['og:description']).toBe('Descripción inventada del inicio.');
		expectDefaultImage(meta, '/og/default/0123456789abcdef.jpg');
	});

	it('el calendario: título, descripción, lo de antes de los próximos y su tarjeta', async () => {
		at('/calendario', ORIGIN, CUSTOM);
		const { default: Calendario } = await import('./calendario/+page.svelte');
		const posts = [
			{
				path: '/calendario/x',
				meta: {
					title: 'Taller Inventado',
					start: '2026-10-05T20:00:00-03:00',
					layout: 'calendario',
					category: 'calendario',
					tags: [],
					postID: 'x'
				}
			}
		];
		const { head } = render(Calendario, {
			props: { data: /** @type {any} */ ({ posts, ticketStates: null }) }
		});
		const meta = single(head);
		expect(meta['og:title']).toBe('Agenda · Cosas inventadas');
		expect(meta['og:description']).toBe('Se viene: Taller Inventado (5/10). Calendario inventado.');
		expectDefaultImage(meta, '/og/calendario/fedcba9876543210.jpg');
	});
});
