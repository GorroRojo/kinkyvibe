/**
 * La vista previa al compartir un link (src/lib/utils/seo.js). Datos inventados.
 */
import { describe, expect, it } from 'vitest';
import { venueView } from './venues.js';
import { tagsFactory } from './tags.js';
import { OG_CARDS, SITE_TAGLINE, ogCardText } from './ogCards.js';
import { PREVIEW_TEXT_DEFAULTS } from './previewTexts.js';
import {
	DEFAULT_IMAGE,
	DESCRIPTION_MAX,
	absoluteUrl,
	canonicalUrl,
	eventDescription,
	SMALL_IMAGE_BYTES,
	cardImage,
	filteredListUrl,
	isFiltered,
	joinList,
	listFilters,
	listPreview,
	LIST_SECTIONS,
	KINKIPEDIA_PREVIEW,
	kinkipediaPreview,
	linkPreviewOf,
	sectionTexts,
	materialDescription,
	upcomingDescription,
	previewImage,
	resizedImageUrl,
	resizedSize,
	seoTags,
	shortText,
	tagDescription
} from './seo.js';

const ORIGIN = 'https://sitio.test';

describe('absoluteUrl', () => {
	it('una dirección relativa queda entera, en el sitio', () => {
		const url = new URL(absoluteUrl('/media/img/abc.webp', ORIGIN));
		expect(url.origin).toBe(ORIGIN);
		expect(url.pathname).toBe('/media/img/abc.webp');
	});
	it('una entera queda igual', () => {
		expect(absoluteUrl('https://otro.test/a.png', ORIGIN)).toBe('https://otro.test/a.png');
	});
	it('sin imagen, o lo que no es una dirección web, da vacío', () => {
		for (const v of [undefined, null, '', '  ', 'undefined', 12, 'javascript:alert(1)']) {
			expect(absoluteUrl(v, ORIGIN)).toBe('');
		}
	});
});

describe('canonicalUrl', () => {
	it('sin ?… ni #…', () => {
		expect(canonicalUrl(new URL('https://sitio.test/calendario/x?tags=a#b'))).toBe(
			'https://sitio.test/calendario/x'
		);
	});
});

describe('shortText', () => {
	it('deja el texto en una línea', () => {
		expect(shortText('  Hola\n\n  vos  ')).toBe('Hola vos');
	});
	it('corta en la última palabra que entra, con «…»', () => {
		const text = 'palabra '.repeat(60);
		const short = shortText(text);
		expect(short.length).toBeLessThanOrEqual(DESCRIPTION_MAX);
		expect(short.endsWith('palabra…')).toBe(true);
	});
	it('sin texto, vacío', () => {
		expect(shortText(undefined)).toBe('');
	});
});

describe('eventDescription', () => {
	const meta = {
		title: 'Taller Inventado',
		start: '2026-10-02T15:00:00-03:00',
		summary: 'Un taller inventado para las pruebas',
		location_name: 'Galpón de Prueba',
		location: 'Calle Inventada 123'
	};

	it('fecha y hora a la argentina, el lugar en pocas palabras y el resumen', () => {
		expect(eventDescription(meta)).toBe(
			'Viernes 2 de octubre de 2026, 15:00 · Galpón de Prueba · Un taller inventado para las pruebas'
		);
	});

	it('la hora no depende de la zona horaria de quien arma la página', () => {
		// 18:00 UTC son las 15:00 en Buenos Aires
		expect(eventDescription({ ...meta, start: '2026-10-02T18:00:00Z' })).toContain('15:00');
	});

	it('online', () => {
		expect(eventDescription({ ...meta, location_name: '', location: '', tags: ['Online'] })).toBe(
			'Viernes 2 de octubre de 2026, 15:00 · Online · Un taller inventado para las pruebas'
		);
	});

	it('cancelado, adelante', () => {
		expect(eventDescription({ ...meta, status: 'cancelado' })).toMatch(/^Cancelado · Viernes/);
	});

	it('con lugar vinculado, lo que deja ver su nivel (nunca la dirección escondida)', () => {
		const place = {
			title: 'Galpón Inventado',
			data: { address: 'Calle Secreta 99', area: 'Barrio Inventado', city: 'Ciudad de Prueba' }
		};
		const stripped = { ...meta, location_name: undefined, location: undefined };
		const hidden = venueView(place, 'area', '/amigues/galpon');
		const text = eventDescription(stripped, hidden);
		expect(text).not.toContain('Calle Secreta');
		expect(text).not.toContain('Galpón Inventado');
		expect(text).toContain('Barrio Inventado');
		const named = venueView(place, 'name', '/amigues/galpon');
		expect(eventDescription(stripped, named)).toContain('Galpón Inventado');
		expect(eventDescription(stripped, named)).not.toContain('Calle Secreta');
	});

	it('sin fecha ni lugar, solo el resumen', () => {
		expect(eventDescription({ summary: 'Solo esto' })).toBe('Solo esto');
	});
});

