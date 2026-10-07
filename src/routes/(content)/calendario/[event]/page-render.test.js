/**
 * La página de un evento (/calendario/<evento>), pedido de gorrite:
 * - la hora en 24 h a la argentina («viernes 2 de octubre de 2026, 15:00», sin «hs» y nunca
 *   «3:00 p. m.»);
 * - el lugar una sola vez, en «Cuándo y dónde» y con el ícono del pin, mostrando en cada nivel
 *   de privacidad exactamente lo mismo que antes mostraba el bloque «Sucede en» de abajo;
 * - con el diseño de la maqueta final (aprobada por gorrite): el texto se lee antes de comprar,
 *   mapa chico arriba de «Ver en Google Maps», «Compartir» solo (sin «Agregar a mi
 *   calendario»), el aviso grande de cancelado, las partes, quiénes y etiquetas, y la serie al
 *   final.
 * Datos inventados.
 */
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'svelte/server';
import { readable } from 'svelte/store';
import { ADDRESS_FOR_BUYERS, venueView } from '$lib/utils/venues.js';
import { stripHtmlTags } from '$lib/utils/htmlStrip.js';

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
/** «Cuándo y dónde» (la tarjeta con la fecha y el lugar), hasta el texto del evento. */
const card = (/** @type {string} */ html) => {
	const from = html.indexOf('class="cuando-donde');
	const to = html.indexOf('id="que-titulo"');
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
		// Termina el mismo día: solo la hora («hasta las 19:00»), con su fecha completa en datetime.
		expect(body).toMatch(
			/class="dt-end[^"]*" datetime="2026-10-02T22:00:00\.000Z"[^>]*>19:00<\/time>/
		);
		expect(text(card(body))).toContain('hasta las 19:00');
		expect(body).not.toContain('p. m.');
		expect(article(body)).not.toMatch(/\d hs\b/);
	});

	it('con minutos y pasada la medianoche', () => {
		const body = page({ start: '2026-12-19T21:30:00-03:00', end: '2026-12-20T00:00:00-03:00' });
		expect(body).toContain('sábado 19 de diciembre de 2026, 21:30');
		// Termina otro día: con el día del final.
		expect(text(card(body))).toContain('hasta el domingo 20 de diciembre de 2026, 00:00');
	});
});

/**
 * Lo que se ve del lugar en cada nivel: lo mismo que mostraba el bloque «Sucede en» de abajo,
 * ahora una sola vez: el lugar, el mapa y «Ver en Google Maps» en «Cuándo y dónde» (`shows`);
 * «Cómo llegar» y «Accesibilidad» en su propia tarjeta, después de compartir (`after`).
 * @type {Record<string, { shows: string[], after?: string[], hides: string[], link: boolean, map: boolean }>}
 */
