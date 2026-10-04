/**
 * La página de una entrada (/entradas/t/<token>): el estado «Ya se usó para ingresar» lleva un
 * espacio antes de la fecha del ingreso (salía «ingresar(2/10/26, 13:14)»). Datos inventados.
 */
import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import Page from './+page.svelte';

/** @param {Record<string, any>} ticket */
const stateText = (ticket) => {
	const data = /** @type {any} */ ({
		event: {
			slug: 'evento-de-prueba',
			title: 'Evento de prueba',
			when: 'sábado 10 de octubre',
			where: 'Lugar inventado',
			online: false
		},
		ticket: {
			holder: 'Persona de Prueba',
			pronouns: 'elle',
			type: 'General',
			code: 'ABC123',
			state: 'valid',
			checkedInAt: null,
			...ticket
		},
		qr: 'data:image/gif;base64,R0lGODlhAQABAAAAACw=',
		streamLink: null,
		isAdmin: false
	});
	const { body } = render(Page, { props: { data, form: null } });
	const from = body.indexOf('class="state');
	const html = body.slice(body.indexOf('>', from) + 1, body.indexOf('</dd>', from));
	// Sin poner espacios en lugar de las etiquetas: lo que importa es si están en el texto.
	return html
		.replace(/<!--[\s\S]*?-->/g, '')
		.replace(/<[^<>]*>/g, '')
		.replace(/\s+/g, ' ')
		.trim();
};

describe('/entradas/t/<token>: el estado', () => {
	it('usada: «Ya se usó para ingresar (fecha, hora)», con espacio antes del paréntesis', () => {
		// 2/10/2026 13:14 en Buenos Aires.
		const checkedInAt = Date.parse('2026-10-02T13:14:00-03:00');
		expect(stateText({ state: 'used', checkedInAt })).toBe(
			'Ya se usó para ingresar (2/10/26 13:14)'
		);
	});

	it('válida: solo el estado', () => {
		expect(stateText({})).toBe('Válida');
	});
});
