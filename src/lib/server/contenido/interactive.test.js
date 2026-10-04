/**
 * Interactivos registrados (decisión 0004, $lib/utils/interactivos.js): solo las etiquetas del
 * registro se muestran como su componente; cualquier otra `<kv-…>` se ve escapada, como texto.
 * La forma de los .md del repo (componente importado en el `<script>`) va y vuelve sin cambios, y
 * el interactivo real (`donde-y-como-golpear-un-cuerpo`) se ve igual armado desde la base que
 * desde su .md.
 */
import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import { rehype } from 'rehype';
import ContentParts from '$lib/components/ContentParts.svelte';
import {
	INTERACTIVE_COMPONENTS,
	interactiveComponent
} from '$lib/components/interactivos/index.js';
import {
	INTERACTIVE_TAGS,
	markInteractive,
	toLegacyComponents,
	toRegisteredTags
} from '$lib/utils/interactivos.js';
import { splitMarkdown } from '../amigues/importer.js';
import { normalizeBody } from './eventos.js';
import { renderContentBody } from './render.js';

const TAG = 'kv-donde-golpear-un-cuerpo';
const OWN = `<${TAG}></${TAG}>`;

/** @param {any[]} parts @returns {string[]} */
const componentsIn = (parts) =>
	parts.flatMap((p) =>
		'component' in p ? [p.component] : p.children ? componentsIn(p.children) : []
	);

describe('el registro', () => {
	it('cada etiqueta registrada tiene su componente (y nada más)', () => {
		expect(Object.keys(INTERACTIVE_COMPONENTS).sort()).toEqual(
			Object.keys(INTERACTIVE_TAGS).sort()
		);
		expect(interactiveComponent(TAG)).toBeTruthy();
		expect(interactiveComponent('kv-desconocido')).toBeUndefined();
		expect(interactiveComponent('constructor')).toBeUndefined();
	});

	it('marca las registradas, escapa las demás y no toca el código', () => {
		const body = [
			OWN,
			'<kv-desconocido></kv-desconocido> y <KV-Donde-Golpear-Un-Cuerpo/>',
			'`<kv-desconocido>` en código',
			'```',
			'<kv-desconocido></kv-desconocido>',
			'```'
		].join('\n\n');
		const { text, tags } = markInteractive(body, (tag, i) => `[${tag}#${i}]`);
		expect(tags).toEqual([TAG, TAG]);
		expect(text).toContain(`[${TAG}#0]`);
		expect(text).toContain(`[${TAG}#1]`);
		expect(text).toContain('&lt;kv-desconocido>&lt;/kv-desconocido>');
		expect(text).toContain('`<kv-desconocido>` en código');
		expect(text).toContain('```\n\n<kv-desconocido></kv-desconocido>\n\n```');
	});
});

describe('cómo se ve', () => {
	it('una etiqueta registrada es su componente, aunque esté dentro de otro elemento', async () => {
		const body = `Antes.\n\n<div class="caja">${OWN}</div>\n\nDespués con **negrita**.`;
		// Una carpeta sin .md: se arma desde el texto (no con el componente del .md).
		const r = await renderContentBody({ body, body_html: 'libre' }, 'material', 'sin-md');
		expect(r.component).toBe(false);
		expect(r.parts).toBeTruthy();
		const parts = /** @type {any[]} */ (r.parts);
		expect(componentsIn(parts)).toEqual([TAG]);
		const box = parts.find((p) => p.element === 'div');
		expect(box).toMatchObject({ attrs: { class: 'caja' }, children: [{ component: TAG }] });
		const html = render(ContentParts, { props: { parts } }).body;
		expect(html).toContain('<strong>negrita</strong>');
		expect(html).toContain('class="caja"');
		// El componente se renderiza (en el servidor también): su SVG está en la página.
		expect(html).toContain('<svg');
	});

	it('una etiqueta que no está en el registro se ve escapada (libre y lista corta)', async () => {
		const body = 'Hola <kv-desconocido data-x="1"></kv-desconocido> chau\n\n<kv-otro/>';
		for (const body_html of ['libre', 'corta']) {
			const r = await renderContentBody({ body, body_html }, 'material', 'sin-md');
			expect(r.parts, body_html).toBeUndefined();
			expect(r.html, body_html).not.toMatch(/<kv-/i);
			expect(r.html, body_html).toContain('&#x3C;kv-desconocido');
			expect(r.html, body_html).toContain('&#x3C;kv-otro');
		}
	});

	it('la lista corta también muestra los registrados', async () => {
		const r = await renderContentBody(
			{ body: `Un gráfico:\n\n${OWN}`, body_html: 'corta' },
			'material',
			'x'
		);
		expect(componentsIn(/** @type {any[]} */ (r.parts))).toEqual([TAG]);
	});

	it('ContentParts ignora un componente que no está en el registro', () => {
		const html = render(ContentParts, {
			props: {
				parts: [{ html: '<p>a</p>' }, { component: 'kv-desconocido' }, { html: '<p>b</p>' }]
			}
		}).body;
		expect(html.replace(/<!--[^>]*-->/g, '')).toBe('<p>a</p><p>b</p>');
	});
});

