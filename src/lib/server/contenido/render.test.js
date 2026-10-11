/**
 * El texto de una publicación de la base, como lo muestra su página (decisión 0004: el HTML que vino
 * del repo cuenta como HTML libre de superadmin; decisión 0032: los .md ya no existen, así que todo
 * texto `libre` se arma con ./freeHtml.js).
 *
 * - Un evento inventado con <style>, <script>, <iframe> y <video> (fixtures/calendario) da el
 *   mismo HTML que daba su componente compilado por mdsvex (guardado en el .html de al lado el día
 *   que se sacó mdsvex, sin las clases de Svelte), y los mismos estilos.
 * - Las imágenes y los archivos de las carpetas de medios viejas siguen andando: las imágenes, su
 *   copia en la biblioteca; los PDF, video y documentos, el archivo del build (misma dirección).
 * - Un texto guardado por alguien que no es superadmin pasa por la lista corta.
 */
import { describe, expect, it } from 'vitest';
import { rehype } from 'rehype';
import { splitMarkdown } from '../amigues/importer.js';
import { normalizeBody } from './eventos.js';
import { mediaURL } from '$lib/utils';
import { FREE_BODY_CLASS, contentMediaURL, renderContentBody } from './render.js';
import { smartypants } from './freeHtml.js';

const fixtureRaws = /** @type {Record<string, string>} */ (
	import.meta.glob('./fixtures/calendario/*.md', { query: '?raw', import: 'default', eager: true })
);
/** Lo que daba el componente que mdsvex compilaba de cada fixture (el .html de al lado). */
const fixtureHtml = /** @type {Record<string, string>} */ (
	import.meta.glob('./fixtures/calendario/*.html', {
		query: '?raw',
		import: 'default',
		eager: true
	})
);

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

describe('HTML libre editado: el mismo camino que mdsvex', () => {
	it('un evento con <style>, <script>, <iframe> y <video> da el mismo HTML que su .md', async () => {
		const path = './fixtures/calendario/varieta-html-libre-2031-08.md';
		const body = /** @type {string} */ (bodyOf(fixtureRaws[path]));
		const r = await renderContentBody({ body, body_html: 'libre' }, 'calendario', 'varieta');
		// La imagen vieja que importa el texto: su copia en la biblioteca (mdsvex daba la del build).
		const flyer = /** @type {string} */ (mediaURL('calendario', 'festival-24-7-2023', '1.webp'));
		expect(flyer).toMatch(/\/media\/img\/[0-9a-f]{64}\.webp$/);
		const expected = fixtureHtml[path.replace(/\.md$/, '.html')].replace(
			'/src/lib/posts/calendario/media/festival-24-7-2023/1.webp',
			flyer
		);
		expect(normalizeHtml(r.html)).toBe(normalizeHtml(expected));
		expect(r.html).toContain('<iframe');
		expect(r.html).toContain('<video');
		expect(r.html).toContain(`src="${flyer}"`);
		expect(r.html).not.toContain('<script');
		// Los estilos propios, solo dentro del texto.
		expect(r.css).toMatch(new RegExp(`^@scope \\(\\.${FREE_BODY_CLASS}\\) \\{`));
		expect(r.css).toContain('border: 2px solid hotpink');
	});

	it('las comillas, los guiones y los puntos suspensivos, como smartypants', () => {
		expect(smartypants(`"hola" y 'chau', it's -- ... ---`)).toBe('“hola” y ‘chau’, it’s – … —');
	});
});

describe('las carpetas de medios viejas', () => {
	it('una imagen de la carpeta de un post: su copia en la biblioteca', () => {
		const url = contentMediaURL('material', 'collares-electricos', '2.webp');
		expect(url).toMatch(/\/media\/img\/[0-9a-f]{64}\.webp$/);
		expect(url).toBe(mediaURL('material', 'collares-electricos', '2.webp'));
	});

	it('un PDF, un video o un documento: el archivo del build', () => {
		expect(contentMediaURL('material', 'esencia-del-shibari', '1.pdf')).toMatch(/1.*\.pdf$/);
		expect(contentMediaURL('material', 'con-la-soga-al-cuello', '4.mp4')).toMatch(/4.*\.mp4$/);
		expect(contentMediaURL('material', 'guia-info-medica-emergencia', '1.odt')).toMatch(
			/1.*\.odt$/
		);
	});

	it('lo que no existe o no es un nombre de archivo, nada', () => {
		expect(contentMediaURL('material', 'esencia-del-shibari', '9.pdf')).toBeUndefined();
		expect(contentMediaURL('material', '..', '1.pdf')).toBeUndefined();
		expect(contentMediaURL('material', 'esencia-del-shibari', '../1.pdf')).toBeUndefined();
	});

	it('un texto de la base que enlaza su PDF con `<a href={guia}>` lo muestra', async () => {
		const body =
			"<script>\n  import guia from './media/esencia-del-shibari/1.pdf';\n</script>\n\n<a href={guia}>Ir al pdf</a>";
		const r = await renderContentBody(
			{ body, body_html: 'libre' },
			'material',
			'esencia-del-shibari'
		);
		const href = /** @type {string} */ (
			contentMediaURL('material', 'esencia-del-shibari', '1.pdf')
		);
		expect(r.html).toContain(`href="${href}"`);
	});
});

describe('lista corta para quien no es superadmin', () => {
	it('un texto sin `libre` pasa por la lista corta', async () => {
		const body =
			'<style>a{color:red}</style>\n\nHola <iframe src="https://ejemplo.test"></iframe>\n\n<video src="x.mp4"></video><script>alert(1)</script>';
		const r = await renderContentBody({ body, body_html: 'corta' }, 'calendario', 'x');
		expect(r.css).toBe('');
		expect(r.html).toContain('Hola');
		for (const tag of ['<style', '<iframe', '<video', '<script']) expect(r.html).not.toContain(tag);
		// Sin dato también es la lista corta (ante la duda, lo más seguro).
		const r2 = await renderContentBody({ body }, 'calendario', 'x');
		expect(r2.html).not.toContain('<iframe');
	});
});
