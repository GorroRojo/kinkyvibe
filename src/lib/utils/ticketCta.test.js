import { describe, expect, it } from 'vitest';
import { hasOwnTickets, opensText, ticketCta } from './ticketCta.js';

/** @param {Record<string, any>} [extra] */
const meta = (extra = {}) => ({
	postID: 'evento-inventado',
	category: 'calendario',
	status: 'abierto',
	tickets: [{ id: 'general', name: 'General', price: 5000 }],
	...extra
});

/** @param {Partial<import('./ticketCta.js').ListTicketState>} s */
const states = (s) => ({ 'evento-inventado': { open: false, reason: null, opensAt: null, ...s } });

const BUY = {
	kind: 'buy',
	href: '/calendario/evento-inventado/entradas',
	text: 'Comprar entradas'
};

describe('hasOwnTickets', () => {
	it('solo eventos con `tickets`', () => {
		expect(hasOwnTickets(meta())).toBe(true);
		expect(hasOwnTickets(meta({ tickets: [] }))).toBe(false);
		expect(hasOwnTickets(meta({ tickets: undefined }))).toBe(false);
		expect(hasOwnTickets(meta({ category: 'material' }))).toBe(false);
		expect(hasOwnTickets(null)).toBe(false);
	});
});

describe('ticketCta (lo que muestra la tarjeta)', () => {
	it('sin entradas acá: null (queda el link externo de siempre)', () => {
		expect(ticketCta(meta({ tickets: undefined, link: 'https://example.com' }), null)).toBeNull();
		// Con el mapa, un evento que no está no vende acá.
		expect(ticketCta(meta(), {})).toBeNull();
	});

	it('abierta: «Comprar entradas» a /entradas, sin precio', () => {
		expect(ticketCta(meta(), states({ open: true }))).toEqual(BUY);
	});

	it('sin el estado (prerenderizado, sin base): el link a /entradas igual', () => {
		expect(ticketCta(meta(), null)).toEqual(BUY);
		expect(ticketCta(meta(), undefined)).toEqual(BUY);
	});

	it('agotadas, venta cerrada y no disponible: un aviso sin link', () => {
		expect(ticketCta(meta(), states({ reason: 'soldout' }))).toEqual({
			kind: 'note',
			text: 'Agotadas'
		});
		expect(ticketCta(meta(), states({ reason: 'closed' }))).toEqual({
			kind: 'note',
			text: 'Venta cerrada'
		});
		expect(ticketCta(meta(), states({ reason: 'unavailable' }))).toEqual({
			kind: 'note',
			text: 'Venta no disponible'
		});
	});

	it('todavía no abre: cuándo abre', () => {
		const opensAt = Date.parse('2099-10-05T20:00-03:00');
		expect(ticketCta(meta(), states({ reason: 'notyet', opensAt }))).toEqual({
			kind: 'note',
			text: 'Abre el 5/10'
		});
		expect(ticketCta(meta(), states({ reason: 'notyet' }))).toEqual({
			kind: 'note',
			text: 'Venta pronto'
		});
	});

	it('terminado, cancelado o «agotadas» en el frontmatter: nada (lo dice el encabezado)', () => {
		expect(ticketCta(meta(), states({ open: true }), { past: true })).toEqual({ kind: 'none' });
		expect(ticketCta(meta({ status: 'cancelado' }), null)).toEqual({ kind: 'none' });
		expect(ticketCta(meta({ status: 'agotadas' }), states({ reason: 'soldout' }))).toEqual({
			kind: 'none'
		});
		expect(ticketCta(meta(), states({ reason: 'cancelled' }))).toEqual({ kind: 'none' });
	});
});

describe('opensText', () => {
	it('día/mes en hora de Argentina', () => {
		// 01:00 UTC del 6/10 son las 22:00 del 5/10 en Buenos Aires.
		expect(opensText(Date.parse('2099-10-06T01:00Z'))).toBe('Abre el 5/10');
	});
});
