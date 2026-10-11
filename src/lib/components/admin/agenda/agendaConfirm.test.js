/**
 * Confirmaciones de la agenda en la página (nunca `window.confirm`): antes de guardar los eventos
 * movidos.
 */
import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import PendingBar from './PendingBar.svelte';

/**
 * El texto visible del HTML que devuelve `render`: saca cada etiqueta (y los comentarios que usa
 * Svelte) desde un `<` hasta el `>` siguiente, de una pasada; el resultado nunca tiene un `<`.
 * @param {string} html
 */
const text = (html) =>
	html
		.split('<')
		.map((part, i) => (i === 0 ? part : part.slice(part.indexOf('>') + 1 || part.length)))
		.join(' ')
		.replace(/\s+/g, ' ')
		.trim();

describe('text (helper de estos tests)', () => {
	it('saca etiquetas y comentarios, aunque vengan anidados o sin cerrar', () => {
		expect(text('<p>Hola <!--[--><b>vos</b><!--]--></p>')).toBe('Hola vos');
		const t = text('a<!--<!-- -->-->b<scr<script>ipt>c<img');
		expect(t).not.toContain('<');
		expect(t).toBe('a -->b ipt>c');
	});
});

describe('PendingBar («Guardar cambios» confirma primero)', () => {
	const summary = 'Vas a mover: «Fiesta de prueba» del sáb 12 dic al sáb 19 dic.';

	it('sin confirmar: el conteo y «Guardar cambios», sin la lista', () => {
		const t = text(render(PendingBar, { props: { count: 1, summary } }).body);
		expect(t).toContain('cambio sin guardar');
		expect(t).toContain('Guardar cambios');
		expect(t).not.toContain('Vas a mover');
		expect(t).not.toContain('Confirmar');
	});

	it('confirmando: la lista de lo que se mueve con Confirmar / Volver', () => {
		const t = text(render(PendingBar, { props: { count: 1, summary, confirming: true } }).body);
		expect(t).toContain(summary);
		expect(t).toContain('Confirmar');
		expect(t).toContain('Volver');
		expect(t).not.toContain('Guardar cambios');
	});

	it('guardando no muestra la confirmación', () => {
		const t = text(
			render(PendingBar, { props: { count: 1, summary, confirming: true, saving: true } }).body
		);
		expect(t).not.toContain('Vas a mover');
		expect(t).toContain('Guardando…');
	});
});