describe('tagDescription', () => {
	it('nombra la etiqueta', () => {
		expect(tagDescription('Shibari')).toBe(
			'Material, amigues y eventos de «Shibari» en Kinky Vibe.'
		);
	});
});

describe('previewImage', () => {
	it('la imagen de la página, entera, con sus medidas y su texto alternativo', () => {
		const img = previewImage('/media/img/abc.webp', ORIGIN, {
			width: 1200,
			height: 800,
			alt: 'Cuerdas'
		});
		expect(new URL(img.url).href).toBe('https://sitio.test/media/img/abc.webp');
		expect(img).toMatchObject({ width: 1200, height: 800, alt: 'Cuerdas' });
	});
	it('sin medidas (o con una sola), ninguna; el texto alternativo de respaldo', () => {
		const img = previewImage('/a.webp', ORIGIN, { width: 1200, height: null, alt: '' }, 'Título');
		expect(img).toMatchObject({ width: null, height: null, alt: 'Título' });
	});
	it('sin imagen, el logo del sitio (entero, con sus medidas)', () => {
		for (const src of [undefined, 'undefined', '']) {
			const img = previewImage(src, ORIGIN);
			const url = new URL(img.url);
			expect(url.origin).toBe(ORIGIN);
			expect(url.pathname).toBe(DEFAULT_IMAGE.url);
			expect(img).toMatchObject({ width: 1200, height: 630, alt: DEFAULT_IMAGE.alt });
		}
	});
});

describe('achicar portadas grandes en producción', () => {
	const HASH = 'c'.repeat(64);
	const PROD = 'https://kinkyvibe.ar';
	const BIG = 400 * 1024;

	/** Las partes de una dirección de `/cdn-cgi/image/<opciones>/<imagen>`. @param {string} href */
	function transform(href) {
		const url = new URL(href);
		const [, cdn, image, options, ...rest] = url.pathname.split('/');
		return { url, cdn, image, options: options.split(','), source: '/' + rest.join('/') };
	}

	it('una portada grande de la biblioteca, en kinkyvibe.ar: JPEG de 800 px con vuelta a la original', () => {
		const href = resizedImageUrl(`${PROD}/media/img/${HASH}.webp`, BIG);
		expect(href).not.toBeNull();
		const t = transform(/** @type {string} */ (href));
		expect(t.url.protocol).toBe('https:');
		expect(t.url.hostname).toBe('kinkyvibe.ar');
		expect([t.cdn, t.image]).toEqual(['cdn-cgi', 'image']);
		expect(t.options).toEqual(['width=800', 'format=jpeg', 'quality=80', 'onerror=redirect']);
		expect(t.source).toBe(`/media/img/${HASH}.webp`);
		expect(t.url.search).toBe('');
	});

	it('sin el peso, también se achica', () => {
		expect(resizedImageUrl(`${PROD}/media/img/${HASH}.png`)).not.toBeNull();
		expect(resizedImageUrl(`${PROD}/media/img/${HASH}.png`, null)).not.toBeNull();
	});

	it('una liviana (hasta 200 KB) va tal cual', () => {
		expect(resizedImageUrl(`${PROD}/media/img/${HASH}.webp`, SMALL_IMAGE_BYTES)).toBeNull();
		expect(resizedImageUrl(`${PROD}/media/img/${HASH}.webp`, 70_000)).toBeNull();
	});

	it('en un preview, en local o en otro sitio, nunca (no tienen las transformaciones)', () => {
		for (const origin of [
			'https://claude-x-kinkyvibe.gorro-rojo.workers.dev',
			'http://localhost:5173',
			'https://www.kinkyvibe.ar',
			'https://kinkyvibe.ar.otro.test',
			'http://kinkyvibe.ar'
		]) {
			expect(resizedImageUrl(`${origin}/media/img/${HASH}.webp`, BIG)).toBeNull();
		}
	});

	it('solo imágenes de la biblioteca', () => {
		for (const path of [
			'/_app/immutable/assets/1.x.webp',
			'/og-default.jpg',
			'/og/default/0123456789abcdef.jpg',
			`/media/file/${HASH}.pdf`,
			`/media/img/${HASH}.webp?x=1`
		]) {
			expect(resizedImageUrl(PROD + path, BIG)).toBeNull();
		}
		expect(resizedImageUrl('no es una dirección', BIG)).toBeNull();
	});

	it('las medidas de la achicada: como Cloudflare (sin agrandar), o ninguna si no son exactas', () => {
		expect(resizedSize(1080, 1350)).toEqual({ width: 800, height: 1000 });
		expect(resizedSize(1280, 1600)).toEqual({ width: 800, height: 1000 });
		expect(resizedSize(1061, 1061)).toEqual({ width: 800, height: 800 });
		expect(resizedSize(800, 800)).toEqual({ width: 800, height: 800 });
		expect(resizedSize(640, 480)).toEqual({ width: 640, height: 480 });
		expect(resizedSize(1000, 333)).toEqual({ width: null, height: null });
		expect(resizedSize(null, 600)).toEqual({ width: null, height: null });
	});

	it('previewImage: en producción la achicada con sus medidas; en un preview, la original', () => {
		const info = { width: 1080, height: 1350, alt: 'Afiche', size: BIG };
		const prod = previewImage(`/media/img/${HASH}.webp`, PROD, info);
		expect(transform(prod.url).source).toBe(`/media/img/${HASH}.webp`);
		expect(new URL(prod.url).hostname).toBe('kinkyvibe.ar');
		expect(prod).toMatchObject({ width: 800, height: 1000, alt: 'Afiche' });

		const preview = previewImage(`/media/img/${HASH}.webp`, ORIGIN, info);
		const url = new URL(preview.url);
		expect(url.origin).toBe(ORIGIN);
		expect(url.pathname).toBe(`/media/img/${HASH}.webp`);
		expect(preview).toMatchObject({ width: 1080, height: 1350 });

		const small = previewImage(`/media/img/${HASH}.webp`, PROD, { ...info, size: 90_000 });
		expect(new URL(small.url).pathname).toBe(`/media/img/${HASH}.webp`);
		expect(small).toMatchObject({ width: 1080, height: 1350 });
	});

	it('la imagen por defecto nunca se achica', () => {
		const img = previewImage(undefined, PROD);
		expect(new URL(img.url).pathname).toBe(DEFAULT_IMAGE.url);
	});
});

