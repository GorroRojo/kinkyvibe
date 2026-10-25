/**
 * Lo mínimo para un menú que flota debajo de un campo (el buscador de etiquetas, TagSearch), sin
 * librerías: antes lo hacía @melt-ui (con @floating-ui), que sumaba mucho JavaScript a cada lista.
 * Hace lo mismo que hacía esa combinación con la configuración de TagSearch:
 *
 * - `placeMenu`: debajo del campo, alineado a su izquierda y separado 6 px; si no entra, prueba
 *   alinearlo a la derecha, arriba a la izquierda y arriba a la derecha, en ese orden, y si no
 *   entra en ninguna, la que menos se sale (`flip` de floating-ui, con 8 px de margen); después lo
 *   corre de costado para que no se salga de la pantalla (`shift`, 8 px).
 * - `floatingMenu`: la acción que lleva el menú al final de `<body>` (para que ningún contenedor
 *   lo recorte ni lo tape) y lo reubica mientras está abierto, en cada cuadro en que el campo se
 *   movió o cambió de tamaño (al bajar la página, al sumar una etiqueta, si algo de arriba carga).
 * - `outsidePress`: avisa cuando se toca o se hace clic fuera del menú (como `interact-outside`
 *   de melt-ui: el toque tiene que empezar y terminar afuera, y no cuenta si algún elemento
 *   cortó la propagación de alguno de sus eventos).
 */

/** @typedef {{ x: number, y: number, width: number, height: number }} Rect */
/** @typedef {'bottom-start' | 'bottom-end' | 'top-start' | 'top-end'} Placement */

const GUTTER = 6;
const PADDING = 8;
/** @type {Placement[]} */
const PLACEMENTS = ['bottom-start', 'bottom-end', 'top-start', 'top-end'];

/**
 * Las coordenadas (sin separación) del menú en una ubicación.
 * @param {Rect} ref @param {{ width: number, height: number }} float @param {Placement} p
 */
function coords(ref, float, p) {
	return {
		x: p.endsWith('start') ? ref.x : ref.x + ref.width - float.width,
		y: p.startsWith('bottom') ? ref.y + ref.height : ref.y - float.height
	};
}

/**
 * Dónde va el menú, todo en coordenadas de la pantalla.
 *
 * @param {Rect} ref el campo
 * @param {{ width: number, height: number }} float el menú
 * @param {Rect} view la pantalla
 * @returns {{ x: number, y: number, placement: Placement }}
 */
export function placeMenu(ref, float, view) {
	/** @param {{ x: number, y: number }} c */
	const overflow = (c) => ({
		top: view.y - c.y + PADDING,
		bottom: c.y + float.height - (view.y + view.height) + PADDING,
		left: view.x - c.x + PADDING,
		right: c.x + float.width - (view.x + view.width) + PADDING
	});
	/** @type {{ placement: Placement, overflows: number[] }[]} */
	const tried = [];
	/** @type {Placement | undefined} */
	let placement;
	for (const p of PLACEMENTS) {
		const o = overflow(coords(ref, float, p));
		// el lado de la ubicación y los dos de la alineación (como `flip`, que mira primero el
		// lado de la alineación del que se saldría: con el campo más ancho que el menú, el otro)
		let align = p.endsWith('start') ? 'right' : 'left';
		if (ref.width > float.width) align = align == 'right' ? 'left' : 'right';
		const other = align == 'right' ? 'left' : 'right';
		const side = p.startsWith('bottom') ? 'bottom' : 'top';
		const overflows = [o[side], o[/** @type {'left'|'right'} */ (align)], o[other]];
		tried.push({ placement: p, overflows });
		if (overflows.every((v) => v <= 0)) {
			placement = p;
			break;
		}
	}
	if (!placement) {
		placement =
			tried.filter((d) => d.overflows[0] <= 0).sort((a, b) => a.overflows[1] - b.overflows[1])[0]
				?.placement ??
			tried
				.map((d) => ({ p: d.placement, sum: d.overflows.reduce((s, v) => s + Math.max(v, 0), 0) }))
				.sort((a, b) => a.sum - b.sum)[0].p;
	}
	const c = coords(ref, float, placement);
	c.y += placement.startsWith('bottom') ? GUTTER : -GUTTER;
	// shift: que no se salga de costado (si no entra, gana el borde izquierdo)
	const min = view.x + PADDING;
	const max = view.x + view.width - PADDING - float.width;
	c.x = Math.max(min, Math.min(c.x, max));
	return { ...c, placement };
}

/** La parte visible de la pantalla (como floating-ui: el viewport visual si lo hay). */
function viewport() {
	const vv = window.visualViewport;
	const html = document.documentElement;
	if (!vv) return { x: 0, y: 0, width: html.clientWidth, height: html.clientHeight };
	// En Safari (WebKit) el viewport visual ya está en las coordenadas de la página.
	const webkit = typeof CSS != 'undefined' && CSS.supports?.('-webkit-backdrop-filter', 'none');
	return {
		x: webkit ? 0 : vv.offsetLeft,
		y: webkit ? 0 : vv.offsetTop,
		width: vv.width,
		height: vv.height
	};
}

