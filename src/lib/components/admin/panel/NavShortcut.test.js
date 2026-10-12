/**
 * Pistas «g x» del menú lateral: salen de los atajos (`shortcutOf`), los lectores de pantalla no
 * las leen y no aparecen en las tarjetas del panel "Más" del celu.
 */
import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import NavEntry from './NavEntry.svelte';
import SideNav from './SideNav.svelte';
import ShortcutTip from './ShortcutTip.svelte';
import { navItem } from '$lib/admin/nav.js';
import { shortcutOf } from '$lib/admin/commands.js';
import { textOf } from '$lib/testing/html.js';

const CHIP = '<kbd class="kv-nav-sc';

/** Las pistas del HTML: la etiqueta de apertura y su texto. @param {string} html */
function chips(html) {
	/** @type {{ tag: string, text: string }[]} */
	const out = [];
	let at = html.indexOf(CHIP);
	while (at !== -1) {
		const open = html.slice(at, html.indexOf('>', at) + 1);
		const end = html.indexOf('</kbd>', at);
		out.push({ tag: open, text: textOf(html.slice(at, end)) });
		at = html.indexOf(CHIP, end);
	}
	return out;
}

/** @param {string} id */
const item = (id) => /** @type {import('$lib/admin/nav.js').NavItem} */ (navItem(id));

describe('pistas de atajos en el menú', () => {
	it('una sección con atajo muestra «g x», oculta para lectores de pantalla', () => {
		const { body } = render(NavEntry, { props: { item: item('eventos-nuevo') } });
		const found = chips(body);
		expect(found).toHaveLength(1);
		expect(found[0].text).toBe('g n');
		expect(found[0].tag).toContain('aria-hidden="true"');
		// El nombre sigue entero.
		expect(textOf(body)).toContain('Cargar evento');
	});
	it('sin atajo no hay pista', () => {
		const { body } = render(NavEntry, { props: { item: item('no-listadas') } });
		expect(chips(body)).toEqual([]);
	});
	it('en las tarjetas del panel "Más" (celu) nunca hay pista', () => {
		const { body } = render(NavEntry, { props: { item: item('eventos'), variant: 'tile' } });
		expect(chips(body)).toEqual([]);
	});
	it('el link no lleva aria-keyshortcuts (no describe secuencias de teclas)', () => {
		const { body } = render(NavEntry, { props: { item: item('eventos') } });
		expect(body).not.toContain('aria-keyshortcuts');
	});
	it('la barra lateral muestra la pista de cada sección (la de su primera página)', () => {
		const { body } = render(SideNav, { props: { active: item('eventos') } });
		const found = chips(body);
		const texts = found.map((c) => c.text);
		// La Puerta (g c) ya no está en la barra lateral (parte 2); su atajo sigue.
		expect(texts).not.toContain(shortcutOf('checkin'));
		for (const id of ['inicio', 'eventos', 'entradas', 'personas', 'material']) {
			expect(texts).toContain(shortcutOf(id));
		}
		for (const c of found) expect(c.tag).toContain('aria-hidden="true"');
	});
});

describe('aviso de atajos', () => {
	it('no se muestra en el servidor (decide el navegador)', () => {
		const { body } = render(ShortcutTip, { props: {} });
		expect(textOf(body)).not.toContain('¿Sabías que hay atajos?');
	});
	it('visible: dice qué hay, en voseo, con «Ver atajos» y «Entendido»', () => {
		const { body } = render(ShortcutTip, { props: { show: true } });
		const text = textOf(body);
		expect(text).toContain('¿Sabías que hay atajos?');
		expect(text).toContain('Apretá');
		expect(text).toContain('Ver atajos');
		expect(text).toContain('Entendido');
	});
});