/** Un árbol de etiquetas inventado: una con nombre visible distinto y un alias. */
const TAGS = tagsFactory(
	/** @type {any} */ ([
		{ id: 'terapia' },
		{ id: 'cuerdas', visible_name: 'Cuerdas y nudos' },
		{ id: 'sogas', aliasOf: 'cuerdas' },
		{ id: 'guía' },
		{ id: 'descargable' }
	])
);
const KINDS = { persona: 'Personas', proyecto: 'Proyectos', lugar: 'Lugares' };
/** @param {string} search */
const at = (search) => new URL('https://sitio.test/amigues' + search);

describe('listFilters', () => {
	it('sin filtros', () => {
		const f = listFilters(at(''), TAGS, { kinds: KINDS });
		expect(f).toEqual({ tags: [], text: '', kind: null, kindLabel: null });
		expect(isFiltered(f)).toBe(false);
	});

	it('una etiqueta, con su nombre visible', () => {
		expect(listFilters(at('?tags=cuerdas'), TAGS).tags).toEqual([
			{ id: 'cuerdas', name: 'Cuerdas y nudos' }
		]);
	});

	it('un alias es su etiqueta, y no se repite', () => {
		expect(listFilters(at('?tags=sogas,cuerdas'), TAGS).tags).toEqual([
			{ id: 'cuerdas', name: 'Cuerdas y nudos' }
		]);
	});

	it('varias etiquetas, en el orden de la dirección', () => {
		expect(listFilters(at('?tags=terapia,%20sogas'), TAGS).tags.map((t) => t.id)).toEqual([
			'terapia',
			'cuerdas'
		]);
	});

	it('una etiqueta desconocida va tal cual', () => {
		expect(listFilters(at('?tags=no-existe'), TAGS).tags).toEqual([
			{ id: 'no-existe', name: 'no-existe' }
		]);
	});

	it('como mucho 5 etiquetas', () => {
		expect(listFilters(at('?tags=a,b,c,d,e,f,g'), TAGS).tags).toHaveLength(5);
	});

	it('?tipo= solo si la lista lo conoce; ?q= en una línea', () => {
		const f = listFilters(at('?tipo=persona&q=%20cuerdas%0A%20rojas%20'), TAGS, { kinds: KINDS });
		expect(f).toMatchObject({ kind: 'persona', kindLabel: 'Personas', text: 'cuerdas rojas' });
		expect(listFilters(at('?tipo=otra'), TAGS, { kinds: KINDS }).kind).toBeNull();
		expect(listFilters(at('?tipo=persona'), TAGS).kind).toBeNull();
		expect(listFilters(at('?tipo=toString'), TAGS, { kinds: KINDS }).kind).toBeNull();
	});
});

