/**
 * Confirmar la reserva por transferencia: hasta cuándo se guarda el lugar, con la hora exacta.
 * Desde el servidor, en hora de Argentina con la aclaración (ExpiryTime la cambia por la hora
 * local en el navegador). Orden inventada.
 */
import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import { expiryMoment } from '$lib/utils/expiry.js';
import Page from './+page.svelte';

const AR = { timeZone: 'America/Argentina/Buenos_Aires' };
/**
 * El texto visible: saca cada etiqueta (y los comentarios de hidratación de Svelte) desde un `<`
 * hasta el `>` siguiente, de una pasada; el resultado nunca tiene un `<`.
 * @param {string} html
 */
const text = (html) =>
	html
		.split('<')
		.map((part, i) => (i === 0 ? part : part.slice(part.indexOf('>') + 1 || part.length)))
		.join('')
		.replace(/\s+/g, ' ');

/** @param {Record<string, unknown>} order */
const body = (order) =>
	text(
		render(Page, {
			props: {
				data: /** @type {any} */ ({ k: 'k-inventada', order: { id: 'orden-inventada', ...order } }),
				form: null
			}
		}).body
	);

describe('/entradas/[order]/confirmar', () => {
	it('confirmada: hasta cuándo, con el día y la hora de Argentina', () => {
		const expiresAt = Date.now() + 48 * 60 * 60 * 1000;
		const until = expiryMoment(expiresAt, Date.now(), { ...AR, until: true });
		expect(until).toMatch(/^hasta el \S+ \d+ de \S+ a las \d\d:\d\d$/);
		expect(body({ confirmed: true, expired: false, expiresAt, fullHours: 48 })).toContain(
			`Te guardamos el lugar ${until}, hora de Argentina y Uruguay.`
		);
	});

	it('sin confirmar: cuándo vence ahora', () => {
		const expiresAt = Date.now() + 2 * 60 * 60 * 1000;
		const when = expiryMoment(expiresAt, Date.now(), AR);
		expect(body({ confirmed: false, expired: false, expiresAt, fullHours: 48 })).toContain(
			`(ahora vence ${when}, hora de Argentina y Uruguay).`
		);
	});
});
