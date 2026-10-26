/**
 * El bloque de compra de la página de un evento agotado (gorrite, 12/10): con la lista de espera
 * prendida y dónde anotarse (`tickets.waitlist`, lo arma la carga de la página), el botón grande
 * lleva al formulario de la página de compra; sin eso, el aviso «Agotadas.» de siempre.
 * Datos inventados.
 */
import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import Compra from './Compra.svelte';
import { textOf, withoutComments } from '$lib/testing/html.js';

const soldOut = {
	open: false,
	reason: 'soldout',
	priceFrom: 10000,
	gorraSuggested: null,
	left: null,
	opensAt: null,
	closesAt: null,
	door: { explicit: true, on: true, price: null },
	slug: 'taller-inventado'
};

/** @param {Record<string, unknown>} tickets */
const html = (tickets) => withoutComments(render(Compra, { props: { tickets } }).body);

describe('Compra: agotadas y lista de espera', () => {
	it('con lugar en la lista: «Agotadas · Anotate en la lista de espera» lleva al formulario', () => {
		const out = html({ ...soldOut, waitlist: true });
		expect(out).toContain('href="/calendario/taller-inventado/entradas#lista-espera"');
		expect(out).toContain('class="buy-button');
		expect(textOf(out)).toContain('Agotadas · Anotate en la lista de espera');
		expect(out).not.toContain('buy-closed');
		// La puerta se sigue mostrando abajo.
		expect(textOf(out)).toContain('También hay entradas en la puerta.');
	});

	it('sin lista (interruptor apagado o nada donde anotarse): el aviso de siempre, sin link', () => {
		const out = html(soldOut);
		expect(out).not.toContain('<a');
		expect(out).not.toContain('lista');
		expect(out).toContain('<p class="buy-closed');
		expect(textOf(out).replace(/\s+/g, ' ').trim()).toBe(
			'Agotadas. También hay entradas en la puerta.'
		);
	});

	it('la venta abierta no cambia aunque venga `waitlist`', () => {
		const open = { ...soldOut, open: true, reason: null };
		expect(html({ ...open, waitlist: true })).toBe(html(open));
	});
});

describe('Compra: la línea fija de +18 (gorrite, 26/10)', () => {
	const ADULTS = 'Solo para personas mayores de 18 años. Puede pedirse documento en la puerta.';
	const open = { ...soldOut, open: true, reason: null };

	it('con la venta abierta, debajo del botón; online, sin «documento en la puerta»', () => {
		expect(textOf(html(open))).toContain(ADULTS);
		const online = textOf(html({ ...open, online: true }));
		expect(online).toContain('Solo para personas mayores de 18 años.');
		expect(online).not.toContain('documento');
	});

	it('también con lista de espera y antes de que abra la venta', () => {
		expect(textOf(html({ ...soldOut, waitlist: true }))).toContain(ADULTS);
		expect(
			textOf(html({ ...soldOut, reason: 'notyet', opensAt: Date.now() + 86400000 }))
		).toContain(ADULTS);
	});

	it('sin nada para comprar (agotadas sin lista, cancelado), no', () => {
		expect(textOf(html(soldOut))).not.toContain('18 años');
		expect(textOf(html({ ...soldOut, reason: 'cancelled' }))).not.toContain('18 años');
	});
});