describe('filteredListUrl', () => {
	it('sin filtros, la página sola', () => {
		const url = at('?viewdate=2026-10&utm_source=x');
		expect(filteredListUrl(url, listFilters(url, TAGS))).toBe('https://sitio.test/amigues');
	});

	it('los filtros normalizados (alias → etiqueta, sin repetir) y ordenados por nombre', () => {
		const url = at('?tipo=persona&tags=sogas,terapia,cuerdas&utm_source=x&q=%20nudos%20');
		const out = new URL(filteredListUrl(url, listFilters(url, TAGS, { kinds: KINDS })));
		expect(out.origin + out.pathname).toBe('https://sitio.test/amigues');
		expect([...out.searchParams.keys()]).toEqual(['q', 'tags', 'tipo']);
		expect(out.searchParams.get('tags')).toBe('cuerdas,terapia');
		expect(out.searchParams.get('q')).toBe('nudos');
		expect(out.searchParams.get('tipo')).toBe('persona');
		expect(out.searchParams.has('utm_source')).toBe(false);
		// la coma queda legible, como la escribe la lista (writeSearchParams)
		expect(out.search).toBe('?q=nudos&tags=cuerdas,terapia&tipo=persona');
	});

	it('lo raro de una etiqueta va codificado', () => {
		const url = at('?tags=' + encodeURIComponent('a&b=c'));
		const out = new URL(filteredListUrl(url, listFilters(url, TAGS)));
		expect(out.searchParams.get('tags')).toBe('a&b=c');
		expect([...out.searchParams.keys()]).toEqual(['tags']);
	});
});

describe('listPreview', () => {
	const plain = { title: 'Amigues', description: 'Sin filtros.' };

	const AMIGUES = LIST_SECTIONS.amigues.description;

	it('sin filtros, el que le pasan o, si no, el de la sección (que dice qué es la página)', () => {
		expect(listPreview('amigues', listFilters(at(''), TAGS), plain)).toBe(plain);
		expect(listPreview('amigues', listFilters(at(''), TAGS))).toEqual({
			title: 'Amigues · Emprendimientos y profesionales de la comunidad',
			description: AMIGUES
		});
	});

	it('cada sección dice qué es, en pocas palabras', () => {
		for (const section of /** @type {const} */ (['calendario', 'material', 'amigues', 'todo'])) {
			const { title, heading, description } = LIST_SECTIONS[section];
			expect(heading.startsWith(title + ' · ')).toBe(true);
			expect(description.length).toBeLessThanOrEqual(DESCRIPTION_MAX);
		}
		// Título aprobado por gorrite (11/10).
		expect(KINKIPEDIA_PREVIEW.title).toBe('Kinkipedia · Glosario cuir y kinky');
		expect(KINKIPEDIA_PREVIEW.description.length).toBeLessThanOrEqual(DESCRIPTION_MAX);
	});

	it('una etiqueta: el filtro y después la descripción de la sección', () => {
		expect(listPreview('amigues', listFilters(at('?tags=terapia'), TAGS), plain)).toEqual({
			title: 'Amigues · terapia',
			description: 'Amigues con la etiqueta terapia. ' + AMIGUES
		});
	});

	it('varias etiquetas, con el nombre visible y el alias resuelto', () => {
		expect(listPreview('calendario', listFilters(at('?tags=terapia,sogas'), TAGS), plain)).toEqual({
			title: 'Calendario · terapia, Cuerdas y nudos',
			description:
				'Eventos con las etiquetas terapia y Cuerdas y nudos. ' +
				LIST_SECTIONS.calendario.description
		});
	});

	it('tipo y búsqueda', () => {
		const f = listFilters(at('?tipo=lugar&q=sogas'), TAGS, { kinds: KINDS });
		expect(listPreview('amigues', f, plain)).toEqual({
			title: 'Amigues · Lugares · «sogas»',
			description: 'Lugares que mencionan «sogas». ' + AMIGUES
		});
	});

	it('una etiqueta desconocida, tal cual', () => {
		expect(listPreview('material', listFilters(at('?tags=xyz'), TAGS), plain).title).toBe(
			'Material · xyz'
		);
	});

	it('con los textos del panel: título, descripción y las frases de los filtros', () => {
		const texts = {
			...PREVIEW_TEXT_DEFAULTS,
			'amigues.heading': 'Amigues · Gente inventada',
			'amigues.description': 'Una descripción inventada.',
			'amigues.title': 'Amigas',
			'amigues.items': 'Personas amigas',
			'filtros.oneTag': 'que tienen {x}',
			'filtros.manyTags': 'que tienen {x} (todas)',
			'filtros.text': 'que dicen {x}'
		};
		expect(listPreview('amigues', listFilters(at(''), TAGS), undefined, texts)).toEqual({
			title: 'Amigues · Gente inventada',
			description: 'Una descripción inventada.'
		});
		expect(listPreview('amigues', listFilters(at('?tags=terapia'), TAGS), plain, texts)).toEqual({
			title: 'Amigas · terapia',
			description: 'Personas amigas que tienen terapia. Una descripción inventada.'
		});
		expect(
			listPreview('amigues', listFilters(at('?tags=terapia,sogas&q=x'), TAGS), plain, texts)
				.description
		).toBe(
			'Personas amigas que tienen terapia y Cuerdas y nudos (todas) que dicen x. Una descripción inventada.'
		);
		expect(sectionTexts('amigues', texts).title).toBe('Amigas');
		expect(kinkipediaPreview({ ...texts, 'wiki.title': 'Glosario X' }).title).toBe('Glosario X');
	});
});

