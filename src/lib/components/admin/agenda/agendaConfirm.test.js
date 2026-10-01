/**
 * Confirmaciones de la agenda en la página (nunca `window.confirm`): antes de cargar un evento en
 * un día vacío y antes de guardar los eventos movidos.
 */
import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import ConfirmPrompt from './ConfirmPrompt.svelte';
import PendingBar from './PendingBar.svelte';
import { newEventQuestion } from '$lib/utils/calendario.js';

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

describe('ConfirmPrompt (día vacío)', () => {
	it('pregunta por el día con Cargar / Cancelar', () => {
		const { body } = render(ConfirmPrompt, {
			props: {
				message: newEventQuestion({ date: '2026-12-12' }),
				confirmLabel: 'Cargar',
				cancelLabel: 'Cancelar'
			}
		});
		expect(body).toContain('role="alertdialog"');
		const t = text(body);
		expect(t).toContain('¿Cargar un evento el sábado 12 de diciembre de 2026?');
		expect(t).toContain('Cargar');
		expect(t).toContain('Cancelar');
	});

	it('muestra el mensaje como texto, nunca como HTML', () => {
		const { body } = render(ConfirmPrompt, {
			props: { message: '¿Cargar <img src=x onerror=alert(1)>?' }
		});
		expect(body).not.toContain('<img src=x');
		expect(body).toContain('&lt;img src=x onerror=alert(1)>');
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
