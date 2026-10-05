/**
 * Datos INVENTADOS para las maquetas de la página de un evento (/estilo/evento/<opcion>, solo en
 * previews y en dev). Reproducen el caso que gorrite marcó como desordenado: con afiche, de una
 * serie, parte de un taller en varias partes, con texto largo, varias personas con rol,
 * etiquetas, venta de entradas y lugar con mapa, «Cómo llegar» y «Accesibilidad».
 * Ninguna persona, lugar ni dato es real.
 */
import { argDateTimeLong, argTime, eventEnd } from '$lib/utils/dates.js';

/** Afiche inventado, cuadrado como la mayoría de los reales (SVG en línea: sin archivos ni
 * pedidos a otros sitios). */
const AFICHE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="1000" viewBox="0 0 1000 1000">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#6a0dad"/><stop offset="1" stop-color="#f43fb4"/></linearGradient></defs>
<rect width="1000" height="1000" fill="url(#g)"/>
<g fill="none" stroke="#fff" stroke-opacity=".35" stroke-width="12">
<path d="M-40 220 C 250 80, 750 380, 1040 200"/><path d="M-40 310 C 270 170, 730 470, 1040 290"/>
<path d="M-40 400 C 290 260, 710 560, 1040 380"/></g>
<text x="500" y="650" fill="#fff" font-family="sans-serif" font-size="96" font-weight="700" text-anchor="middle">AFICHE</text>
<text x="500" y="760" fill="#fff" font-family="sans-serif" font-size="96" font-weight="700" text-anchor="middle">DE EJEMPLO</text>
<text x="500" y="860" fill="#fff" fill-opacity=".85" font-family="sans-serif" font-size="42" text-anchor="middle">cuadrado · datos inventados</text>
</svg>`;
export const AFICHE = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(AFICHE_SVG)}`;

export const START = '2026-11-14T15:00:00-03:00';
export const END = '2026-11-14T19:00:00-03:00';

/** `meta` como la que recibe la página real (+page.js). */
export const meta = {
	title: 'Jornada Inventada de Cuerdas · Edición 4',
	postID: 'jornada-inventada-de-cuerdas-4',
	category: 'calendario',
	start: START,
	end: END,
	status: 'abierto',
	featured: AFICHE,
	authors: ['Colectivo Inventado', 'Persona de Prueba Uno'],
	tags: ['KinkyVibe', 'español', 'AMBA', 'pago', 'Shibari', 'Serie Inventada'],
	summary:
		'Una jornada inventada de cuerdas para mostrar cómo se ve la página de un evento con todo cargado.'
};

/** El lugar, ya filtrado por su privacidad (nivel «Nombre + dirección»; `venueView`). */
export const venue = /** @type {import('$lib/utils/venues.js').VenueView} */ ({
	level: 'public',
	name: 'Galpón Inventado',
	href: '/amigues/galpon-inventado',
	address: 'Calle Inventada 123',
	area: 'Barrio de Prueba',
	city: 'Ciudad de Ejemplo',
	lat: -34.6037,
	lng: -58.3816,
	howTo:
		'A dos cuadras de la estación inventada. Tocá el timbre «B» y esperá: te abre alguien del equipo.',
	accessibility:
		'Entrada a nivel de la calle, baño accesible en planta baja. El salón tiene piso de madera y colchonetas.'
});

/** Resumen de la venta para el botón (como `summarizeTickets`). */
export const tickets = {
	open: true,
	reason: null,
	priceFrom: 6400,
	gorraSuggested: null,
	left: 7,
	closesAt: Date.parse('2026-11-14T12:00:00-03:00'),
	opensAt: null,
	door: { on: false, explicit: true, price: '' },
	slug: meta.postID
};

/** @param {number} n @param {string} start */
const edition = (n, start) => ({
	slug: `jornada-inventada-de-cuerdas-${n}`,
	title: `Jornada Inventada de Cuerdas · Edición ${n}`,
	start,
	status: 'abierto',
	path: `/calendario/jornada-inventada-de-cuerdas-${n}`,
	number: n
});

/** La serie (como `loadSeries`). */
export const series = {
	list: [
		{
			id: 'Serie Inventada',
			name: 'Serie Inventada',
			href: '/wiki/Serie-Inventada',
			icon: '🪢',
			number: 4,
			total: 5,
			prev: edition(3, '2026-09-12T15:00:00-03:00'),
			next: edition(5, '2026-12-12T15:00:00-03:00'),
			past: false,
			nextUpcoming: null
		}
	],
	account: { member: false, subscribed: [] }
};