describe('materialDescription', () => {
	it('formato, «descargable» y el resumen', () => {
		expect(
			materialDescription({ tags: ['guía', 'descargable'], summary: 'Una guía inventada.' }, TAGS)
		).toBe('Guía descargable · Una guía inventada.');
		expect(materialDescription({ tags: ['descargable'], summary: 'Algo.' })).toBe(
			'Descargable · Algo.'
		);
		expect(materialDescription({ tags: ['web'], summary: 'Solo el resumen.' })).toBe(
			'Solo el resumen.'
		);
	});

	it('con los textos del panel', () => {
		const texts = {
			...PREVIEW_TEXT_DEFAULTS,
			'materialTipo.downloadSuffix': ' para bajar',
			'materialTipo.downloadOnly': 'Para bajar'
		};
		expect(materialDescription({ tags: ['guía', 'descargable'], summary: 'X.' }, TAGS, texts)).toBe(
			'Guía para bajar · X.'
		);
		expect(materialDescription({ tags: ['descargable'], summary: 'X.' }, TAGS, texts)).toBe(
			'Para bajar · X.'
		);
	});
});

describe('upcomingDescription', () => {
	const now = new Date('2026-10-10T12:00:00-03:00').getTime();
	/** @param {string} title @param {string} start @param {string} [status] */
	const post = (title, start, status) => ({ meta: { title, start, status } });

	it('los próximos 3, por fecha, sin los pasados ni los cancelados', () => {
		const posts = [
			post('Cuarto', '2026-10-30T20:00:00-03:00'),
			post('Pasado', '2026-10-01T20:00:00-03:00'),
			post('Segundo', '2026-10-15T20:00:00-03:00'),
			post('Cancelado', '2026-10-11T20:00:00-03:00', 'cancelado'),
			post('Primero', '2026-10-12T20:00:00-03:00'),
			post('Tercero', '2026-10-20T20:00:00-03:00')
		];
		expect(upcomingDescription(posts, 'Qué es la página.', now)).toBe(
			'Próximos: Primero (12/10), Segundo (15/10) y Tercero (20/10). Qué es la página.'
		);
	});

	it('el día va a la argentina (un evento a las 23 h no pasa al día siguiente)', () => {
		expect(upcomingDescription([post('Noche', '2026-10-17T23:30:00-03:00')], 'Base.', now)).toBe(
			'Próximos: Noche (17/10). Base.'
		);
	});

	it('con el texto del panel antes de los eventos', () => {
		expect(
			upcomingDescription([post('Noche', '2026-10-17T23:30:00-03:00')], 'Base.', now, 'Se viene:')
		).toBe('Se viene: Noche (17/10). Base.');
	});

	it('sin próximos, la frase fija', () => {
		expect(upcomingDescription([post('Pasado', '2026-10-01')], 'Frase fija.', now)).toBe(
			'Frase fija.'
		);
	});
});

