/**
 * Datos INVENTADOS para las maquetas de la página de un evento (/estilo/evento/<opcion>, solo en
 * previews y en dev). Reproducen el caso que gorrite marcó como desordenado: con afiche, de una
 * serie, parte de un taller en varias partes, con texto largo, varias personas con rol,
 * etiquetas, venta de entradas y lugar con mapa, «Cómo llegar» y «Accesibilidad».
 * Ninguna persona, lugar ni dato es real.
 */
import { argDateTimeLong, argTime, eventEnd } from '$lib/utils/dates.js';

/** Afiche inventado (SVG en línea: sin archivos ni pedidos a otros sitios). */
const AFICHE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1000" viewBox="0 0 800 1000">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#6a0dad"/><stop offset="1" stop-color="#f43fb4"/></linearGradient></defs>
<rect width="800" height="1000" fill="url(#g)"/>
<g fill="none" stroke="#fff" stroke-opacity=".35" stroke-width="10">
<path d="M-40 260 C 200 120, 600 420, 840 240"/><path d="M-40 340 C 220 200, 580 500, 840 320"/>
<path d="M-40 420 C 240 280, 560 580, 840 400"/></g>
<text x="400" y="640" fill="#fff" font-family="sans-serif" font-size="78" font-weight="700" text-anchor="middle">AFICHE</text>
<text x="400" y="730" fill="#fff" font-family="sans-serif" font-size="78" font-weight="700" text-anchor="middle">DE EJEMPLO</text>
<text x="400" y="830" fill="#fff" fill-opacity=".85" font-family="sans-serif" font-size="34" text-anchor="middle">datos inventados</text>
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

/** Taller en varias partes (como `loadPartes`); entradas por parte. */
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
		relatedPosts: [],
		relatedPastCount: 0,
		authorsProfiles: Promise.resolve([]),
		propinas: false
	};
}
