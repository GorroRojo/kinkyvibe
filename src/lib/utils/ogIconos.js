/**
 * Los íconos de las tarjetas de vista previa de objetos sin imagen (src/lib/utils/ogObjeto.js):
 * los mismos de Lucide que usa el sitio (`@lucide/svelte` 1.66.0, licencia ISC), copiados
 * como datos porque el dibujo corre en el Worker sin componentes de Svelte. Una prueba
 * (ogIconos.test.js) los compara con los del paquete: si se actualiza, se regeneran copiando los
 * `node` de cada `node_modules/@lucide/svelte/dist/icons/<nombre>.svelte`.
 */

/** @typedef {Array<[string, Record<string, string>]>} IconNodes */

/** @type {Readonly<Record<string, IconNodes>>} */
export const OG_ICONS = Object.freeze({
	'calendar-range': [
		['rect', { x: '3', y: '3', width: '18', height: '18', rx: '2' }],
		['path', { d: 'M16 2v3' }],
		['path', { d: 'M3 9h18' }],
		['path', { d: 'M8 2v3' }],
		['path', { d: 'M17 13h-6' }],
		['path', { d: 'M13 17H7' }],
		['path', { d: 'M7 13h.01' }],
		['path', { d: 'M17 17h.01' }]
	],
	'book-open': [
		['path', { d: 'M12 5v16' }],
		[
			'path',
			{
				d: 'M20.001 19A2 2 0 0022 17V5a2 2 0 00-1.999-2L16 3.002A5 5 0 0012 5a5 5 0 00-4-2H4a2 2 0 00-2 2v12a2 2 0 001.999 2H8a5 5 0 014 2 5 5 0 014-2z'
			}
		]
	],
	download: [
		['path', { d: 'M12 15V3' }],
		['path', { d: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4' }],
		['path', { d: 'm7 10 5 5 5-5' }]
	],
	'shopping-cart': [
		['path', { d: 'm2.05 2.05 1.099-.028a1 1 0 0 1 1.008.815l2.69 14.347A1 1 0 0 0 7.83 18H18' }],
		['path', { d: 'M4.563 5h16.435a1 1 0 0 1 .981 1.204l-1.026 6.226A2 2 0 0 1 18.962 14H6.25' }],
		['circle', { cx: '18', cy: '20', r: '2' }],
		['circle', { cx: '8', cy: '20', r: '2' }]
	],
	'mouse-pointer-click': [
		['path', { d: 'M14 4.1 12 6' }],
		['path', { d: 'm5.1 8-2.9-.8' }],
		['path', { d: 'm6 12-1.9 2' }],
		['path', { d: 'M7.2 2.2 8 5.1' }],
		[
			'path',
			{
				d: 'M9.037 9.69a.498.498 0 0 1 .653-.653l11 4.5a.5.5 0 0 1-.074.949l-4.349 1.041a1 1 0 0 0-.74.739l-1.04 4.35a.5.5 0 0 1-.95.074z'
			}
		]
	],
	video: [
		['path', { d: 'm16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5' }],
		['rect', { x: '2', y: '6', width: '14', height: '12', rx: '2' }]
	],
	heart: [
		[
			'path',
			{
				d: 'M2 9.5a5.5 5.5 0 0 1 9.591-3.676.56.56 0 0 0 .818 0A5.49 5.49 0 0 1 22 9.5c0 2.29-1.5 4-3 5.5l-5.492 5.313a2 2 0 0 1-3 .019L5 15c-1.5-1.5-3-3.2-3-5.5'
			}
		]
	],
	globe: [
		['circle', { cx: '12', cy: '12', r: '10' }],
		['path', { d: 'M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20' }],
		['path', { d: 'M2 12h20' }]
	]
});

/** @typedef {keyof typeof OG_ICONS} OgIconName */

/** @param {string} s */
const attr = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

/**
 * El ícono como SVG (24 × 24, el trazo redondeado de Lucide).
 * @param {OgIconName} name
 * @param {{ color: string, fill?: string, stroke?: number }} opts
 */
export function iconSvg(name, { color, fill = 'none', stroke = 1.75 }) {
	const body = (OG_ICONS[name] ?? [])
		.map(
			([tag, attrs]) =>
				`<${tag} ${Object.entries(attrs)
					.map(([k, v]) => `${k}="${attr(String(v))}"`)
					.join(' ')}/>`
		)
		.join('');
	return `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="${attr(fill)}" stroke="${attr(color)}" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
}
