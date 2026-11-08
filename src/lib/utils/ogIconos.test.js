/**
 * Los íconos de las tarjetas de objetos (ogIconos.js) son los de `@lucide/svelte`, el paquete que
 * usa el sitio: si el paquete cambia un ícono, esta prueba avisa para regenerarlos.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { OG_ICONS, iconSvg } from './ogIconos.js';

/** Los nodos de un ícono tal como están en el paquete. @param {string} name */
function packageNodes(name) {
	const index = import.meta.resolve('@lucide/svelte');
	const src = readFileSync(fileURLToPath(new URL(`./icons/${name}.svelte`, index)), 'utf8');
	const m = src.match(/(?:const iconData|export const __iconData) = (\{.*?\});/s);
	if (!m) throw new Error(`sin datos para ${name}`);
	return JSON.parse(m[1]).node;
}

describe('OG_ICONS', () => {
	it.each(Object.keys(OG_ICONS))('«%s» es igual al del paquete', (name) => {
		expect(OG_ICONS[name]).toEqual(packageNodes(name));
	});
});

describe('iconSvg', () => {
	it('un SVG de 24 × 24 con el trazo de Lucide y los colores pedidos', () => {
		const svg = iconSvg('heart', { color: 'hsl(262, 75%, 13%)', fill: 'red', stroke: 1.5 });
		expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true);
		expect(svg).toContain('viewBox="0 0 24 24"');
		expect(svg).toContain('stroke="hsl(262, 75%, 13%)"');
		expect(svg).toContain('fill="red"');
		expect(svg).toContain('stroke-width="1.5"');
		expect(svg).toContain('stroke-linecap="round"');
		expect(svg).toContain('<path d="M2 9.5');
	});

	it('las comillas de un color no cortan el atributo', () => {
		expect(iconSvg('globe', { color: 'a"b' })).toContain('stroke="a&quot;b"');
	});
});
