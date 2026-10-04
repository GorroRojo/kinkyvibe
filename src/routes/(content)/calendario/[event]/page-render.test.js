/**
 * La página de un evento (/calendario/<evento>), pedido de gorrite:
 * - la hora en 24 h a la argentina («viernes 2 de octubre de 2026, 15:00», sin «hs» y nunca
 *   «3:00 p. m.»);
 * - el lugar una sola vez, en la tarjeta y con el ícono del pin, mostrando en cada nivel de
 *   privacidad exactamente lo mismo que antes mostraba el bloque «Sucede en» de abajo;
 * - «Agregar a mi calendario» abajo, al lado de «Compartir», y no en la tarjeta.
 * Datos inventados.
 */
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'svelte/server';
import { readable } from 'svelte/store';
import { ADDRESS_FOR_BUYERS, venueView } from '$lib/utils/venues.js';

vi.mock('$app/stores', () => ({
	page: readable({
		url: new URL('http://localhost/calendario/taller-inventado'),
		params: { event: 'taller-inventado' }
	})
}));

const { default: Page } = await import('./+page.svelte');

// El evento inventado es del viernes 2/10/2026: las pruebas miran la página antes de que pase
// (un evento que ya pasó se ve distinto: «Este evento ya pasó», sin venta; ver abajo).
const BEFORE = new Date('2026-10-01T12:00:00-03:00');
const AFTER = new Date('2026-10-03T12:00:00-03:00');
beforeEach(() => {
	vi.useFakeTimers({ toFake: ['Date'] });
	vi.setSystemTime(BEFORE);
});
afterAll(() => {
	vi.useRealTimers();
});

/** Un lugar inventado con todos los datos cargados (el nivel decide qué se ve). */
const VENUE = {
	title: 'Galpón Inventado',
	data: {
		address: 'Calle Inventada 1',
		area: 'Barrio Inventado',
		city: 'Ciudad de Prueba',
		lat: -34.6,
		lng: -58.4,
		how_to_get_there: 'Tocá el timbre de prueba',
		accessibility: 'Rampa inventada'
	}
};
const HREF = '/amigues/galpon-inventado';

/**
 * @param {Record<string, any>} [meta]
 * @param {Record<string, any>} [extra]
 */
const page = (meta = {}, extra = {}) =>
	render(Page, {
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
					...meta
				},
				venue: null,
				tickets: null,
				relatedPosts: [],
				relatedPastCount: 0,
				authorsProfiles: Promise.resolve([]),
				series: null,
				personas: null,
				propinas: false,
				...extra
			})
		}
	}).body;

/** @param {string} html @param {string} cls */
const block = (html, cls) => {
	const at = html.indexOf(`class="${cls}`);
	return at < 0 ? '' : html.slice(html.indexOf('>', at) + 1);
};
/** La tarjeta del evento (hasta lo que sigue después de ella). */
const card = (/** @type {string} */ html) => {
	const from = html.indexOf('class="event-header');
	const to = html.indexOf('class="share-row');
	return html.slice(from, to);
};
/**
 * Las etiquetas (y los comentarios de Svelte) cambiadas por espacios, repitiendo hasta que no
 * quede ninguna: solo para comparar el texto en las pruebas.
 * @param {string} html
 */
function stripTags(html) {
	let out = html;
	let prev;
	do {
		prev = out;
		out = out.replace(/<[^<>]*>/g, ' ');
	} while (out !== prev);
	return out;
}
/** El texto visible (sin etiquetas, comentarios ni íconos). */
const text = (/** @type {string} */ html) => stripTags(html).replace(/\s+/g, ' ').trim();
/** @param {string} haystack @param {string} needle */
const count = (haystack, needle) => haystack.split(needle).length - 1;
/** La parte de la página que arma el artículo del evento (sin lo relacionado de abajo). */
const article = (/** @type {string} */ html) =>
	html.slice(html.indexOf('<article'), html.indexOf('</article>'));

describe('/calendario/<evento>: la hora', () => {
	it('en 24 h, con el día de la semana y sin «hs» (formato de encabezado)', () => {
		const body = page();
		expect(body).toMatch(/class="dt-start[^"]*"[^>]*>viernes 2 de octubre de 2026, 15:00<\/time>/);
		expect(body).toMatch(/class="dt-end[^"]*"[^>]*>viernes 2 de octubre de 2026, 19:00<\/time>/);
		expect(body).not.toContain('p. m.');
		expect(article(body)).not.toMatch(/\d hs\b/);
	});

	it('con minutos y pasada la medianoche', () => {
		const body = page({ start: '2026-12-19T21:30:00-03:00', end: '2026-12-20T00:00:00-03:00' });
		expect(body).toContain('sábado 19 de diciembre de 2026, 21:30');
		expect(body).toContain('domingo 20 de diciembre de 2026, 00:00');
	});
});

