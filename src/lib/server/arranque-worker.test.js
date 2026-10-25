/**
 * Lo que inicializa el Worker al arrancar (worker/index.js). El dibujante de las tarjetas de vista
 * previa (worker/og.js: satori, resvg, jpeg-js y sus tablas) se importa recién al dibujar: con un
 * import estático, cada isolate nuevo lo inicializaba al arrancar (~15 ms de CPU medidos en local
 * con `wrangler check startup`) aunque casi ningún pedido dibuje una tarjeta.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('../../../worker/index.js', import.meta.url), 'utf8');

/** Los módulos que worker/index.js importa de forma estática (`import … from '…'`). */
const staticImports = [...source.matchAll(/^import\s[^;]*?from\s+['"]([^'"]+)['"]/gm)].map(
	(m) => m[1]
);

describe('arranque del Worker', () => {
	it('no importa el dibujante de las tarjetas al arrancar', () => {
		expect(staticImports.length).toBeGreaterThan(0);
		expect(staticImports.filter((path) => /(^|\/)og(-render)?\.js$/.test(path))).toEqual([]);
	});

	it('lo importa al dibujar (import dinámico)', () => {
		expect(source).toMatch(/import\(\s*['"]\.\/og\.js['"]\s*\)/);
	});
});
