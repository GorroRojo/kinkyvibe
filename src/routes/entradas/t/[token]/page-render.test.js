/**
 * La página de una entrada (/entradas/t/<token>): el estado «Ya se usó para ingresar» lleva un
 * espacio antes de la fecha del ingreso (salía «ingresar(2/10/26, 13:14)»). Datos inventados.
 */
import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import Page from './+page.svelte';
import { stripHtmlTags } from '$lib/utils/htmlStrip.js';
import { noticeBefore, textOf } from '$lib/testing/html.js';

/** @param {Record<string, any>} ticket @param {Record<string, any>} [extra] */
const pageData = (ticket, extra = {}) =>
	/** @type {any} */ ({
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
		isAdmin: false,
		...extra
	});

/** @param {Record<string, any>} ticket */
const stateText = (ticket) => {
	const { body } = render(Page, { props: { data: pageData(ticket), form: null } });
	const from = body.indexOf('class="state');
	const html = body.slice(body.indexOf('>', from) + 1, body.indexOf('</dd>', from));
	// Sin poner espacios en lugar de las etiquetas: lo que importa es si están en el texto.
	return stripHtmlTags(html).replace(/\s+/g, ' ').trim();
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

describe('/entradas/t/<token>: «Marcar ingreso» (admin)', () => {
	/** @param {Record<string, any>} checkin */
	const result = (checkin) =>
		render(Page, {
			props: { data: pageData({}, { isAdmin: true }), form: /** @type {any} */ ({ checkin }) }
		}).body;

	it('ya ingresó: aviso amarillo (Notice) que se anuncia, sin «⚠️» en el texto', () => {
		const at = Date.parse('2026-10-02T13:14:00-03:00');
		const body = result({ result: 'already', at, by: 'alguien-inventado' });
		expect(textOf(body)).toContain('Ya ingresó (2/10/26 13:14, por alguien-inventado).');
		const tag = noticeBefore(body, 'Ya ingresó');
		expect(tag).toContain('class="kv-notice warn');
		expect(tag).toContain('role="alert"');
		expect(body).not.toContain('⚠️');
	});

	it('registrado en verde; anulada e inválida en rojo', () => {
		expect(noticeBefore(result({ result: 'ok' }), 'Ingreso registrado.')).toContain(
			'class="kv-notice ok'
		);
		expect(noticeBefore(result({ result: 'void' }), 'Entrada anulada.')).toContain(
			'class="kv-notice error'
		);
		expect(noticeBefore(result({ result: 'invalid' }), 'Entrada inválida.')).toContain(
			'class="kv-notice error'
		);
	});
});