/**
 * Lo que se ve del lugar en cada nivel: lo mismo que mostraba el bloque «Sucede en» de abajo
 * (que ya incluía lo de la tarjeta), ahora una sola vez y en la tarjeta.
 * @type {Record<string, { shows: string[], hides: string[], link: boolean, map: boolean }>}
 */
const LEVELS = {
	public: {
		shows: [
			'Galpón Inventado · Calle Inventada 1 (Barrio Inventado, Ciudad de Prueba)',
			'Ver en Google Maps',
			'Cómo llegar Tocá el timbre de prueba',
			'Accesibilidad Rampa inventada'
		],
		hides: [ADDRESS_FOR_BUYERS],
		link: true,
		map: true
	},
	name: {
		shows: ['Galpón Inventado', ADDRESS_FOR_BUYERS],
		hides: ['Calle Inventada 1', 'Barrio Inventado', 'Google Maps', 'Tocá el timbre', 'Rampa'],
		link: true,
		map: false
	},
	address: {
		shows: ['Calle Inventada 1 (Barrio Inventado, Ciudad de Prueba)', 'Ver en Google Maps'],
		hides: ['Galpón Inventado', ADDRESS_FOR_BUYERS, 'Tocá el timbre', 'Rampa'],
		link: false,
		map: true
	},
	area: {
		shows: ['Barrio Inventado, Ciudad de Prueba', ADDRESS_FOR_BUYERS],
		hides: ['Galpón Inventado', 'Calle Inventada 1', 'Google Maps', 'Tocá el timbre', 'Rampa'],
		link: false,
		map: false
	},
	hidden: {
		shows: ['Lugar a confirmar', ADDRESS_FOR_BUYERS],
		hides: ['Galpón Inventado', 'Calle Inventada 1', 'Barrio Inventado', 'Google Maps'],
		link: false,
		map: false
	}
};

describe('/calendario/<evento>: el lugar, una sola vez y en la tarjeta', () => {
	for (const [level, want] of Object.entries(LEVELS)) {
		it(`nivel «${level}»: lo mismo que antes, sin repetir`, () => {
			const venue = venueView(VENUE, /** @type {any} */ (level), HREF);
			const body = page({}, { venue });
			const all = text(article(body));
			const inCard = text(card(body));
			for (const s of want.shows) {
				expect(inCard).toContain(s);
				expect(count(all, s)).toBe(1);
			}
			for (const s of want.hides) expect(all).not.toContain(s);
			// el bloque de abajo ya no está: un solo «Dónde», adentro de la tarjeta
			expect(count(body, 'aria-label="Dónde"')).toBe(1);
			expect(card(body)).toContain('aria-label="Dónde"');
			expect(all).not.toContain('Sucede en');
			// con el pin
			expect(count(card(body), 'lucide-map-pin')).toBe(1);
			// el nombre lleva a la página del lugar solo si el nivel lo muestra
			expect(count(body, `href="${HREF}"`)).toBe(want.link ? 1 : 0);
			// el mapa, solo donde se ve la dirección
			expect(count(body, 'openstreetmap.org/?mlat')).toBe(want.map ? 2 : 0);
		});
	}

	it('sin lugar vinculado: el «Dónde» del .md en la tarjeta, con el pin y su link al mapa', () => {
		const body = page({
			location: 'Plaza Inventada',
			location_map: 'https://www.openstreetmap.org/#map=17/-34.6/-58.4'
		});
		const inCard = card(body);
		expect(text(inCard)).toContain('en Plaza Inventada Ver en el mapa');
		expect(count(text(article(body)), 'Plaza Inventada')).toBe(1);
		expect(inCard).toContain('lucide-map-pin');
		expect(inCard).toContain('href="https://www.openstreetmap.org/#map=17/-34.6/-58.4"');
		expect(body).not.toContain('aria-label="Dónde"');
	});

	it('online (sin lugar ni «Dónde»): dice «Online», con el globo en vez del pin', () => {
		const inCard = card(page());
		expect(text(inCard)).toContain('en Online');
		expect(inCard).toContain('lucide-globe');
		expect(inCard).not.toContain('lucide-map-pin');
	});
});

describe('/calendario/<evento>: los botones', () => {
	it('«Agregar a mi calendario» va abajo, al lado de «Compartir», y no en la tarjeta', () => {
		const body = page({ link: 'https://example.com/inscripcion', link_text: 'Inscribirme' });
		const row = block(body, 'share-row');
		expect(text(row)).toMatch(/^Agregar a mi calendario Compartir/);
		expect(card(body)).not.toContain('calendario</');
		expect(body).not.toContain('<add-to-calendar-button');
		// la tarjeta se queda con la inscripción como acción principal
		expect(text(card(body))).toContain('Inscribirme');
	});

	it('un evento cancelado no ofrece agregarlo al calendario', () => {
		const body = page({ status: 'cancelado' });
		expect(body).not.toContain('Agregar a mi calendario');
		expect(text(block(body, 'share-row'))).toContain('Compartir');
	});
});

