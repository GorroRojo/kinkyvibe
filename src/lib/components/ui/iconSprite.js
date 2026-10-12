/**
 * Los íconos que se repiten muchas veces en una página (uno por tarjeta de las listas, en las
 * series de la Kinkipedia): el dibujo va una sola vez por página, en el sprite del layout raíz
 * (IconSprite.svelte), y cada tarjeta lo usa con <SpriteIcon> (`<use href>`) en vez de repetir el
 * SVG entero (docs/seo.md, «Peso de las páginas»).
 *
 * El dibujo es el de Lucide (@lucide/svelte, licencia ISC), copiado tal cual: iconSprite.test.js
 * avisa si una versión nueva de Lucide lo cambia. El nombre es el de Lucide.
 */
export const SPRITE_ICONS = Object.freeze({
	'book-open':
		'<path d="M12 5v16"/><path d="M20.001 19A2 2 0 0022 17V5a2 2 0 00-1.999-2L16 3.002A5 5 0 0012 5a5 5 0 00-4-2H4a2 2 0 00-2 2v12a2 2 0 001.999 2H8a5 5 0 014 2 5 5 0 014-2z"/>',
	'calendar-days':
		'<path d="M8 2v3"/><path d="M16 2v3"/><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/><path d="M8 13h.01"/><path d="M12 13h.01"/><path d="M16 13h.01"/><path d="M8 17h.01"/><path d="M12 17h.01"/><path d="M16 17h.01"/>',
	'calendar-range':
		'<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M16 2v3"/><path d="M3 9h18"/><path d="M8 2v3"/><path d="M17 13h-6"/><path d="M13 17H7"/><path d="M7 13h.01"/><path d="M17 17h.01"/>',
	download:
		'<path d="M12 15V3"/><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/>',
	heart:
		'<path d="M2 9.5a5.5 5.5 0 0 1 9.591-3.676.56.56 0 0 0 .818 0A5.49 5.49 0 0 1 22 9.5c0 2.29-1.5 4-3 5.5l-5.492 5.313a2 2 0 0 1-3 .019L5 15c-1.5-1.5-3-3.2-3-5.5"/>',
	'mouse-pointer-click':
		'<path d="M14 4.1 12 6"/><path d="m5.1 8-2.9-.8"/><path d="m6 12-1.9 2"/><path d="M7.2 2.2 8 5.1"/><path d="M9.037 9.69a.498.498 0 0 1 .653-.653l11 4.5a.5.5 0 0 1-.074.949l-4.349 1.041a1 1 0 0 0-.74.739l-1.04 4.35a.5.5 0 0 1-.95.074z"/>',
	repeat:
		'<path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/>',
	'rotate-ccw-clock':
		'<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/>',
	'shopping-cart':
		'<path d="m2.05 2.05 1.099-.028a1 1 0 0 1 1.008.815l2.69 14.347A1 1 0 0 0 7.83 18H18"/><path d="M4.563 5h16.435a1 1 0 0 1 .981 1.204l-1.026 6.226A2 2 0 0 1 18.962 14H6.25"/><circle cx="18" cy="20" r="2"/><circle cx="8" cy="20" r="2"/>'
});

/** @typedef {keyof typeof SPRITE_ICONS} SpriteIconName */

/** El id del símbolo de un ícono. @param {SpriteIconName} name */
export const spriteIconId = (name) => `kv-icon-${name}`;

/** El sprite: un <svg> invisible con un <symbol> por ícono. */
export const iconSpriteMarkup =
	'<svg aria-hidden="true" focusable="false" style="position:absolute;width:0;height:0;overflow:hidden">' +
	Object.entries(SPRITE_ICONS)
		.map(
			([name, inner]) =>
				`<symbol id="${spriteIconId(/** @type {SpriteIconName} */ (name))}" viewBox="0 0 24 24">${inner}</symbol>`
		)
		.join('') +
	'</svg>';
