/**
 * El sprite de íconos (iconSprite.js): cada dibujo es el de Lucide tal cual (si una versión nueva
 * de Lucide cambia un ícono, esta prueba avisa y se copia el nuevo), y <SpriteIcon> usa el símbolo
 * con las mismas clases y tamaño que el componente de Lucide.
 */
import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import { SPRITE_ICONS, iconSpriteMarkup, spriteIconId } from './iconSprite.js';
import SpriteIcon from './SpriteIcon.svelte';
import { withoutComments } from '$lib/testing/html.js';

/** Lo de adentro del <svg> de un componente de Lucide, con las etiquetas vacías cerradas como `/>`. */
async function lucideInner(/** @type {string} */ name) {
	const { default: Icon } = await import(`@lucide/svelte/icons/${name}`);
	const body = withoutComments(render(Icon).body);
	const inner = body.slice(body.indexOf('>') + 1, body.lastIndexOf('</svg>'));
	return ['path', 'rect', 'circle', 'line', 'polyline', 'polygon', 'ellipse'].reduce(
		(html, tag) => html.split(`></${tag}>`).join('/>'),
		inner
	);
}

describe('iconSprite', () => {
	for (const name of Object.keys(SPRITE_ICONS)) {
		it(`${name}: el mismo dibujo que Lucide`, async () => {
			expect(SPRITE_ICONS[/** @type {keyof typeof SPRITE_ICONS} */ (name)]).toBe(
				await lucideInner(name)
			);
		});
	}

	it('un <symbol> por ícono, en un <svg> que no se ve', () => {
		expect(iconSpriteMarkup.startsWith('<svg aria-hidden="true"')).toBe(true);
		expect(iconSpriteMarkup).toContain('position:absolute;width:0;height:0');
		for (const name of Object.keys(SPRITE_ICONS)) {
			expect(iconSpriteMarkup).toContain(
				`<symbol id="${spriteIconId(/** @type {any} */ (name))}" viewBox="0 0 24 24">`
			);
		}
	});

	it('<SpriteIcon>: las clases de Lucide, el tamaño, el grosor y el símbolo', () => {
		const body = withoutComments(
			render(SpriteIcon, { props: { name: 'heart', size: '1em', strokeWidth: '3px' } }).body
		);
		expect(body).toContain('class="lucide lucide-heart lucide-icon sprite-icon"');
		expect(body).toContain('width="1em"');
		expect(body).toContain('height="1em"');
		expect(body).toContain('stroke-width="3px"');
		expect(body).toContain('aria-hidden="true"');
		expect(body).toContain('<use href="#kv-icon-heart"></use>');
	});
});
