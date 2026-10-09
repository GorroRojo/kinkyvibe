/**
 * ¿Un evento tiene la etiqueta «Online» y también un lugar de verdad? Entonces partes del sitio
 * no se ponen de acuerdo: la venta de entradas (`isOnlineEvent` en ticketsEditor.js) lo trata
 * como online si no tiene `location` (aunque tenga `location_name` o un lugar vinculado) y manda
 * el link de la transmisión en vez del QR, mientras la página muestra el lugar.
 *
 * Es solo un aviso (no cambia nada ni bloquea guardar): lo muestran el editor del evento, la
 * ficha del panel y «Para revisar» del Inicio, con su lista en Panel → Eventos (docs/panel.md).
 *
 * Pura: sin base ni tag manager, así corre igual en el navegador, en el servidor y en vitest.
 */
import { ONLINE_WORDS, normalizePlaceText } from './venueImport.js';

/** Lo que se le dice a quien edita (editor y ficha). */
export const ONLINE_MISMATCH_TEXT =
	'Este evento tiene un lugar y también la etiqueta «Online». ¿Es presencial? Si es así, sacale la etiqueta; si es online, sacale el lugar.';

/**
 * Las formas de escribir la etiqueta Online en un evento: «Online» y los alias que acepta el
 * editor para el lugar (`EVENT_ALIASES` de adminTags.js: «online», «virtual»).
 */
const ONLINE_TAGS = new Set(['online', 'virtual']);

/**
 * ¿Tiene la etiqueta Online? Sin importar mayúsculas, tildes ni espacios.
 * @param {unknown} tags
 */
export function hasOnlineTag(tags) {
	const list = Array.isArray(tags) ? tags : [];
	return list.some((t) => ONLINE_TAGS.has(normalizePlaceText(t)));
}

/**
 * ¿El texto dice un lugar? Vacío, «Online», «Virtual», «Zoom»… no cuentan.
 * @param {unknown} v
 */
function isRealPlaceText(v) {
	const text = normalizePlaceText(v);
	return text !== '' && !ONLINE_WORDS.has(text);
}

/**
 * ¿Tiene la etiqueta Online y además un lugar? Un lugar es un lugar vinculado (edge `lugar`) o un
 * «Dónde» en texto libre (`location` o `location_name`) que no sea «Online», «Virtual», «Zoom»…
 * `modalidad` no cuenta: aunque diga cuál es, la etiqueta sigue confundiendo filtros y listas.
 *
 * @param {Record<string, unknown> | null | undefined} meta el frontmatter (`tags`, `location`,
 *   `location_name`)
 * @param {{ hasVenue?: boolean }} [opts] `hasVenue`: el evento tiene un lugar vinculado
 */
export function onlineTagMismatch(meta, { hasVenue = false } = {}) {
	if (!meta || !hasOnlineTag(meta.tags)) return false;
	return hasVenue || isRealPlaceText(meta.location) || isRealPlaceText(meta.location_name);
}
