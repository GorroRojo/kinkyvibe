/**
 * «Qué falta» de un evento: lo que la página pública del evento (y las listas) necesitan para
 * verse completas y que todavía no tiene. Lo usan los borradores de la agenda (el indicador en el
 * calendario y en la planilla), «Confirmar» (se muestra antes de publicarlo) y la ficha.
 *
 * - `eventMissing`: la lista, a partir de los datos ya normalizados (`MissingInput`);
 * - `missingInputFromMeta`: esos datos a partir del frontmatter de un evento;
 * - `missingSummary`: «Falta: imagen, precio» para un tooltip o un aria-label.
 */
import { splitEventTags } from './adminTags.js';

/**
 * @typedef {object} MissingInput
 * @prop {boolean} image tiene imagen (`featured`)
 * @prop {string} summary el resumen de las listas
 * @prop {string} location dirección
 * @prop {string} locationName nombre del lugar
 * @prop {string[]} tags etiquetas (región y precio salen de acá)
 * @prop {string[]} authors organizan
 * @prop {string} link link de inscripción
 * @prop {boolean} tickets vende entradas en el sitio (`tickets` en el frontmatter)
 * @prop {string} [status] anunciado | abierto | agotadas | cancelado: «anunciado» no muestra el
 *   link (así quedan los borradores copiados de otra edición, con el link viejo)
 */

/**
 * @typedef {{ id: MissingId, label: string, detail: string }} MissingItem
 * @typedef {'imagen' | 'resumen' | 'donde' | 'region' | 'precio' | 'inscripcion' | 'organizan'} MissingId
 */

/** Todo lo que se revisa, en el orden en que se muestra. */
export const MISSING_CHECKS = /** @type {const} */ ([
	{ id: 'imagen', label: 'Imagen', detail: 'Sin imagen se ve un degradé en las listas.' },
	{ id: 'resumen', label: 'Resumen', detail: 'El texto corto de las listas y al compartirlo.' },
	{ id: 'donde', label: 'Dónde', detail: 'Ni nombre del lugar ni dirección.' },
	{ id: 'region', label: 'Región', detail: 'AMBA, Córdoba, Online…: para los filtros.' },
	{ id: 'precio', label: 'Precio', detail: 'Pago, gratis o a la gorra.' },
	{
		id: 'inscripcion',
		label: 'Link o entradas',
		detail: 'No hay cómo anotarse (o el estado es «anunciado» y el link no se muestra).'
	},
	{ id: 'organizan', label: 'Organizan', detail: 'Quién lo organiza.' }
]);

/** @param {unknown} v */
const text = (v) => (typeof v === 'string' ? v.trim() : v == null ? '' : String(v).trim());
/** @param {unknown} v @returns {string[]} */
const list = (v) =>
	(Array.isArray(v) ? v : v ? [v] : []).map((x) => text(x)).filter((x) => x.length > 0);

/**
 * Lo que le falta a un evento ([] = está completo).
 * @param {MissingInput} e
 * @returns {MissingItem[]}
 */
export function eventMissing(e) {
	const tags = splitEventTags(list(e.tags));
	const online = tags.place === 'Online';
	/** @type {Record<MissingId, boolean>} */
	const missing = {
		imagen: !e.image,
		resumen: !text(e.summary),
		donde: !online && !text(e.location) && !text(e.locationName),
		region: !tags.place,
		precio: !tags.prices.length,
		inscripcion: !e.tickets && (!text(e.link) || e.status === 'anunciado'),
		organizan: !list(e.authors).length
	};
	return MISSING_CHECKS.filter((c) => missing[c.id]).map((c) => ({ ...c }));
}

/**
 * Los datos de `eventMissing` a partir del frontmatter (el del bundle o el leído del repo).
 * @param {Record<string, any> | null | undefined} meta
 * @returns {MissingInput}
 */
export function missingInputFromMeta(meta) {
	const m = meta ?? {};
	return {
		image: Boolean(text(m.featured)),
		summary: text(m.summary),
		location: text(m.location),
		locationName: text(m.location_name),
		tags: list(m.tags),
		authors: list(m.authors),
		link: text(m.link),
		tickets: Array.isArray(m.tickets) && m.tickets.length > 0,
		status: text(m.status)
	};
}

/**
 * «Falta: imagen, precio» ('' si no falta nada).
 * @param {readonly Pick<MissingItem, 'label'>[]} items
 */
export function missingSummary(items) {
	if (!items.length) return '';
	return `Falta: ${items.map((i) => i.label.toLowerCase()).join(', ')}`;
}

/**
 * Avisos de «Revisar antes de publicar» (/admin/eventos/nuevo): lo de «Qué falta» más dos cosas
 * que se escapan seguido. Son avisos, no bloquean: se puede publicar igual.
 *
 * - el estado es «Abierto» pero no hay cómo anotarse (ni link ni entradas);
 * - tiene la etiqueta Online pero también una dirección o un lugar (o al revés: una región
 *   presencial sin lugar, que en la revisión se lee como «Online»).
 *
 * @param {MissingInput & { venue?: boolean }} e `venue`: se eligió un lugar de la lista (la
 *   dirección sale de ahí)
 * @returns {MissingItem[]}
 */
export function publishWarnings(e) {
	const withVenue = { ...e, locationName: e.venue ? e.locationName || 'lugar' : e.locationName };
	const items = eventMissing(withVenue);
	const tags = splitEventTags(list(e.tags));
	const hasPlace = Boolean(e.venue || text(e.location) || text(e.locationName));
	/** @type {MissingItem[]} */
	const out = items.map((i) => {
		if (i.id === 'inscripcion' && e.status === 'abierto')
			return {
				...i,
				detail:
					'Está «Abierto» pero no tiene link de inscripción ni entradas: no hay cómo anotarse.'
			};
		if (i.id === 'donde' && tags.place)
			return {
				...i,
				detail: `Tiene la región «${tags.place}» pero no dice dónde (en la revisión figura como Online).`
			};
		return i;
	});
	if (tags.place === 'Online' && hasPlace) {
		out.push({
			id: 'donde',
			label: 'Online o presencial',
			detail: 'Tiene la etiqueta Online pero también un lugar o una dirección: revisá cuál va.'
		});
	}
	return out;
}
