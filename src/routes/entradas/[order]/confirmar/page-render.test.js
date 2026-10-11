/**
 * Los links «Confirmar mi reserva» de los mails viejos (decisión 0031): la página dice hasta
 * cuándo está guardada la reserva, con la hora exacta, o que ya venció. No hay botón para
 * confirmar. Desde el servidor, en hora de Argentina con la aclaración (ExpiryTime la cambia por
 * la hora local en el navegador). Orden inventada.
 */
import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import { textOf } from '$lib/testing/html.js';
import { expiryMoment } from '$lib/utils/expiry.js';
import Page from './+page.svelte';

const AR = { timeZone: 'America/Argentina/Buenos_Aires' };

/** @param {Record<string, unknown>} order */
const rendered = (order) =>
	render(Page, {
		props: {
			data: /** @type {any} */ ({ order: { id: 'orden-inventada', ...order } }),
			form: null
		}
	}).body;

/** @param {Record<string, unknown>} order */
const body = (order) => textOf(rendered(order)).replace(/\s+/g, ' ');

describe('/entradas/[order]/confirmar (links de mails viejos)', () => {
	it('vigente: «Tu reserva ya está guardada hasta…», con el día y la hora de Argentina', () => {
		const expiresAt = Date.now() + 48 * 60 * 60 * 1000;
		const until = expiryMoment(expiresAt, Date.now(), { ...AR, until: true });
		expect(until).toMatch(/^hasta el \S+ \d+ de \S+ a las \d\d:\d\d$/);
		const text = body({ state: 'held', expiresAt });
		expect(text).toContain(
			`Tu reserva ya está guardada ${until}, hora de Argentina y Uruguay. No tenés que confirmar nada más`
		);
	});

	it('vencida: «Tu reserva ya venció»', () => {
		const text = body({ state: 'expired', expiresAt: Date.now() - 1000 });
		expect(text).toContain('Tu reserva ya venció');
		expect(text).not.toContain('guardada');
	});

	it('pagada: ya se confirmó el pago', () => {
		expect(body({ state: 'paid', expiresAt: Date.now() })).toContain('Ya confirmamos tu pago');
	});

	it('nunca hay un botón ni un formulario para confirmar; sí el link al estado de la compra', () => {
		for (const state of ['held', 'expired', 'paid']) {
			const html = rendered({ state, expiresAt: Date.now() + 1000 });
			expect(html).not.toContain('<form');
			expect(html).not.toContain('<button');
			expect(textOf(html)).not.toContain('Confirmar mi reserva');
			expect(html).toContain('href="/entradas/orden-inventada/estado"');
		}
	});
});
