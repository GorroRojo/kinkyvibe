/**
 * La vista previa al compartir un link (src/lib/utils/seo.js). Datos inventados.
 */
import { describe, expect, it } from 'vitest';
import { venueView } from './venues.js';
import {
	DEFAULT_IMAGE,
	DESCRIPTION_MAX,
	absoluteUrl,
	canonicalUrl,
	eventDescription,
	SMALL_IMAGE_BYTES,
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
			'/og-default.png',
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