/**
 * Taller en varias partes (como `loadPartes`), con «Entradas por parte» prendida
 * (`entradas_por_parte` en el `extra` del taller; docs/talleres-partes.md). Con una sola entrada
 * (lo que viene por defecto), ver {@link partesFor}.
 */
export const partes = {
	total: 3,
	current: 2,
	perPart: true,
	workshop: { slug: 'taller-inventado-de-cuerdas', title: 'Taller Inventado de Cuerdas' },
	parts: [
		{
			slug: 'taller-inventado-de-cuerdas',
			title: 'Parte 1',
			n: 1,
			start: '2026-11-07T15:00:00-03:00',
			status: 'abierto'
		},
		{ slug: meta.postID, title: 'Parte 2', n: 2, start: START, status: 'abierto' },
		{
			slug: 'taller-inventado-de-cuerdas-3',
			title: 'Parte 3',
			n: 3,
			start: '2026-11-21T15:00:00-03:00',
			status: 'abierto'
		}
	],
	ticketSlug: null
};

/** Personas con su rol (como `personasForPage`). */
export const personas = [
	{
		rol: 'Organiza',
		items: [
			{
				slug: 'colectivo-inventado',
				title: 'Colectivo Inventado',
				href: '/amigues/colectivo-inventado'
			},
			{
				slug: 'persona-de-prueba-uno',
				title: 'Persona de Prueba Uno',
				href: '/amigues/persona-de-prueba-uno'
			}
		]
	},
	{
		rol: 'Facilita',
		items: [
			{
				slug: 'persona-de-prueba-dos',
				title: 'Persona de Prueba Dos',
				href: '/amigues/persona-de-prueba-dos'
			},
			{ slug: '', title: 'Persona de Prueba Tres', href: '' }
		]
	},
	{
		rol: 'Acompaña',
		items: [{ slug: 'persona-de-prueba-cuatro', title: 'Persona de Prueba Cuatro', href: '' }]
	}
];

/**
 * Las partes según cómo vende el taller: `unica` = una sola entrada, la del taller, que vale
 * para todas las partes (el botón dice «Comprar entrada al taller»).
 * @param {boolean} unica
 */
export function partesFor(unica) {
	return unica ? { ...partes, perPart: false, ticketSlug: partes.workshop.slug } : partes;
}

/** Fecha en una línea para las maquetas: «sábado 14 de noviembre de 2026» y «15:00 a 19:00». */
export function fechaCorta() {
	const end = eventEnd(START, END);
	return {
		dia: argDateTimeLong(START, { time: false }),
		horas: `${argTime(START)} a ${argTime(end)}`
	};
}

/** Lo que la página real recibe en `data` (para la referencia «actual»). */
export function pageData() {
	return {
		meta,
		venue,
		tickets,
		series,
		partes,
		personas,
		pronouns: {},
		relatedPosts: relacionados,
		relatedPastCount: 0,
		authorsProfiles: Promise.resolve(perfiles),
		propinas: false
	};
}

/** Los perfiles de les autores (para las tarjetas de abajo, como `authorsProfiles`). */
export const perfiles = [
	{
		path: '/amigues/colectivo-inventado',
		meta: {
			postID: 'Colectivo Inventado',
			title: 'Colectivo Inventado',
			summary: 'Un colectivo de prueba que organiza encuentros inventados de cuerdas.',
			featured: AFICHE
		}
	},
	{
		path: '/amigues/persona-de-prueba-uno',
		meta: {
			postID: 'Persona de Prueba Uno',
			title: 'Persona de Prueba Uno',
			summary: 'Perfil inventado para las maquetas.',
			featured: AFICHE
		}
	}
];

/** «Más cosas de…»: dos eventos inventados que vienen (como `relatedPosts`). */
export const relacionados = [
	{
		path: '/calendario/jornada-inventada-de-cuerdas-5',
		meta: {
			title: 'Jornada Inventada de Cuerdas · Edición 5',
			summary: 'La próxima edición inventada.',
			tags: ['KinkyVibe', 'español', 'Serie Inventada'],
			authors: meta.authors,
			start: '2026-12-12T15:00:00-03:00',
			end: '2026-12-12T19:00:00-03:00',
			status: 'anunciado',
			featured: AFICHE,
			category: 'calendario',
			link: ''
		}
	},
	{
		path: '/calendario/practica-inventada',
		meta: {
			title: 'Práctica abierta inventada',
			summary: 'Una práctica de ejemplo.',
			tags: ['español', 'gratis'],
			authors: ['Colectivo Inventado'],
			start: '2026-11-28T18:00:00-03:00',
			end: '2026-11-28T21:00:00-03:00',
			status: 'abierto',
			featured: AFICHE,
			category: 'calendario',
			link: ''
		}
	}
];

