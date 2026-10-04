import { SHEET_TAP_SLOP, sheetDragOffset, shouldCloseSheet } from './sheetDrag.js';

/**
 * Acción de Svelte para «deslizar hacia abajo para cerrar» una hoja del celu (las cuentas están en
 * sheetDrag.js, con pruebas). Va en la manija o el encabezado de la hoja; `sheet` es el elemento
 * que se mueve y `onClose` se llama si se suelta lo bastante abajo (o con un tirón rápido). Los
 * botones y links del encabezado siguen andando. La hoja igual lleva su botón X (decisión de
 * gorrite: arrastrar y X, las dos).
 *
 *   <header use:sheetDrag={{ sheet: sheetEl, onClose: () => (open = false) }}>
 *
 * @param {HTMLElement} node
 * `media` (opcional): media query en la que anda el gesto (por ejemplo solo en el celu).
 *
 * @param {{ sheet?: HTMLElement | null, onClose: () => void, enabled?: boolean, media?: string }} params
 */
export function sheetDrag(node, params) {
	let p = params;
	/** @type {{ id: number, startY: number, lastY: number, lastT: number, velocity: number } | null} */
	let drag = null;
	let dragging = false;
	let offset = 0;

	const target = () => p.sheet ?? node;
	/** @param {number} y */
	const move = (y) => {
		target().style.transform = y ? `translateY(${y}px)` : '';
	};

	/** @param {PointerEvent} e */
	function down(e) {
		if (p.enabled === false || (e.pointerType === 'mouse' && e.button !== 0)) return;
		if (p.media && !window.matchMedia(p.media).matches) return;
		if (e.target instanceof Element && e.target.closest('button, a, input, select, textarea'))
			return;
		drag = {
			id: e.pointerId,
			startY: e.clientY,
			lastY: e.clientY,
			lastT: e.timeStamp,
			velocity: 0
		};
	}
	/** @param {PointerEvent} e */
	function pmove(e) {
		if (!drag || e.pointerId !== drag.id) return;
		offset = sheetDragOffset(drag.startY, e.clientY);
		if (!dragging) {
			if (offset < SHEET_TAP_SLOP) return;
			dragging = true;
			node.setPointerCapture?.(e.pointerId);
			target().style.transition = 'none';
		}
		const dt = e.timeStamp - drag.lastT;
		if (dt > 0) drag.velocity = (e.clientY - drag.lastY) / dt;
		drag.lastY = e.clientY;
		drag.lastT = e.timeStamp;
		move(offset);
	}
	/** @param {PointerEvent} e */
	function up(e) {
		if (!drag || e.pointerId !== drag.id) return;
		const { velocity } = drag;
		drag = null;
		if (!dragging) return;
		dragging = false;
		target().style.transition = '';
		const height = target().offsetHeight;
		const close = e.type !== 'pointercancel' && shouldCloseSheet({ offset, velocity, height });
		move(0);
		offset = 0;
		if (close) p.onClose();
	}

	node.addEventListener('pointerdown', down);
	node.addEventListener('pointermove', pmove);
	node.addEventListener('pointerup', up);
	node.addEventListener('pointercancel', up);
	node.style.touchAction = 'none';
	return {
		/** @param {typeof params} next */
		update(next) {
			p = next;
		},
		destroy() {
			node.removeEventListener('pointerdown', down);
			node.removeEventListener('pointermove', pmove);
			node.removeEventListener('pointerup', up);
			node.removeEventListener('pointercancel', up);
		}
	};
}