/**
 * El mismo HTML, sin lo que no se ve (clases de Svelte, comentarios, espacios entre etiquetas).
 * @param {string} html
 */
function normalizeHtml(html) {
	const tree = rehype().data('settings', { fragment: true }).parse(html);
	/** @param {any} n */
	const walk = (n) => {
		if (!n.children) return;
		n.children = n.children.filter(
			(/** @type {any} */ c) => c.type !== 'comment' && !(c.type === 'text' && !c.value.trim())
		);
		for (const c of n.children) {
			if (c.type === 'text') c.value = c.value.replace(/\s+/g, ' ').trim();
			if (c.type === 'element') {
				const cls = (c.properties?.className ?? []).filter(
					(/** @type {string} */ x) => !/^svelte-/.test(x)
				);
				if (cls.length) c.properties.className = cls;
				else delete c.properties.className;
				c.properties = Object.fromEntries(Object.entries(c.properties).sort());
			}
			walk(c);
		}
	};
	walk(tree);
	return rehype().data('settings', { fragment: true }).stringify(tree);
}

describe('los .md reales', () => {
	const raws = /** @type {Record<string, string>} */ (
		import.meta.glob('/src/lib/posts/{calendario,material}/*.md', {
			query: '?raw',
			import: 'default',
			eager: true
		})
	);

	it('la forma del .md va a la base y vuelve igual («Descargar todo»)', () => {
		/** @type {string[]} */
		const changed = [];
		/** @type {string[]} */
		const different = [];
		for (const [path, raw] of Object.entries(raws)) {
			const body = normalizeBody(splitMarkdown(raw).body);
			const stored = toRegisteredTags(body);
			if (stored !== body) changed.push(path.split('/').pop() ?? '');
			if (normalizeBody(toLegacyComponents(stored)) !== body) different.push(path);
		}
		expect(different).toEqual([]);
		expect(changed).toEqual(['donde-y-como-golpear-un-cuerpo.md']);
	});

	it('donde-y-como-golpear-un-cuerpo: desde la base se ve igual que desde su .md', async () => {
		const path = '/src/lib/posts/material/donde-y-como-golpear-un-cuerpo.md';
		const stored = toRegisteredTags(normalizeBody(splitMarkdown(raws[path]).body));
		expect(stored.startsWith(`<div>${OWN}</div>`)).toBe(true);
		expect(stored).not.toContain('<script');
		// Sin cambios: la página usa el componente del .md (exactamente lo de siempre).
		const same = await renderContentBody(
			{ body: stored, body_html: 'libre' },
			'material',
			'donde-y-como-golpear-un-cuerpo'
		);
		expect(same.component).toBe(true);
		// Armado desde el texto (como cuando se edita): mismo HTML que el componente compilado.
		const fromText = await renderContentBody(
			{ body: stored, body_html: 'libre' },
			'material',
			'otro'
		);
		expect(fromText.component).toBe(false);
		const compiled = /** @type {any} */ (
			await import('/src/lib/posts/material/donde-y-como-golpear-un-cuerpo.md')
		).default;
		expect(normalizeHtml(render(ContentParts, { props: { parts: fromText.parts } }).body)).toBe(
			normalizeHtml(render(compiled).body)
		);
	});
});
