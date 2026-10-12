// Guard for how old free-HTML texts render (style.scss, inside `.content`): PDFs embedded with
// unit-suffixed `width`/`height` attributes, and `<small class="footnote">` footnotes.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (/** @type {string} */ rel) => fs.readFileSync(path.join(SRC, rel), 'utf8');

/** @param {string} css @param {string} selector the declarations of the first rule starting at `selector` */
function ruleBody(css, selector) {
	const start = css.indexOf(selector);
	expect(start, `regla ${selector} en style.scss`).toBeGreaterThan(-1);
	const open = css.indexOf('{', start);
	return css.slice(open + 1, css.indexOf('}', open));
}

describe('textos viejos', () => {
	const style = read('lib/styles/style.scss');
	const material = read('lib/server/semilla/material.json');

	it('la semilla tiene los dos casos (si dejan de existir, esta prueba sobra)', () => {
		expect(material).toMatch(/<object [^>]*type=\\"application\/pdf\\" width=\\"50rem\\"/);
		expect(material).toMatch(/<small [^>]*class=\\"footnote\\"/);
	});

	it('el PDF embebido toma el ancho del texto: el CSS le gana al atributo width="50rem"', () => {
		const body = ruleBody(style, "object[type='application/pdf' i]");
		expect(body).toMatch(/\bwidth:\s*100%/);
		expect(body).toMatch(/max-width:/);
		expect(body).toMatch(/\bheight:/);
		// sin display: si el navegador no muestra el PDF, el respaldo («Ir al pdf») queda como texto
		// y el alto no deja un hueco vacío
		expect(body).not.toMatch(/display:/);
	});

	it('las notas al pie van una debajo de la otra, no inline', () => {
		expect(ruleBody(style, '.footnote {')).toMatch(/display:\s*block/);
	});
});
