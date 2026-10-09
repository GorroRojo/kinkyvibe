/**
 * El aviso compartido (Notice): el color del tono, su propio ícono de Lucide (los avisos ya no
 * llevan «⚠️» en el texto), el `role` correcto (alert solo para errores o lo que no puede pasar de
 * largo después de una acción; status o nada para notas) y la variante dentro de un <label>.
 * (El texto de cada aviso lo revisan las pruebas de cada formulario, como TicketsEditor.test.js.)
 */
import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import Notice from './Notice.svelte';

/** @param {Record<string, any>} props */
const html = (props = {}) =>
	render(Notice, { props: /** @type {any} */ (props) }).body.replace(/<!--[\s\S]*?-->/g, '');

/** El elemento de afuera: [etiqueta, atributos]. @param {string} body */
const outer = (body) => body.match(/^<(div|span)([^>]*)>/)?.slice(1) ?? [];

describe('Notice', () => {
	it('por defecto: verde, con ícono y role="status"', () => {
		const body = html();
		const [tag, attrs] = outer(body);
		expect(tag).toBe('div');
		expect(attrs).toMatch(/class="kv-notice ok\b/);
		expect(attrs).toContain('role="status"');
		expect(body).toMatch(/<svg[^>]*class="[^"]*lucide-circle-check[^"]*"[^>]*aria-hidden="true"/);
		// el texto va en su propio bloque, al lado del ícono
		expect(body).toMatch(/<\/svg>\s*<div class="kv-notice-text/);
	});

	it('aviso: amarillo, con el triángulo y role="status"', () => {
		const body = html({ tone: 'warn' });
		expect(outer(body)[1]).toMatch(/class="kv-notice warn\b/);
		expect(outer(body)[1]).toContain('role="status"');
		expect(body).toMatch(/lucide-triangle-alert/);
	});

	it('error: rojo y role="alert"', () => {
		const body = html({ tone: 'error' });
		expect(outer(body)[1]).toMatch(/class="kv-notice error\b/);
		expect(outer(body)[1]).toContain('role="alert"');
		expect(body).toMatch(/lucide-circle-alert/);
	});

	it('`role={null}`: una nota fija, sin región que se anuncie', () => {
		expect(outer(html({ tone: 'warn', role: null }))[1]).not.toContain('role=');
	});

	it('`role="alert"`: un aviso que aparece después de una acción', () => {
		expect(outer(html({ tone: 'warn', role: 'alert' }))[1]).toContain('role="alert"');
	});

	it('`compact`: la clase compacta, sigue siendo un bloque', () => {
		const [tag, attrs] = outer(html({ tone: 'warn', compact: true }));
		expect(tag).toBe('div');
		expect(attrs).toMatch(/\bcompact\b/);
	});

	it('`inline`: todo con <span> (puede ir dentro de un <label>) y compacto', () => {
		const body = html({ tone: 'warn', inline: true });
		const [tag, attrs] = outer(body);
		expect(tag).toBe('span');
		expect(attrs).toMatch(/\bcompact\b/);
		expect(attrs).toMatch(/\binline\b/);
		expect(body).not.toContain('<div');
	});

	it('`id` en el elemento de afuera', () => {
		expect(outer(html({ tone: 'warn', id: 'aviso-inventado' }))[1]).toContain(
			'id="aviso-inventado"'
		);
	});
});