/**
 * Acción: el menú va al final de `<body>` y, mientras `open`, flota junto al elemento que da
 * `anchor()` (se pide cada vez: así no depende de cuándo se enlazó el elemento).
 *
 * @param {HTMLElement} node
 * @param {{ anchor: () => HTMLElement | undefined, open: boolean }} params
 */
export function floatingMenu(node, params) {
	document.body.appendChild(node);
	let frame = 0;
	let last = '';
	function place() {
		const anchor = params.anchor();
		if (!anchor?.isConnected) return;
		const r = anchor.getBoundingClientRect();
		const f = node.getBoundingClientRect();
		// todavía oculto (recién se abrió): en el próximo cuadro
		if (!f.width && !f.height) return;
		const view = viewport();
		const key = [r.x, r.y, r.width, r.height, f.width, f.height, view.width, view.height].join();
		if (key == last) return;
		last = key;
		const pos = placeMenu(r, f, view);
		// relativo a su contenedor posicionado (<body>, `position: relative`)
		const parent = /** @type {HTMLElement} */ (node.offsetParent ?? document.body);
		const pr = parent.getBoundingClientRect();
		node.style.position = 'absolute';
		node.style.left = `${Math.round(pos.x - pr.left - parent.clientLeft)}px`;
		node.style.top = `${Math.round(pos.y - pr.top - parent.clientTop)}px`;
		node.dataset.side = pos.placement.split('-')[0];
	}
	function loop() {
		place();
		frame = requestAnimationFrame(loop);
	}
	/** @param {typeof params} p */
	function update(p) {
		params = p;
		cancelAnimationFrame(frame);
		last = '';
		if (p.open) loop();
	}
	update(params);
	return {
		update,
		destroy() {
			cancelAnimationFrame(frame);
			node.remove();
		}
	};
}

const DOWN = ['pointerdown', 'mousedown', 'touchstart'];
const UP = ['pointerup', 'mouseup', 'touchend', 'click'];

/**
 * Avisa (`onOutside`) cuando un toque o un clic empieza y termina fuera de `node` (y fuera de
 * lo que diga `ignore`). Como melt-ui: si algún elemento cortó la propagación de cualquiera de los
 * eventos del toque (por ejemplo los botones del campo, con `stopPropagation`), no cuenta.
 *
 * @param {HTMLElement} node
 * @param {{ ignore: (target: Element) => boolean, onOutside: () => void }} opts
 * @returns {() => void} para dejar de escuchar
 */
export function outsidePress(node, opts) {
	/** @type {Record<string, boolean>} */
	const intercepted = {};
	let down = false;
	let downInside = false;
	/** @type {ReturnType<typeof setTimeout> | undefined} */
	let downTimer;
	/** @type {ReturnType<typeof setTimeout> | undefined} */
	let upTimer;
	/** @type {ReturnType<typeof setTimeout> | undefined} */
	let resetTimer;
	const anyIntercepted = () => Object.values(intercepted).some(Boolean);
	/** @param {Event} e */
	const isOutside = (e) =>
		!('button' in e && /** @type {MouseEvent} */ (e).button > 0) &&
		e.target instanceof Element &&
		document.documentElement.contains(e.target) &&
		!node.contains(e.target);
	/** @param {Event} e */
	function capture(e) {
		intercepted[e.type] = true;
		if (UP.includes(e.type)) {
			clearTimeout(resetTimer);
			resetTimer = setTimeout(() => {
				for (const k in intercepted) intercepted[k] = false;
			}, 20);
		}
	}
	/** @param {Event} e */
	function bubble(e) {
		intercepted[e.type] = false;
		if (DOWN.includes(e.type)) {
			clearTimeout(downTimer);
			downTimer = setTimeout(() => {
				if (anyIntercepted()) return;
				if (e.target instanceof Element && node.contains(e.target)) downInside = true;
				down = true;
			}, 10);
		} else {
			clearTimeout(upTimer);
			upTimer = setTimeout(() => {
				if (!anyIntercepted() && down && !downInside && isOutside(e) && !e.defaultPrevented) {
					if (!opts.ignore(/** @type {Element} */ (e.target))) opts.onOutside();
				}
				down = downInside = false;
			}, 10);
		}
	}
	for (const t of [...DOWN, ...UP]) {
		document.addEventListener(t, capture, true);
		document.addEventListener(t, bubble);
	}
	return () => {
		for (const t of [...DOWN, ...UP]) {
			document.removeEventListener(t, capture, true);
			document.removeEventListener(t, bubble);
		}
		clearTimeout(downTimer);
		clearTimeout(upTimer);
		clearTimeout(resetTimer);
	};
}
