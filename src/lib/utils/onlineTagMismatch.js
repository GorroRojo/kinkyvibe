/**
 * ¿Un evento tiene la etiqueta «Online» y también un lugar de verdad? Entonces partes del sitio
 * no se ponen de acuerdo: la venta de entradas (`isOnlineEvent` en eventPlace.js) lo trata
 * como online si no tiene `location` (aunque tenga `location_name` o un lugar vinculado) y manda
 * el link de la transmisión en vez del QR, mientras la página muestra el lugar.
 *
 * Es solo un aviso (no cambia nada ni bloquea guardar): lo muestran el editor del evento, la
 * ficha del panel y «Para revisar» del Inicio, con su lista en Panel → Eventos (docs/panel.md).
 *
 * Pura: sin base ni tag manager, así corre igual en el navegador, en el servidor y en vitest.
 */
import { hasOnlineTag, isOnlineWord, normalizePlaceText } from './eventPlace.js';

/** Lo que se le dice a quien edita (editor, ficha y «Revisar antes de publicar»). */
export const ONLINE_MISMATCH_TEXT =
	'Este evento tiene un lugar y también la etiqueta «Online». ¿Es presencial? Si es así, sacale la etiqueta; si es online, sacale el lugar.';

// Vive en eventPlace.js (con la regla de online); acá queda para quien ya la usaba.
export { hasOnlineTag };

/**
 * ¿El texto dice un lugar? Vacío, «Online», «Virtual», «Zoom»… no cuentan.
 * @param {unknown} v
 */
function isRealPlaceText(v) {
	return normalizePlaceText(v) !== '' && !isOnlineWord(v);
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