const LEVELS = {
	public: {
		shows: [
			'Galpón Inventado · Calle Inventada 1 (Barrio Inventado, Ciudad de Prueba)',
			'Ver en Google Maps'
		],
		after: ['Cómo llegar Tocá el timbre de prueba', 'Accesibilidad Rampa inventada'],
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

describe('/calendario/<evento>: el lugar, una sola vez y en «Cuándo y dónde»', () => {
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
			for (const s of want.after ?? []) {
				expect(text(block(body, 'llegar'))).toContain(s);
				expect(count(all, s)).toBe(1);
			}
			if (!want.after) expect(body).not.toContain('class="llegar');
			for (const s of want.hides) expect(all).not.toContain(s);
			// el bloque de abajo ya no está: un solo «Dónde», adentro de la tarjeta
			expect(count(body, 'aria-label="Dónde"')).toBe(1);
			expect(card(body)).toContain('aria-label="Dónde"');
			expect(all).not.toContain('Sucede en');
			// con el pin
			expect(count(card(body), 'lucide-map-pin')).toBe(1);
			// el nombre lleva a la página del lugar solo si el nivel lo muestra
			expect(count(body, `href="${HREF}"`)).toBe(want.link ? 1 : 0);
			// el mapa, solo donde se ve la dirección: chico, en «Cuándo y dónde» y arriba de «Ver en
			// Google Maps» (pedido de gorrite)
			expect(count(body, 'openstreetmap.org/?mlat')).toBe(want.map ? 2 : 0);
			if (want.map) {
				expect(count(card(body), 'class="venue-map')).toBe(1);
				expect(card(body).indexOf('class="venue-map')).toBeLessThan(
					card(body).indexOf('Ver en Google Maps')
				);
			}
		});
	}

	it('sin lugar vinculado: el «Dónde» del .md en la tarjeta, con el pin y su link al mapa', () => {
		const body = page({
			location: 'Plaza Inventada',
			location_map: 'https://www.openstreetmap.org/#map=17/-34.6/-58.4'
		});
		const inCard = card(body);
		expect(text(inCard)).toContain('Plaza Inventada Ver en el mapa');
		// Sin lugar vinculado no hay coordenadas: sin mapa chico (no se inventa una ubicación).
		expect(body).not.toContain('class="venue-map');
		expect(count(text(article(body)), 'Plaza Inventada')).toBe(1);
		expect(inCard).toContain('lucide-map-pin');
		expect(inCard).toContain('href="https://www.openstreetmap.org/#map=17/-34.6/-58.4"');
		expect(body).not.toContain('aria-label="Dónde"');
	});

	it('online (sin lugar ni «Dónde»): dice «Online», con el globo en vez del pin', () => {
		const inCard = card(page());
		expect(inCard).toMatch(/<span class="p-location">Online<\/span>/);
		expect(inCard).toContain('lucide-globe');
		expect(inCard).not.toContain('lucide-map-pin');
	});
});

describe('/calendario/<evento>: los botones', () => {
	// Antes: «Agregar a mi calendario» al lado de «Compartir». La maqueta final (gorrite) lo saca:
	// queda «Compartir» solo, centrado, y la inscripción va después del texto.
	it('«Compartir» solo (sin «Agregar a mi calendario»), y la inscripción después del texto', () => {
		const body = page({ link: 'https://example.com/inscripcion', link_text: 'Inscribirme' });
		expect(text(block(body, 'compartir'))).toMatch(/^Compartir/);
		expect(body).not.toContain('Agregar a mi calendario');
		expect(body).not.toContain('<add-to-calendar-button');
		// la inscripción no está en «Cuándo y dónde»: va después de «De qué se trata»
		expect(text(card(body))).not.toContain('Inscribirme');
		const art = article(body);
		expect(art.indexOf('>Inscribirme<')).toBeGreaterThan(art.indexOf('id="que-titulo"'));
	});

	it('un evento cancelado no ofrece agregarlo al calendario', () => {
		const body = page({ status: 'cancelado' });
		expect(body).not.toContain('Agregar a mi calendario');
		expect(text(block(body, 'compartir'))).toContain('Compartir');
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
		return stripHtmlTags(html).replace(/\s+/g, ' ').trim();
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
		// Antes iba dos veces (en la tarjeta y al final del texto); con la maqueta final, una sola:
		// el botón de inscripción, después del texto.
		expect(links).toHaveLength(1);
		for (const a of links) expect(a).not.toContain('target=');
		// El texto del link (Button lo envuelve en comentarios de Svelte).
		expect(text(links.length ? html.slice(html.indexOf(links[0])) : '')).toMatch(/^Escribinos/);
	});

	it('un link web al final del texto sigue abriendo otra pestaña', () => {
		const html = page({ link: 'https://forms.gle/inventado', link_text: 'Inscribirme' });
		expect(html).toMatch(/<a [^>]*href="https:\/\/forms\.gle\/inventado"[^>]*target="_blank"/);
	});

	it('un link con javascript: (u otro esquema) no se muestra', () => {
		const html = page({ link: 'javascript:alert(1)', link_text: 'Inscribirme' });
		expect(html).not.toContain('javascript:');
		expect(html).not.toContain('>Inscribirme</a>');
		expect(text(article(html))).not.toContain('Inscribirme');
	});
});

