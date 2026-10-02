/**
 * «Lugar» en el formulario de eventos (crear y editar): elegir un perfil de lugar y qué se
 * muestra de su dirección en este evento. Lo que se elige no va al .md: se guarda en
 * `event_venues` (ver docs/amigues.md y src/lib/server/amigues/eventFormVenue.js), así que el
 * formulario lo manda en campos aparte del archivo.
 *
 * Funciones puras (sin Svelte ni base): corren en el navegador, en el servidor y en vitest.
 */
import { VISIBILITY_LABELS } from '$lib/admin/cuentas.js';
import { eventPrivacyText, isVenuePrivacy } from './venues.js';
import { foldText } from './text.js';

/** @typedef {import('./venues.js').VenuePrivacy} VenuePrivacy */

/**
 * Un lugar para elegir (lo que manda el servidor al formulario; nunca la dirección completa:
 * solo barrio y ciudad, para distinguir lugares con el mismo nombre).
 * @typedef {object} VenueOption
 * @prop {number} id
 * @prop {string} slug
 * @prop {string} title
 * @prop {string} visibility `public`, `members` u `hidden`
 * @prop {boolean} unlisted no aparece en la lista de /amigues
 * @prop {boolean} approved aprobado para el sitio (los que cargan las cuentas, hasta que une admin
 *   los aprueba, no)
 * @prop {VenuePrivacy | null} privacy su nivel por defecto
 * @prop {string} area
 * @prop {string} city
 */

/**
 * Lo elegido: el lugar (`null`: sin lugar) y el nivel para este evento (`null`: igual que el lugar).
 * @typedef {{ venueId: number | null, privacy: VenuePrivacy | null }} VenueChoice
 */

/** Los nombres de los campos del formulario (fuera del .md). */
export const VENUE_FORM_FIELDS = Object.freeze({
	venue: 'lugar',
	privacy: 'lugarPrivacidad',
	/** `1` si se cambió algo: sin tocar el «Lugar», guardar no toca `event_venues`. */
	touched: 'lugarCambio'
});

/** Sin lugar. @type {VenueChoice} */
export const NO_VENUE = Object.freeze({ venueId: null, privacy: null });

/**
 * Lo elegido, limpio (un id que no es un número entero positivo es «sin lugar»; un nivel que no
 * existe es «igual que el lugar»; sin lugar no hay nivel).
 * @param {unknown} venueId
 * @param {unknown} privacy
 * @returns {VenueChoice}
 */
export function venueChoice(venueId, privacy) {
	const n = typeof venueId === 'string' && venueId.trim() !== '' ? Number(venueId) : venueId;
	if (typeof n !== 'number' || !Number.isSafeInteger(n) || n <= 0) return { ...NO_VENUE };
	return { venueId: n, privacy: isVenuePrivacy(privacy) ? privacy : null };
}

/**
 * ¿Cambió lo elegido respecto de lo que había?
 * @param {VenueChoice} a
 * @param {VenueChoice} b
 */
export function sameVenueChoice(a, b) {
	return a.venueId === b.venueId && (a.venueId === null || a.privacy === b.privacy);
}

/**
 * Lo que mandó el formulario: `null` si el «Lugar» no se tocó (o el formulario no lo tiene), si
 * no lo elegido.
 * @param {{ get(name: string): unknown }} form un FormData
 * @returns {VenueChoice | null}
 */
export function readVenueChoice(form) {
	if (String(form.get(VENUE_FORM_FIELDS.touched) ?? '') !== '1') return null;
	return venueChoice(
		String(form.get(VENUE_FORM_FIELDS.venue) ?? ''),
		String(form.get(VENUE_FORM_FIELDS.privacy) ?? '')
	);
}

/**
 * Los valores de los campos ocultos del formulario.
 * @param {VenueChoice} choice
 * @param {boolean} touched
 * @returns {Record<string, string>}
 */
export function venueChoiceFields(choice, touched) {
	return {
		[VENUE_FORM_FIELDS.venue]: choice.venueId === null ? '' : String(choice.venueId),
		[VENUE_FORM_FIELDS.privacy]: choice.venueId === null ? '' : (choice.privacy ?? ''),
		[VENUE_FORM_FIELDS.touched]: touched ? '1' : ''
	};
}

/**
 * Las marcas de un lugar en el buscador: no se ve para todes, no aparece en la lista, sin aprobar.
 * @param {VenueOption} v
 * @returns {string[]}
 */
export function venueOptionMarks(v) {
	/** @type {Record<string, string>} */
	const visibility = VISIBILITY_LABELS;
	return [
		v.visibility !== 'public' ? (visibility[v.visibility] ?? v.visibility) : '',
		v.unlisted ? 'No listado' : '',
		v.approved ? '' : 'Sin aprobar'
	].filter(Boolean);
}

/**
 * Barrio y ciudad, para distinguir lugares con el mismo nombre.
 * @param {VenueOption} v
 */
export function venueOptionPlace(v) {
	return [v.area, v.city].filter(Boolean).join(', ');
}

/**
 * Los lugares que coinciden con lo que se escribió (nombre, dirección en el sitio, barrio o
 * ciudad; sin importar tildes ni mayúsculas), primero los que empiezan así. Sin texto, los
 * primeros `limit` en orden.
 * @param {readonly VenueOption[]} venues
 * @param {string} query
 * @param {number} [limit]
 * @returns {VenueOption[]}
 */
export function searchVenues(venues, query, limit = 8) {
	const q = foldText(query);
	if (!q) return venues.slice(0, limit);
	/** @type {{ v: VenueOption, rank: number }[]} */
	const hits = [];
	for (const v of venues) {
		const title = foldText(v.title);
		const rest = foldText([v.slug.replace(/-/g, ' '), v.area, v.city].join(' '));
		const rank = title.startsWith(q) ? 0 : title.includes(q) ? 1 : rest.includes(q) ? 2 : -1;
		if (rank >= 0) hits.push({ v, rank });
	}
	return hits
		.sort((a, b) => a.rank - b.rank)
		.slice(0, limit)
		.map((h) => h.v);
}

/**
 * Lo elegido en palabras (el resumen antes de publicar, la ficha del evento): «Nombre · Qué se
 * muestra», o `''` sin lugar.
 * @param {VenueChoice} choice
 * @param {readonly VenueOption[]} venues
 */
export function venueChoiceText(choice, venues) {
	if (choice.venueId === null) return '';
	const v = venues.find((x) => x.id === choice.venueId);
	if (!v) return '';
	return `${v.title} · ${eventPrivacyText(choice.privacy, v.privacy)}`;
}