describe('/calendario/<evento>: el botón de comprar entradas', () => {
	/** @param {Record<string, any>} tickets */
	const buyMeta = (tickets) => {
		const body = page(
			{},
			{
				tickets: {
					open: true,
					priceFrom: null,
					gorraSuggested: null,
					left: null,
					closesAt: null,
					door: null,
					...tickets
				}
			}
		);
		const from = body.indexOf('class="buy-meta');
		const html = body.slice(body.indexOf('>', from) + 1, body.indexOf('</span>', from));
		// Sin poner espacios en lugar de las etiquetas (como hace stripTags): lo que importa es
		// si los espacios están en el texto.
		return html
			.replace(/<!--[\s\S]*?-->/g, '')
			.replace(/<[^<>]*>/g, '')
			.replace(/\s+/g, ' ')
			.trim();
	};

	it('separa el precio de lo que queda con « · »', () => {
		expect(buyMeta({ priceFrom: 6400, left: 5 })).toMatch(/^desde \$\s6\.400 · Quedan 5$/);
	});

	it('precio y gorra, con y sin lo que queda', () => {
		expect(buyMeta({ priceFrom: 6400, gorraSuggested: 3000 })).toMatch(
			/^desde \$\s6\.400 · a la gorra$/
		);
		expect(buyMeta({ gorraSuggested: 3000, left: 2 })).toBe('a la gorra · ¡Últimas 2!');
	});

	it('solo lo que queda, sin un «·» suelto adelante', () => {
		expect(buyMeta({ left: 1 })).toBe('¡Última!');
	});
});

describe('/calendario/<evento>: el link de inscripción', () => {
	it('un mail (mailto:) se muestra como link al mail, sin abrir otra pestaña', () => {
		const html = page({ link: 'mailto:hola@ejemplo.test', link_text: 'Escribinos' });
		const links = [...html.matchAll(/<a [^>]*href="mailto:hola@ejemplo\.test"[^>]*>/g)].map(
			(m) => m[0]
		);
		// En la tarjeta y al final del texto.
		expect(links).toHaveLength(2);
		for (const a of links) expect(a).not.toContain('target=');
		expect(html).toContain('>Escribinos</a>');
	});

	it('un link web al final del texto sigue abriendo otra pestaña', () => {
		const html = page({ link: 'https://forms.gle/inventado', link_text: 'Inscribirme' });
		expect(html).toMatch(/<a [^>]*href="https:\/\/forms\.gle\/inventado"[^>]*target="_blank"/);
	});

	it('un link con javascript: (u otro esquema) no se muestra', () => {
		const html = page({ link: 'javascript:alert(1)', link_text: 'Inscribirme' });
		expect(html).not.toContain('javascript:');
		expect(html).not.toContain('>Inscribirme</a>');
	});
});

describe('/calendario/<evento>: comprar arriba, el mapa después (igual en todos los eventos)', () => {
	const tickets = {
		open: true,
		priceFrom: 6400,
		gorraSuggested: null,
		left: null,
		closesAt: null,
		door: null
	};

	it('el botón de comprar va justo después de la fecha y el lugar, antes del mapa', () => {
		const venue = venueView(VENUE, 'public', HREF);
		const body = article(page({}, { venue, tickets }));
		const buy = body.indexOf('class="buy-cta');
		expect(buy).toBeGreaterThan(body.indexOf('class="event-header'));
		expect(buy).toBeGreaterThan(body.indexOf('Calle Inventada 1'));
		expect(buy).toBeLessThan(body.indexOf('openstreetmap.org/?mlat'));
		expect(buy).toBeLessThan(body.indexOf('Cómo llegar'));
		expect(buy).toBeLessThan(body.indexOf('Accesibilidad'));
	});

	it('el mapa, «Cómo llegar» y «Accesibilidad» se pliegan en el celu detrás de un botón', () => {
		const venue = venueView(VENUE, 'public', HREF);
		const body = page({}, { venue, tickets });
		const toggle = body.match(/<button[^>]*class="[^"]*map-toggle[^"]*"[^>]*>/)?.[0] ?? '';
		expect(toggle).toContain('aria-expanded="false"');
		expect(toggle).toContain('aria-controls="venue-details-body"');
		expect(text(block(body, 'venue-details'))).toMatch(/^Ver mapa y cómo llegar/);
		const details = body.slice(body.indexOf('id="venue-details-body"'));
		expect(details).toContain('openstreetmap.org/?mlat');
		expect(text(details)).toContain('Cómo llegar Tocá el timbre de prueba');
	});

	it('sin mapa ni textos (solo el nombre del lugar), no hay nada que plegar', () => {
		const venue = venueView(VENUE, 'name', HREF);
		expect(page({}, { venue, tickets })).not.toContain('venue-details');
	});
});

