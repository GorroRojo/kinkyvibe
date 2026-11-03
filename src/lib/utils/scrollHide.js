/**
 * ¿Se esconde el botón flotante de buscar (SearchButton, `variant="fab"`) con el scroll? Se va al
 * bajar y vuelve al subir o cerca de arriba, así no tapa los botones de las listas mientras se lee
 * (auditoría de UX, V22). Pura: la usa el botón y la prueban los tests.
 *
 * Nunca se esconde con el foco adentro: eso lo decide el botón (`focused`), no el scroll.
 */

/** Hasta acá desde arriba (px) el botón siempre se ve. */
export const TOP_ZONE = 80;
/** Lo mínimo que hay que moverse (px) para cambiar: el temblor del dedo no lo hace parpadear. */
export const TOLERANCE = 8;

/**
 * @param {{ y: number, lastY: number, hidden: boolean }} state `y`: el scroll de ahora;
 *   `lastY`: el de la última vez que se decidió; `hidden`: si estaba escondido
 * @returns {{ hidden: boolean, lastY: number }} lo nuevo (y desde dónde medir la próxima vez)
 */
export function scrollHide({ y, lastY, hidden }) {
	const top = Math.max(0, y);
	if (top <= TOP_ZONE) return { hidden: false, lastY: top };
	const delta = top - lastY;
	if (Math.abs(delta) < TOLERANCE) return { hidden, lastY };
	return { hidden: delta > 0, lastY: top };
}
