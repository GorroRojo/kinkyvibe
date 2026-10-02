/**
 * PARIDAD DEL TEXTO: lo importado de un .md se ve igual que hoy (decisión 0004: el HTML del repo
 * cuenta como HTML libre de superadmin).
 *
 * - Todos los eventos reales: su texto en la base es el del .md, así que la página usa el
 *   componente que mdsvex compiló de ese .md (exactamente lo de siempre). Para los que tienen
 *   estilos propios se renderiza la página desde la base y desde el .md y se comparan.
 * - Un evento inventado con <style>, <script>, <iframe> y <video> (fixtures/calendario): como no es
 *   un .md del deploy, la base lo arma con HTML libre (./freeHtml.js) y tiene que dar el mismo HTML
 *   que su componente compilado (sin las clases de Svelte), y los mismos estilos.
 * - Un texto guardado por alguien que no es superadmin pasa por la lista corta.
 */
import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import { rehype } from 'rehype';
import { splitMarkdown } from '../amigues/importer.js';
import { normalizeBody } from './eventos.js';
import { FREE_BODY_CLASS, contentMediaURL, renderContentBody } from './render.js';
import { renderFreeBody, smartypants } from './freeHtml.js';

const raws = /** @type {Record<string, string>} */ (
	import.meta.glob('/src/lib/posts/calendario/*.md', {
		query: '?raw',
		import: 'default',
		eager: true
	})
);
/** @type {Record<string, () => Promise<any>>} */
const components = import.meta.glob('/src/lib/posts/calendario/*.md', { import: 'default' });
const fixtureComponents = /** @type {Record<string, any>} */ (
	import.meta.glob('./fixtures/calendario/*.md', { import: 'default', eager: true })
);
const fixtureRaws = /** @type {Record<string, string>} */ (
	import.meta.glob('./fixtures/calendario/*.md', { query: '?raw', import: 'default', eager: true })
);

/** @param {string} path */
const slugOf = (path) => path.split('/').pop()?.replace(/\.md$/, '') ?? '';
/** @param {string} raw */
const bodyOf = (raw) => {
	try {
		return normalizeBody(splitMarkdown(raw).body);
	} catch {
		return null;
	}
};

/**
 * El mismo HTML, sin lo que no se ve: las clases con las que Svelte limita los estilos
 * (`svelte-xxxx`), comentarios, espacios entre etiquetas y el orden de los atributos.
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

describe('los eventos reales se ven igual que hoy', () => {
	const real = Object.entries(raws).filter(([p]) => !slugOf(p).startsWith('_'));

	it('el texto de cada uno es el del .md: la página usa su componente', async () => {
		/** @type {string[]} */
		const notSame = [];
		for (const [path, raw] of real) {
			const body = bodyOf(raw);
			if (!body) continue;
			const r = await renderContentBody({ body, body_html: 'libre' }, 'calendario', slugOf(path));
			if (!r.component) notSame.push(slugOf(path));
		}
		expect(notSame).toEqual([]);
	});

	it('los que tienen estilos propios: la página desde la base y desde el .md dan lo mismo', async () => {
		const styled = real.filter(([, raw]) => /<style[\s>]/i.test(raw));
		expect(styled.length).toBeGreaterThanOrEqual(20);
		const page = await import('../../../routes/(content)/calendario/[event]/+page.js');
		for (const [path, raw] of styled) {
			const slug = slugOf(path);
			const rendered = await renderContentBody(
				{ body: bodyOf(raw), body_html: 'libre' },
				'calendario',
				slug
			);
			const data = /** @type {any} */ ({
				mode: 'db',
				post: { meta: { postID: slug, title: 'x' }, path: `/calendario/${slug}`, ...rendered }
			});
			const fromDb = /** @type {any} */ (
				await page.load(/** @type {any} */ ({ params: { event: slug }, data }))
			);
			const fromMd = await components[path]();
			expect(fromDb.content, slug).toBe(fromMd);
			expect(fromDb.html, slug).toBeUndefined();
			expect(render(fromDb.content).body).toBe(render(fromMd).body);
		}
	});
});