describe('/calendario/<evento>: un evento que ya pasó', () => {
	const closed = {
		open: false,
		reason: 'closed',
		priceFrom: 6400,
		gorraSuggested: null,
		left: null,
		closesAt: null,
		door: null
	};
	/** @param {any} [nextUpcoming] */
	const series = (nextUpcoming = null) => ({
		list: [
			{
				id: 'Serie Inventada',
				name: 'Serie Inventada',
				href: '/wiki/Serie-Inventada',
				icon: '',
				number: 3,
				total: 4,
				prev: null,
				next: null,
				past: true,
				nextUpcoming
			}
		],
		account: { member: false, subscribed: [] }
	});

	it('dice «Este evento ya pasó», sin «Venta cerrada.» ni botón de comprar', () => {
		vi.setSystemTime(AFTER);
		const body = article(page({}, { tickets: closed }));
		expect(text(body)).toContain('Este evento ya pasó.');
		expect(body).not.toContain('Venta cerrada');
		expect(body).not.toContain('class="buy-cta');
	});

	it('con la próxima edición de la serie, el link para ir', () => {
		vi.setSystemTime(AFTER);
		const next = {
			path: '/calendario/taller-inventado-2',
			title: 'Taller Inventado',
			start: '2026-11-06T15:00:00-03:00'
		};
		const body = article(page({}, { series: series(next) }));
		const note = block(body, 'past-note');
		expect(note).toMatch(
			/<a href="\/calendario\/taller-inventado-2"[^>]*>Próxima edición de la serie/
		);
	});

	it('«Agregar a mi calendario» queda en segundo plano (link, no botón)', () => {
		vi.setSystemTime(AFTER);
		const row = block(page(), 'share-row');
		expect(row).toMatch(/<button[^>]*class="kv-link quiet[^"]*"[^>]*>/);
		vi.setSystemTime(BEFORE);
		expect(block(page(), 'share-row')).toMatch(/<button[^>]*class="trigger[^"]*"[^>]*>/);
	});

	it('antes de que pase, nada de eso', () => {
		const body = article(page({}, { tickets: { ...closed, open: true, reason: null } }));
		expect(body).not.toContain('Este evento ya pasó');
		expect(body).toContain('class="buy-cta');
	});
});

describe('/calendario/<evento>: la serie en la cabecera', () => {
	it('un chip con el nombre de la serie que lleva a su página', () => {
		const body = page(
			{},
			{
				series: {
					list: [
						{
							id: 'Serie Inventada',
							name: 'Serie Inventada',
							href: '/wiki/Serie-Inventada',
							icon: '',
							number: 1,
							total: 1,
							prev: null,
							next: null,
							past: false,
							nextUpcoming: null
						}
					],
					account: { member: false, subscribed: [] }
				}
			}
		);
		const chip = block(card(body), 'event-series-chip');
		expect(chip).toMatch(/<a class="kv-tag[^"]*"[^>]*href="\/wiki\/Serie-Inventada"/);
		expect(text(chip)).toMatch(/^Serie Inventada/);
	});

	it('sin serie, sin chip', () => {
		expect(page()).not.toContain('event-series-chip');
	});
});

describe('/calendario/<evento>: «Más cosas de…»', () => {
	/** @param {string} slug @param {string} start */
	const related = (slug, start) => ({
		path: `/calendario/${slug}`,
		meta: {
			title: slug,
			postID: slug,
			category: 'calendario',
			start,
			tags: [],
			authors: ['Colectivo Inventado'],
			summary: ''
		}
	});

	it('lo que viene, del más cercano al más lejano; lo pasado, aparte en «Pasados»', () => {
		const body = page(
			{ authors: ['Colectivo Inventado'] },
			{
				relatedPosts: [
					related('fiesta-lejana', '2026-12-01T22:00:00-03:00'),
					related('fiesta-cercana', '2026-10-09T22:00:00-03:00')
				],
				relatedPastCount: 7
			}
		);
		expect(body.indexOf('fiesta-cercana')).toBeGreaterThan(0);
		expect(body.indexOf('fiesta-cercana')).toBeLessThan(body.indexOf('fiesta-lejana'));
		const past = block(body, 'related-past');
		expect(text(past)).toMatch(/^Pasados Ver 7 pasados/);
	});
});
