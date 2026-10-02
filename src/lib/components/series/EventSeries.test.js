/**
 * Las series en la página de un evento pasado, render del servidor: el calendario .ics de la serie
 * («Suscribite a las fechas de…») no se ofrece con cuenta y «Lo que sigo», porque seguir ya pone
 * las fechas en tu calendario (pedido de gorrite); sin cuenta o sin «Lo que sigo», sigue.
 * Datos inventados.
 */
import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import EventSeries from './EventSeries.svelte';

const serie = {
	id: 'Serie-de-prueba',
	name: 'Serie de prueba',
	href: '/wiki/Serie-de-prueba',
	icon: '🔁',
	number: 2,
	total: 2,
	prev: null,
	next: null,
	past: true,
	nextUpcoming: null
};

/** @param {{ member: boolean, sigo?: boolean, invite?: boolean }} account */
const html = (account) =>
	render(EventSeries, {
		props: {
			part: 'after',
			origin: 'https://kinkyvibe.ar',
			series: { list: [serie], account: { subscribed: [], ...account } }
		}
	}).body;

describe('EventSeries (después del contenido)', () => {
	it('con cuenta y «Lo que sigo»: sin el .ics de la serie', () => {
		expect(html({ member: true, sigo: true })).not.toContain('Suscribite a');
	});

	it('sin cuenta, o con cuenta sin «Lo que sigo»: con el .ics de la serie', () => {
		for (const account of [{ member: false, sigo: true }, { member: false }, { member: true }]) {
			expect(html(account)).toContain('Suscribite a las fechas de Serie de prueba');
		}
	});

	it('sin sesión y con «Lo que sigo»: invita a entrar para seguir la serie', () => {
		const h = html({ member: false, invite: true });
		expect(h).toContain('Entrá con tu mail y seguí Serie de prueba');
		expect(h).toContain('/ingresar?next=%2Fwiki%2FSerie-de-prueba');
	});

	it('sin la invitación: con sesión, o sin «Lo que sigo»', () => {
		for (const account of [
			{ member: false, invite: false },
			{ member: false },
			{ member: true, invite: true }
		]) {
			expect(html(account)).not.toContain('Entrá con tu mail');
		}
	});
});
