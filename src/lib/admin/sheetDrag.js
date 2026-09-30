/**
 * Cuentas del gesto de "deslizar para cerrar" del panel "Más" (la hoja de abajo en el celu).
 * Sin DOM, para poder probarlas.
 */

/** Parte de la altura de la hoja que hay que arrastrar para cerrarla. */
export const SHEET_CLOSE_RATIO = 0.25;
/** Límites de esa distancia, en px (hojas muy bajas o muy altas). */
export const SHEET_CLOSE_MIN = 60;
export const SHEET_CLOSE_MAX = 160;
/** Un tirón rápido (px/ms) cierra aunque no llegue a la distancia... */
export const SHEET_FLICK_VELOCITY = 0.6;
/** ...si se movió al menos esto (px), para no cerrar con un toque. */
export const SHEET_FLICK_MIN = 24;
/** Menos que esto (px) cuenta como toque, no como arrastre. */
export const SHEET_TAP_SLOP = 6;

/**
 * Cuánto se baja la hoja mientras se arrastra: solo hacia abajo (hacia arriba no se mueve).
 * @param {number} startY
 * @param {number} currentY
 */
export function sheetDragOffset(startY, currentY) {
	const dy = currentY - startY;
	return Number.isFinite(dy) && dy > 0 ? dy : 0;
}

/**
 * Distancia a arrastrar para cerrar una hoja de esta altura.
 * @param {number} height
 */
export function sheetCloseDistance(height) {
	const h = Number.isFinite(height) && height > 0 ? height : 0;
	return Math.min(SHEET_CLOSE_MAX, Math.max(SHEET_CLOSE_MIN, h * SHEET_CLOSE_RATIO));
}

/**
 * Al soltar: ¿se cierra o vuelve a su lugar?
 * @param {{ offset: number, velocity?: number, height: number }} drag
 *   offset: px arrastrados hacia abajo; velocity: px/ms al soltar (positivo = hacia abajo).
 */
export function shouldCloseSheet({ offset, velocity = 0, height }) {
	if (!(offset > 0)) return false;
	if (offset >= sheetCloseDistance(height)) return true;
	return velocity >= SHEET_FLICK_VELOCITY && offset >= SHEET_FLICK_MIN;
}