describe('HTML libre editado: el mismo camino que mdsvex', () => {
	it('un evento con <style>, <script>, <iframe> y <video> da el mismo HTML que su .md', async () => {
		const path = './fixtures/calendario/varieta-html-libre-2031-08.md';
		const body = /** @type {string} */ (bodyOf(fixtureRaws[path]));
		// No es un .md del deploy: se arma con HTML libre.
		const r = await renderContentBody({ body, body_html: 'libre' }, 'calendario', 'varieta');
		expect(r.component).toBe(false);
		expect(normalizeHtml(r.html)).toBe(normalizeHtml(render(fixtureComponents[path]).body));
		expect(r.html).toContain('<iframe');
		expect(r.html).toContain('<video');
		expect(r.html).toContain('festival-24-7-2023/1.webp');
		expect(r.html).not.toContain('<script');
		// Los estilos propios, solo dentro del texto.
		expect(r.css).toMatch(new RegExp(`^@scope \\(\\.${FREE_BODY_CLASS}\\) \\{`));
		expect(r.css).toContain('border: 2px solid hotpink');
	});

	it('las comillas, los guiones y los puntos suspensivos, como smartypants', () => {
		expect(smartypants(`"hola" y 'chau', it's -- ... ---`)).toBe('“hola” y ‘chau’, it’s – … —');
	});
});

describe('HTML libre con los textos reales', () => {
	// Un texto real que se edita se arma con HTML libre: tiene que dar lo mismo que mdsvex. Hoy da
	// exactamente lo mismo en 535 de 571 (los demás son casos borde del parser de markdown de
	// mdsvex, que es más permisivo que CommonMark: énfasis con `*` pegado, listas "sueltas"). Esta
	// prueba no deja que empeore; si mejora, subí el número.
	const MIN_SAME = 535;
	it(`da el mismo HTML que el componente compilado en al menos ${MIN_SAME} textos`, async () => {
		const all = /** @type {Record<string, any>} */ (
			import.meta.glob('/src/lib/posts/{calendario,material}/*.md', {
				import: 'default',
				eager: true
			})
		);
		const metas = /** @type {Record<string, any>} */ (
			import.meta.glob('/src/lib/posts/{calendario,material}/*.md', {
				import: 'metadata',
				eager: true
			})
		);
		const texts = /** @type {Record<string, string>} */ (
			import.meta.glob('/src/lib/posts/{calendario,material}/*.md', {
				query: '?raw',
				import: 'default',
				eager: true
			})
		);
		let same = 0;
		for (const path of Object.keys(all)) {
			const slug = slugOf(path);
			const category = /** @type {'calendario' | 'material'} */ (path.split('/').slice(-2)[0]);
			const body = bodyOf(texts[path]);
			if (slug.startsWith('_') || body === null) continue;
			let expected;
			try {
				expected = normalizeHtml(render(all[path]).body);
			} catch {
				continue;
			}
			const r = await renderFreeBody(body, {
				vars: metas[path] ?? {},
				resolveMedia: (file, p) =>
					contentMediaURL(category, /\/media\/([\w.-]+)\//.exec(p)?.[1] ?? slug, file)
			});
			if (normalizeHtml(r.html) === expected) same++;
		}
		expect(same).toBeGreaterThanOrEqual(MIN_SAME);
	}, 300_000);
});

describe('lista corta para quien no es superadmin', () => {
	it('un texto sin `libre` pasa por la lista corta', async () => {
		const body =
			'<style>a{color:red}</style>\n\nHola <iframe src="https://ejemplo.test"></iframe>\n\n<video src="x.mp4"></video><script>alert(1)</script>';
		const r = await renderContentBody({ body, body_html: 'corta' }, 'calendario', 'x');
		expect(r.component).toBe(false);
		expect(r.css).toBe('');
		expect(r.html).toContain('Hola');
		for (const tag of ['<style', '<iframe', '<video', '<script']) expect(r.html).not.toContain(tag);
		// Sin dato también es la lista corta (ante la duda, lo más seguro).
		const r2 = await renderContentBody({ body }, 'calendario', 'x');
		expect(r2.html).not.toContain('<iframe');
	});
});