// Antes: «comprar arriba, el mapa después», con el mapa plegado en el celu. La maqueta final
// (gorrite) cambia la regla: el texto se lee antes de comprar, y el mapa chico va en «Cuándo y
// dónde» (sin plegar), con «Cómo llegar» y «Accesibilidad» en su tarjeta.
describe('/calendario/<evento>: el texto antes de comprar, el mapa en «Cuándo y dónde»', () => {
	const tickets = {
		open: true,
		priceFrom: 6400,
		gorraSuggested: null,
		left: null,
		closesAt: null,
		door: null
	};

	it('el botón de comprar va después del texto, la fecha, el lugar y el mapa', () => {
		const venue = venueView(VENUE, 'public', HREF);
		const body = article(page({}, { venue, tickets }));
		const buy = body.indexOf('class="buy-cta');
		expect(buy).toBeGreaterThan(body.indexOf('id="que-titulo"'));
		expect(buy).toBeGreaterThan(body.indexOf('class="cuando-donde'));
		expect(buy).toBeGreaterThan(body.indexOf('Calle Inventada 1'));
		expect(buy).toBeGreaterThan(body.indexOf('openstreetmap.org/?mlat'));
		// «Cómo llegar» y «Accesibilidad», después de comprar y de compartir
		expect(buy).toBeLessThan(body.indexOf('Cómo llegar'));
		expect(buy).toBeLessThan(body.indexOf('Accesibilidad'));
		expect(body.indexOf('class="compartir')).toBeLessThan(body.indexOf('Cómo llegar'));
	});

	it('el mapa se ve sin plegar (ni botón para abrirlo)', () => {
		const venue = venueView(VENUE, 'public', HREF);
		const body = page({}, { venue, tickets });
		expect(body).not.toContain('map-toggle');
		expect(body).not.toContain('venue-details');
		expect(card(body)).toContain('openstreetmap.org/?mlat');
	});

	it('sin mapa ni textos (solo el nombre del lugar), ni mapa ni «Cómo llegar»', () => {
		const venue = venueView(VENUE, 'name', HREF);
		const body = page({}, { venue, tickets });
		expect(body).not.toContain('class="venue-map');
		expect(body).not.toContain('class="llegar');
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

	// Antes: «Agregar a mi calendario» en segundo plano. La maqueta final lo saca en todos los
	// eventos (gorrite); lo que queda es «Compartir».
	it('sin «Agregar a mi calendario», con «Compartir»', () => {
		vi.setSystemTime(AFTER);
		const body = page();
		expect(body).not.toContain('Agregar a mi calendario');
		expect(text(block(body, 'compartir'))).toMatch(/^Compartir/);
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
		// En la cabecera, arriba del título.
		const head = body.slice(body.indexOf('class="cabeza'), body.indexOf('</header>'));
		expect(head.indexOf('event-series-chip')).toBeLessThan(head.indexOf('class="p-name'));
		const chip = block(head, 'event-series-chip');
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

/**
 * Los estados de la página con el diseño de la maqueta final (gorrite): normal, cancelado, ya
 * pasó, con y sin entradas, con y sin el mapa del lugar. Datos inventados.
 */
describe('/calendario/<evento>: los estados de la maqueta final', () => {
	const openTickets = {
		open: true,
		reason: null,
		priceFrom: 6400,
		gorraSuggested: null,
		left: null,
		closesAt: null,
		door: null,
		slug: 'taller-inventado'
	};
	const partes = {
		total: 3,
		current: 2,
		perPart: true,
		workshop: { slug: 'taller-de-prueba', title: 'Taller de Prueba' },
		parts: [
			{ slug: 'taller-de-prueba', title: 'Parte 1', n: 1, start: null, status: 'abierto' },
			{ slug: 'taller-inventado', title: 'Parte 2', n: 2, start: null, status: 'abierto' },
			{ slug: 'taller-de-prueba-3', title: 'Parte 3', n: 3, start: null, status: 'abierto' }
		],
		ticketSlug: null
	};
	const personas = [
		{
			rol: 'Organiza',
			items: [
				{
					slug: 'colectivo-inventado',
					title: 'Colectivo Inventado',
					href: '/amigues/colectivo-inventado'
				},
				{ slug: '', title: 'Persona de Prueba', href: '' }
			]
		}
	];
	const AFICHE = '/afiche-inventado.png';

	it('normal: afiche, título, resumen y «por…», «Cuándo y dónde», el texto y después comprar', () => {
		const venue = venueView(VENUE, 'public', HREF);
		const body = article(
			page(
				{ featured: AFICHE, authors: ['Colectivo Inventado', 'Persona de Prueba'] },
				{ venue, tickets: openTickets, partes, personas }
			)
		);
		// el afiche, cuadrado y con texto alternativo (en el celu va primero, por CSS)
		expect(body).toMatch(
			/<img class="afiche u-photo[^"]*" src="\/afiche-inventado\.png" alt="Afiche de Taller Inventado"/
		);
		expect(text(block(body, 'resumen'))).toMatch(/^Un taller inventado para las pruebas/);
		expect(text(block(body, 'por'))).toMatch(/^por Colectivo Inventado y Persona de Prueba/);
		const at = (/** @type {string} */ s) => body.indexOf(s);
		expect(at('class="cabeza')).toBeLessThan(at('class="cuando-donde'));
		expect(at('class="cuando-donde')).toBeLessThan(at('id="que-titulo"'));
		expect(at('id="que-titulo"')).toBeLessThan(at('class="buy-cta'));
		// el botón lleva a la página de compra
		expect(body).toContain('href="/calendario/taller-inventado/entradas"');
		// las partes, pegadas al botón de comprar
		expect(at('class="buy-cta')).toBeLessThan(at('class="part-nav'));
		expect(text(block(body, 'part-nav'))).toMatch(/^Parte 2 de 3 de/);
		expect(text(body)).toContain('Las 3 partes del taller');
		// compartir, cómo llegar, quiénes y etiquetas
		expect(at('class="part-nav')).toBeLessThan(at('class="compartir'));
		expect(at('class="compartir')).toBeLessThan(at('class="llegar'));
		expect(at('class="llegar')).toBeLessThan(at('class="quienes'));
		// sin avisos
		expect(body).not.toContain('role="note"');
	});

	it('una sola entrada para el taller: «Comprar entrada al taller»', () => {
		const body = article(
			page(
				{},
				{
					tickets: openTickets,
					partes: { ...partes, perPart: false, ticketSlug: 'taller-de-prueba' }
				}
			)
		);
		expect(text(block(body, 'buy-title'))).toMatch(/^Comprar entrada al taller/);
	});

	it('quiénes (un rol por renglón, «, » entre personas) y las etiquetas, con sus títulos', () => {
		const body = article(page({ tags: ['Shibari', 'español'] }, { personas }));
		const quienes = text(block(body, 'quienes'));
		expect(quienes).toMatch(/^Quiénes Organiza Colectivo Inventado , Persona de Prueba Etiquetas/);
		expect(body).toMatch(
			/<dd[^>]*><!--\[-->(<!--[^>]*-->)*<a class="h-card[^"]*" href="\/amigues\/colectivo-inventado">Colectivo Inventado<\/a>(<!--[^>]*-->)*, /
		);
		expect(body).toContain('id="tags"');
	});

	it('sin personas ni etiquetas, sin la tarjeta de «Quiénes»', () => {
		expect(page()).not.toContain('class="quienes');
	});

	it('la serie va al final, después de quiénes: «Edición N de…» y el lugar de «Seguir»', () => {
		const series = {
			list: [
				{
					id: 'Serie Inventada',
					name: 'Serie Inventada',
					href: '/wiki/Serie-Inventada',
					icon: '',
					number: 2,
					total: 3,
					prev: null,
					next: null,
					past: false,
					nextUpcoming: null
				}
			],
			account: { member: false, subscribed: [] }
		};
		const body = article(page({ tags: ['Serie Inventada'] }, { series, personas }));
		const serie = body.indexOf('class="serie');
		expect(serie).toBeGreaterThan(body.indexOf('class="quienes'));
		const rest = block(body, 'serie');
		expect(text(rest)).toMatch(/^Edición 2 de/);
		// «Seguir» (FollowButton) se arma en el navegador, después de preguntar a /api/sigo.
		expect(rest).toContain('class="seguir');
	});

	it('cancelado: el aviso grande, sin venta, sin inscripción y sin mapa', () => {
		const venue = venueView(VENUE, 'public', HREF);
		const body = article(
			page(
				{ status: 'cancelado', link: 'https://example.com/inscripcion', featured: AFICHE },
				{ venue, tickets: { ...openTickets, open: false, reason: 'cancelled' } }
			)
		);
		const note = block(body, 'cancelado');
		expect(text(note)).toMatch(/^Cancelado Este evento se canceló\./);
		// arriba: justo después de la cabecera, antes de «Cuándo y dónde» y del texto
		expect(body.indexOf('class="cancelado')).toBeLessThan(body.indexOf('class="cuando-donde'));
		expect(body).not.toContain('class="buy-cta');
		expect(body).not.toContain('example.com/inscripcion');
		expect(body).not.toContain('class="venue-map');
		expect(body).not.toContain('Este evento ya pasó');
		// se sigue viendo qué era y cuándo
		expect(text(card(body))).toContain('viernes 2 de octubre de 2026, 15:00');
	});

	it('ya pasó: el aviso, sin la venta cerrada, con las partes', () => {
		vi.setSystemTime(AFTER);
		const body = article(
			page({}, { tickets: { ...openTickets, open: false, reason: 'closed' }, partes })
		);
		expect(text(block(body, 'past-note'))).toMatch(/^Este evento ya pasó\./);
		expect(body).not.toContain('class="buy-cta');
		expect(text(body)).toContain('Las 3 partes del taller');
		expect(body).not.toContain('Agregar a mi calendario');
	});

	it('ya pasó, sin venta: no ofrece el link de inscripción', () => {
		vi.setSystemTime(AFTER);
		const body = article(
			page({ link: 'https://example.com/inscripcion', link_text: 'Inscribirme' })
		);
		expect(body).not.toContain('example.com/inscripcion');
	});

	it('sin entradas ni link: ni botón de comprar ni de inscripción', () => {
		const body = article(page());
		expect(body).not.toContain('class="buy-cta');
		expect(body).not.toContain('class="compra');
	});

	it('con entradas y link con texto: el link sigue al final del texto (docs/tickets.md)', () => {
		const body = article(
			page(
				{ link: 'https://example.com/mas-info', link_text: 'Más info' },
				{ tickets: openTickets }
			)
		);
		const cta = body.indexOf('class="cta"');
		expect(cta).toBeGreaterThan(body.indexOf('id="que-titulo"'));
		expect(cta).toBeLessThan(body.indexOf('class="buy-cta'));
		expect(count(body, 'href="https://example.com/mas-info"')).toBe(1);
	});

	it('venta cerrada antes del evento: dice por qué', () => {
		const body = article(page({}, { tickets: { ...openTickets, open: false, reason: 'soldout' } }));
		expect(text(block(body, 'buy-closed'))).toMatch(/^Agotadas\./);
	});

	it('lugar con coordenadas: mapa chico; solo con texto libre: sin mapa', () => {
		const venue = venueView(VENUE, 'public', HREF);
		expect(card(page({}, { venue }))).toContain('class="venue-map');
		const noCoords = venueView(
			{ ...VENUE, data: { ...VENUE.data, lat: undefined, lng: undefined } },
			'public',
			HREF
		);
		expect(page({}, { venue: noCoords })).not.toContain('class="venue-map');
		expect(page({ location: 'Calle de Ejemplo 456' })).not.toContain('class="venue-map');
	});
});
