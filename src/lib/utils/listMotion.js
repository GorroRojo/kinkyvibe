/**
 * Gentle motion for a keyed list whose items are `<li data-key>` children of `list`:
 * items that stay glide to their new place (FLIP), new items fade in, removed items
 * fade out where they were — but only near the viewport, and in one read pass plus
 * one write pass, so it never forces a layout per item.
 *
 * Usage: call `before()` right before the DOM update and `after()` right after it.
 * Everything runs with the Web Animations API on transform/opacity (compositor only).
 * Does nothing for people who prefer reduced motion.
 */

const MOVE_MS = 200;
const ENTER_MS = 160;
const LEAVE_MS = 120;
const STAGGER_MS = 15;
const MAX_STAGGER_MS = 150;
const MAX_MOVING = 24;
const MAX_ENTERING = 16;
const MAX_LEAVING = 12;
const EASE_OUT = 'cubic-bezier(0.2, 0.7, 0.3, 1)';

const reducedMotion = () =>
	typeof matchMedia == 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Visits the list items within one screen above/below the viewport, in DOM order,
 * reading each box once. Stops at the first item more than a screen below the viewport.
 * @param {HTMLElement} list
 * @param {(li: HTMLElement, rect: DOMRect) => void} fn
 */
function forNearItems(list, fn) {
	const h = innerHeight;
	for (const li of /** @type {HTMLCollectionOf<HTMLElement>} */ (list.children)) {
		const r = li.getBoundingClientRect();
		if (r.top > 2 * h) break;
		if (r.bottom < -h) continue;
		fn(li, r);
	}
}

/**
 * @param {() => HTMLElement|undefined} getList
 */
export function listMotion(getList) {
	/** @type {Map<string, {el: HTMLElement, x: number, y: number, w: number, h: number}>|null} */
	let snap = null;
	let snapKeys = '';
	let snapClass = '';

	const keysOf = (/** @type {HTMLElement} */ list) =>
		[...list.children]
			.map((li) => /** @type {HTMLElement} */ (li).dataset.key ?? '')
			.join('|');

	return {
		/** Read pass #1 (layout is still clean here): where the near items are now. */
		before() {
			snap = null;
			const list = getList();
			if (!list || reducedMotion()) return;
			snapKeys = keysOf(list);
			snapClass = list.className;
			snap = new Map();
			forNearItems(list, (li, r) =>
				snap?.set(li.dataset.key ?? '', { el: li, x: r.left, y: r.top, w: r.width, h: r.height })
			);
		},
		/**
		 * Read pass #2 then one write pass. When the list's class changed (list <-> grid)
		 * everything rearranges, too much to glide nicely: the whole list crossfades instead.
		 */
		after() {
			const list = getList();
			const prev = snap;
			snap = null;
			if (!list || !prev) return;
			const crossfade = list.className != snapClass;
			if (!crossfade && keysOf(list) == snapKeys) return;
			if (crossfade) {
				list.animate([{ opacity: 0.25 }, { opacity: 1 }], { duration: 180, easing: 'ease-out' });
				return;
			}
			// Positions are compared on screen (viewport), not in the document: when the page
			// was scrolled to keep the used control in place, items glide from where they
			// were seen instead of jumping by the scroll amount.
			/** @type {Array<[HTMLElement, number, number]>} */
			const moves = [];
			/** @type {HTMLElement[]} */
			const entering = [];
			// read
			forNearItems(list, (li, r) => {
				const old = prev.get(li.dataset.key ?? '');
				if (old && old.el == li) {
					const dx = old.x - r.left,
						dy = old.y - r.top;
					if ((Math.abs(dx) > 1 || Math.abs(dy) > 1) && moves.length < MAX_MOVING)
						moves.push([li, dx, dy]);
				} else if (!old && r.bottom > 0 && r.top < innerHeight && entering.length < MAX_ENTERING) {
					entering.push(li);
				}
			});
			const layer = /** @type {HTMLElement} */ (list.parentElement);
			const layerBox = layer.getBoundingClientRect();
			const leaving = [...prev.values()]
				.filter((o) => !o.el.isConnected && o.y < innerHeight && o.y + o.h > 0)
				.slice(0, MAX_LEAVING);
			// write
			for (const [li, dx, dy] of moves) {
				li.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], {
					duration: MOVE_MS,
					easing: EASE_OUT
				});
			}
			entering.forEach((li, i) => {
				li.animate(
					[
						{ opacity: 0, transform: 'translateY(0.4em) scale(0.98)' },
						{ opacity: 1, transform: 'none' }
					],
					{
						duration: ENTER_MS,
						delay: Math.min(i * STAGGER_MS, MAX_STAGGER_MS),
						easing: EASE_OUT,
						fill: 'backwards'
					}
				);
			});
			// A removed item leaves the layout at once; a copy of it fades out where it was, in
			// the list's (position: relative) parent, so the others can already take its place.
			for (const o of leaving) {
				const ghost = /** @type {HTMLElement} */ (o.el.cloneNode(true));
				ghost.setAttribute('aria-hidden', 'true');
				ghost.inert = true;
				for (const el of [ghost, ...ghost.querySelectorAll('[id]')]) el.removeAttribute('id');
				Object.assign(ghost.style, {
					position: 'absolute',
					margin: '0',
					left: `${o.x - layerBox.left}px`,
					top: `${o.y - layerBox.top}px`,
					width: `${o.w}px`,
					height: `${o.h}px`,
					pointerEvents: 'none'
				});
				layer.append(ghost);
				ghost
					.animate([{ opacity: 1 }, { opacity: 0 }], { duration: LEAVE_MS, easing: 'ease-in', fill: 'forwards' })
					.finished.finally(() => ghost.remove());
			}
		}
	};
}
