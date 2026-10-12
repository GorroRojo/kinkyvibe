/**
 * Badge: siempre con ícono; `bad` (agotadas, borrada) y el tono `accent` (el rosa de la marca
 * para destacar algo que no es malo, como «Hoy»; gorrite, 12/10). Los colores salen de la clase
 * del tono (`.bad` → `--error`, `.accent` → la marca), que se ve en la galería /estilo.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { render } from 'svelte/server';
import Badge from './Badge.svelte';
import { withoutComments } from '$lib/testing/html.js';

/** @param {Record<string, any>} props */
const html = (props) => withoutComments(render(Badge, { props: /** @type {any} */ (props) }).body);

describe('Badge', () => {
	it('accent: la clase del tono y el ícono de siempre', () => {
		const body = html({ tone: 'accent' });
		expect(body).toMatch(/class="badge accent\b/);
		expect(body).toMatch(/lucide-circle\b/);
	});

	it('bad: con el ícono de alerta', () => {
		const body = html({ tone: 'bad', filled: true });
		expect(body).toMatch(/class="badge bad\b[^"]*filled/);
		expect(body).toMatch(/lucide-circle-alert/);
	});

	it('«malo» va en el rojo de los errores; la píldora usa el token de radio', () => {
		const css = readFileSync(new URL('./Badge.svelte', import.meta.url), 'utf8');
		expect(css).toMatch(/\.bad \{\s*--c: var\(--error\);/);
		expect(css).toMatch(/\.filled\.bad \{\s*background: var\(--error\);/);
		expect(css).toMatch(/border-radius: var\(--radius-pill\);/);
	});
});
