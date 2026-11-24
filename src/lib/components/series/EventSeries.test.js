/**
 * Las series en la página de un evento, render del servidor: una sola tarjeta «Próximas fechas
 * de <serie>» (gorrite, «A: una tarjeta») en vez de tres bloques. Sin cuenta, el mail de
 * «Avisame si se repite» y, en chico, el calendario de la serie; con cuenta y «Lo que sigo»,
 * «Seguir la serie» sin el .ics (seguir ya pone las fechas en tu calendario, pedido de gorrite).
 * Datos inventados.
 */
import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import EventSeries from './EventSeries.svelte';

/** @param {Record<string, unknown>} [extra] */
const serie = (extra = {}) => ({
	id: 'Serie-de-prueba',
	name: 'Serie de prueba',
	href: '/wiki/Serie-de-prueba',
	icon: '🔁',
	number: 2,
	total: 2,
	prev: null,
	next: null,
	past: true,
	nextUpcoming: null,
	...extra
});

/**
 * @param {{ member: boolean, sigo?: boolean, invite?: boolean }} account
 * @param {Array<ReturnType<typeof serie>>} [list]
 */
const html = (account, list = [serie()]) =>
	render(EventSeries, {
		props: {
			part: 'after',
			origin: 'https://kinkyvibe.ar',
			series: { list, account: { subscribed: [], ...account } }
		}
	}).body;

/** @param {string} h @param {string} text */
const count = (h, text) => h.split(text).length - 1;

describe('EventSeries (después del contenido): una tarjeta', () => {
	it('sin cuenta: el título, el mail y el calendario en una línea, sin textos repetidos', () => {
		for (const account of [
			{ member: false },
			{ member: false, sigo: true, invite: true },
			{ member: false, invite: false }
		]) {
			const h = html(account);
			expect(count(h, 'surface-card')).toBe(1);
			expect(count(h, 'Próximas fechas de Serie de prueba')).toBe(1);
			expect(h).toMatch(/<input[^>]*type="email"/);
			expect(h).toContain('Sumalas a tu calendario:');
			expect(h).toContain('webcal://kinkyvibe.ar/');
			expect(h).toContain('Copiar link');
			expect(h).not.toContain('Avisame si se repite');
			expect(h).not.toContain('Suscribite a');
			expect(h).not.toContain('Entrá con tu mail');
		}
	});

	it('vale igual para un evento que todavía no pasó', () => {
		const h = html({ member: false }, [serie({ past: false })]);
		expect(h).toContain('Próximas fechas de Serie de prueba');
		expect(h).toMatch(/<input[^>]*type="email"/);
	});

	it('con cuenta y «Lo que sigo»: sin el mail ni el .ics de la serie', () => {
		const h = html({ member: true, sigo: true });
		expect(h).toContain('Próximas fechas de Serie de prueba');
		expect(h).not.toMatch(/<input[^>]*type="email"/);
		expect(h).not.toContain('Sumalas a tu calendario');
	});

	it('con cuenta sin «Lo que sigo»: «Avisame» con la cuenta y el calendario', () => {
		const h = html({ member: true });
		expect(h).toMatch(/<input[^>]*name="cuenta"[^>]*value="1"/);
		expect(h).toContain('Sumalas a tu calendario:');
	});

	it('el ancla #seguir va una sola vez, en la tarjeta de la primera serie', () => {
		const h = html({ member: false }, [serie(), serie({ id: 'Otra', name: 'Otra' })]);
		expect(count(h, 'id="seguir"')).toBe(1);
		expect(h.indexOf('id="seguir"')).toBeLessThan(h.indexOf('Próximas fechas de Otra'));
	});

	it('si ya se anunció la próxima edición, lo dice arriba de la tarjeta', () => {
		const nextUpcoming = {
			slug: 'serie-3',
			title: 'Serie de prueba #3',
			start: '2099-12-01T20:00-03:00',
			path: '/calendario/serie-3'
		};
		const h = html({ member: false }, [serie({ nextUpcoming })]);
		expect(h).toContain('Ya se anunció la próxima edición de Serie de prueba');
		expect(h.indexOf('Ya se anunció')).toBeLessThan(h.indexOf('Próximas fechas de'));
	});
});
