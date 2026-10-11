/**
 * «Quiénes» y las etiquetas de la página de un evento. Un chip de etiqueta largo no puede
 * ensanchar la página en el celu (antes, «Grupo de Apoyo y Discusión para…» la llevaba de 390 a
 * 411 px): en esta tarjeta los chips pasan al renglón de abajo si no entran. Datos inventados.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { compile } from 'svelte/compiler';
import { render } from 'svelte/server';
import Quienes from './Quienes.svelte';

const source = readFileSync(fileURLToPath(new URL('./Quienes.svelte', import.meta.url)), 'utf8');
const css = compile(source, { filename: 'Quienes.svelte', generate: 'server' }).css?.code ?? '';

/**
 * Las declaraciones de la regla cuyo selector (ya con el hash de Svelte) contiene `selector`.
 * @param {string} selector
 */
function rule(selector) {
	const re = /([^{}]+)\{([^{}]*)\}/g;
	let out = '';
	for (const m of css.matchAll(re)) {
		if (m[1].includes(selector)) out += m[2];
	}
	return out.replace(/\s+/g, ' ');
}

describe('Quienes: las etiquetas', () => {
	it('un chip largo se parte en renglones adentro de la tarjeta', () => {
		const chip = rule('.kv-tag');
		expect(chip).toContain('white-space: normal');
		expect(chip).toContain('overflow-wrap: anywhere');
		expect(chip).toContain('max-width: 100%');
		const item = rule(' li');
		expect(item).toContain('min-width: 0');
		expect(item).toContain('max-width: 100%');
	});

	it('solo en esta tarjeta: la regla va adentro de `.etiquetas` (el chip es compartido)', () => {
		for (const m of css.matchAll(/([^{}]+)\{[^{}]*white-space: normal/g)) {
			expect(m[1]).toMatch(/\.etiquetas/);
		}
	});

	it('las etiquetas siguen saliendo, con su link', () => {
		const { body } = render(Quienes, {
			props: { groups: [], tags: ['Etiqueta de prueba con un nombre bastante largo'] }
		});
		expect(body).toContain('id="tags"');
		expect(body).toContain('class="kv-tag');
		expect(body).toContain('Etiqueta de prueba con un nombre bastante largo');
	});
});