/**
 * Los estados que se pueden probar en la maqueta «final», por la URL (Mockup.svelte):
 * - `entrada`: 'parte' (por defecto: entradas por parte) | 'unica' (una sola entrada para el
 *   taller) | 'link' (sin venta acá: link de inscripción `link`/`link_text`) | 'gratis' (sin
 *   entradas ni link; evento gratis de KinkyVibe: bloque de propina);
 * - `estado`: '' | 'agotadas' | 'cerrada' | 'pronto' (la venta abre más adelante) | 'cancelado';
 * - `lugar`: 'publico' (por defecto) | 'nombre' | 'direccion' | 'zona' | 'oculto' (niveles de
 *   privacidad del lugar) | 'texto' (sin lugar vinculado: el «Dónde» del .md con link al mapa) |
 *   'online';
 * - `imagen`, `serie`, `partes`: false para probar sin afiche, sin serie o sin partes;
 * - `pasado`: el evento ya pasó;
 * - `finOtroDia`: termina pasada la medianoche (el horario dice el día del final).
 * @typedef {{ entrada: string, estado: string, lugar: string, imagen: boolean, serie: boolean, partes: boolean, pasado: boolean, finOtroDia?: boolean }} Opciones
 */

/** @type {Opciones} */
export const POR_DEFECTO = {
	entrada: 'parte',
	estado: '',
	lugar: 'publico',
	imagen: true,
	serie: true,
	partes: true,
	pasado: false
};

/**
 * Los datos de la maqueta para unas opciones.
 * @param {Opciones} o
 */
export function escenario(o) {
	const cancelado = o.estado === 'cancelado';
	/** @type {Record<string, any>} */
	const m = { ...meta, status: cancelado ? 'cancelado' : meta.status, link: '', link_text: '' };
	if (!o.imagen) delete m.featured;
	if (o.finOtroDia) m.end = '2026-11-15T02:00:00-03:00';
	if (!o.serie) m.tags = m.tags.filter((/** @type {string} */ t) => t !== 'Serie Inventada');
	if (o.entrada === 'link') {
		m.link = 'https://example.invalid/inscripcion';
		m.link_text = 'Inscribirme';
	}
	if (o.entrada === 'gratis') {
		m.tags = m.tags.map((/** @type {string} */ t) => (t === 'pago' ? 'gratis' : t));
	}

	/** @type {import('$lib/utils/venues.js').VenueView | null} */
	let v = venue;
	if (o.lugar === 'nombre') v = { level: 'name', name: venue.name, href: venue.href };
	if (o.lugar === 'direccion') {
		const { address, area, city, lat, lng } = venue;
		v = { level: 'address', address, area, city, lat, lng };
	}
	if (o.lugar === 'zona') v = { level: 'area', area: venue.area, city: venue.city };
	if (o.lugar === 'oculto') v = { level: 'hidden' };
	if (o.lugar === 'texto' || o.lugar === 'online') v = null;
	if (o.lugar === 'texto') {
		m.location = 'Calle de Ejemplo 456, Ciudad de Ejemplo';
		m.location_map = 'https://www.openstreetmap.org/?mlat=-34.6&mlon=-58.4';
	}

	const conVenta = o.entrada === 'parte' || o.entrada === 'unica';
	/** @type {Record<string, any> | null} */
	let t = conVenta ? { ...tickets } : null;
	if (t && o.estado === 'agotadas') Object.assign(t, { open: false, reason: 'soldout' });
	if (t && o.estado === 'cerrada') Object.assign(t, { open: false, reason: 'closed' });
	if (t && o.estado === 'pronto') {
		Object.assign(t, {
			open: false,
			reason: 'notyet',
			opensAt: Date.parse('2026-10-20T12:00:00-03:00')
		});
	}
	if (t && cancelado) Object.assign(t, { open: false, reason: 'cancelled' });

	const s = o.serie
		? { ...series, list: series.list.map((x) => ({ ...x, past: o.pasado })) }
		: null;
	const p = o.partes ? partesFor(o.entrada === 'unica') : null;
	return { meta: m, venue: v, tickets: t, series: s, partes: p, personas };
}
