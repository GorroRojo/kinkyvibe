/**
 * `.kv-segmented` (style.scss): el elegido queda lleno también con el mouse encima. Antes el
 * :hover le ganaba al elegido y, en el celu (donde el hover queda pegado después de tocar), la
 * opción recién elegida se veía sin elegir. Y `.small`, a la escala de los chips.
 */
import { describe, expect, it } from 'vitest';
import { compile } from 'sass';

const css = compile(new URL('./style.scss', import.meta.url).pathname, {
	loadPaths: [new URL('.', import.meta.url).pathname]
}).css;
/** Las reglas cuyo selector contiene `needle`, con su cuerpo. */
const rules = (/** @type {string} */ needle) =>
	[...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
		.filter((m) => m[1].includes(needle))
		.map((m) => ({ selector: m[1].trim(), body: m[2] }));

describe('.kv-segmented', () => {
	it('el elegido con el mouse encima sigue lleno, y le gana al hover común', () => {
		const pressedHover = rules('.kv-segmented > [aria-pressed=true]:hover');
		expect(pressedHover).toHaveLength(1);
		expect(pressedHover[0].body).toMatch(/background: var\(--accent, var\(--1\)\)/);
		expect(pressedHover[0].selector).toContain('.kv-segmented > label:has(input:checked):hover');
		// más específico que `.kv-segmented > button:hover` (0,2,1): (0,3,0)
		const hover = rules('.kv-segmented > button:hover');
		expect(hover.length).toBeGreaterThan(0);
		expect(css.indexOf('[aria-pressed=true]:hover')).toBeGreaterThan(
			css.indexOf('.kv-segmented > button:hover')
		);
	});

	it('`.small`: 2rem de alto y `--text-xs`, como los chips', () => {
		const small = rules('.kv-segmented.small');
		expect(small.find((r) => r.selector === '.kv-segmented.small')?.body).toMatch(/height: 2rem/);
		expect(small.find((r) => r.selector.includes('.small > button'))?.body).toMatch(
			/font-size: var\(--text-xs\)/
		);
		expect(small.find((r) => r.selector.includes('.icon-only'))?.body).toMatch(/width: 2\.5rem/);
	});
});
