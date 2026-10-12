/**
 * El buscador de las listas (TagSearch) con muchas etiquetas elegidas: queda en una sola línea,
 * con su forma de píldora, y las elegidas se deslizan de costado en su propia fila (antes crecía
 * en varias líneas y se deformaba). El render del servidor arma la fila; las reglas de estilo se
 * controlan en el archivo (el alto real lo mide tests/smoke.spec.js en un celu).
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { readable } from 'svelte/store';
import { render } from 'svelte/server';

vi.mock('$app/stores', () => ({
	page: readable({ url: new URL('http://localhost/'), data: {} })
}));

const { default: TagSearch } = await import('./TagSearch.svelte');
const { filteredTags } = await import('$lib/utils/stores');
const src = readFileSync(new URL('./TagSearch.svelte', import.meta.url), 'utf8');
const style = src.slice(src.indexOf('<style'));
/** @param {string} selector */
const rule = (selector) => {
	const at = style.search(new RegExp(`\\n\\t${selector.replace('.', '\\.')} \\{`));
	expect(at, selector).toBeGreaterThan(-1);
	return style.slice(at, style.indexOf('\n\t}', at));
};

describe('TagSearch con muchas etiquetas', () => {
	it('las elegidas van en su propia fila, una por chip, con su botón para sacarla', () => {
		const tags = ['taller', 'Presencial', 'género y salud sexual', 'despatologización', 'gratis'];
		filteredTags.set(tags);
		const body = render(TagSearch, { props: { posts: [] } }).body;
		filteredTags.set([]);
		expect(body).toContain('<ul class="chips');
		expect((body.match(/<li class="chip/g) ?? []).length).toBe(5);
		expect(body).toContain('aria-label="Sacar etiqueta despatologización"');
		expect(body).toContain('Sumar otra etiqueta…');
	});

	it('el campo no se parte en líneas y la fila de chips se desliza de costado', () => {
		expect(rule('.field')).toMatch(/flex-wrap: nowrap;/);
		const chips = rule('.chips');
		expect(chips).toMatch(/display: flex;/);
		expect(chips).toMatch(/overflow-x: auto;/);
		expect(chips).toMatch(/min-width: 0;/);
		expect(rule('.chips.overflow')).toMatch(/mask-image: linear-gradient\(to left/);
		expect(rule('.chip')).toMatch(/flex: none;/);
	});

	it('el campo de texto nunca baja de 10.5em', () => {
		const input = rule('input');
		expect(input).toMatch(/min-width: 10\.5em;/);
		expect(input).toMatch(/flex: 1 0 10\.5em;/);
	});

	it('al elegir, se ve la última (sin asignarle a la variable del bind, que haría un bucle)', () => {
		expect(src).toMatch(/\$: \(\$filteredTags\.length, showLastChip\(\)\);/);
		expect(src).toMatch(
			/const el = chipsEl;\n\t\tif \(!el\) return;\n\t\tel\.scrollLeft = el\.scrollWidth;/
		);
	});
});