describe('las tarjetas', () => {
	it('la por defecto y la de cada sección: 1200 × 630, con la frase en el texto alternativo', () => {
		for (const key of /** @type {const} */ ([
			'default',
			'calendario',
			'material',
			'amigues',
			'wiki'
		])) {
			const card = cardImage(key);
			expect(card.url).toBe('/' + OG_CARDS[key].file);
			expect(card).toMatchObject({ width: 1200, height: 630 });
			// el texto alternativo dice lo que está escrito en la tarjeta
			const { name, subtitle } = ogCardText(key);
			expect(card.alt).toContain(name);
			if (subtitle) expect(card.alt).toContain(subtitle);
		}
		expect(cardImage('default').alt).toContain(SITE_TAGLINE);
		expect(cardImage('calendario').alt).toContain(
			'«Calendario · Próximos talleres, encuentros y eventos cuir y kinky»'
		);
		expect(DEFAULT_IMAGE).toEqual(cardImage('default'));
	});

	it('la dibujada con las portadas si el servidor la manda, con los textos del panel', () => {
		const preview = linkPreviewOf({
			linkPreview: {
				texts: { ...PREVIEW_TEXT_DEFAULTS, 'calendario.cardName': 'Agenda' },
				images: { calendario: '/og/calendario/0123456789abcdef.jpg' }
			}
		});
		const card = cardImage('calendario', preview);
		expect(card.url).toBe('/og/calendario/0123456789abcdef.jpg');
		expect(card.alt).toContain('«Agenda · Próximos talleres');
		// sin la de esa tarjeta, la de static/
		expect(cardImage('material', preview).url).toBe('/og-material.jpg');
		// sin nada del servidor, los originales
		expect(linkPreviewOf(undefined).texts).toBe(PREVIEW_TEXT_DEFAULTS);
		expect(linkPreviewOf({}).images).toEqual({});
	});

	it('la frase oficial, tal cual', () => {
		expect(SITE_TAGLINE).toBe('Educación crítica, cultura transformativa, y comunidad disidente.');
	});

	it('joinList', () => {
		expect([
			joinList([]),
			joinList(['a']),
			joinList(['a', 'b']),
			joinList(['a', 'b', 'c'])
		]).toEqual(['', 'a', 'a y b', 'a, b y c']);
	});
});

describe('seoTags', () => {
	const base = {
		title: 'Título',
		description: 'Descripción',
		url: 'https://sitio.test/x',
		image: { url: 'https://sitio.test/a.webp', width: 10, height: 20, alt: 'Alt' }
	};
	/** @param {ReturnType<typeof seoTags>} tags */
	const asMap = (tags) => Object.fromEntries(tags.map(([, key, content]) => [key, content]));

	it('todas las de Open Graph y Twitter', () => {
		expect(asMap(seoTags({ ...base, type: 'article' }))).toEqual({
			description: 'Descripción',
			'og:site_name': 'Kinky Vibe',
			'og:locale': 'es_AR',
			'og:type': 'article',
			'og:url': 'https://sitio.test/x',
			'og:title': 'Título',
			'og:description': 'Descripción',
			'og:image': 'https://sitio.test/a.webp',
			'og:image:width': '10',
			'og:image:height': '20',
			'og:image:alt': 'Alt',
			'twitter:card': 'summary_large_image',
			'twitter:site': '@kinkyvibearg',
			'twitter:title': 'Título',
			'twitter:description': 'Descripción',
			'twitter:image': 'https://sitio.test/a.webp',
			'twitter:image:alt': 'Alt'
		});
	});
	it('Open Graph con property, las demás con name', () => {
		for (const [attr, key] of seoTags(base)) {
			expect(attr).toBe(key.startsWith('og:') ? 'property' : 'name');
		}
	});
	it('website por defecto; sin las que no tienen valor; noindex si se pide', () => {
		const tags = asMap(
			seoTags({
				...base,
				description: '',
				image: { url: 'https://sitio.test/a.webp' },
				noindex: true
			})
		);
		expect(tags['og:type']).toBe('website');
		expect(tags.robots).toBe('noindex');
		for (const key of ['description', 'og:description', 'og:image:width', 'og:image:alt']) {
			expect(tags).not.toHaveProperty(key);
		}
	});
});
