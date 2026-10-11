/**
 * La tarjeta de un evento con entradas propias: «Comprar entradas» (o «Agotadas», «Venta
 * cerrada») en lugar del botón de inscripción; los eventos sin entradas acá quedan como siempre.
 * Render del servidor: el link a /entradas (y el externo) se arman al montar, porque un <a>
 * adentro del <a> de la tarjeta rompería la hidratación; en el servidor va una etiqueta igual.
 */
import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import PostListItem from './PostListItem.svelte';
import { withoutComments } from '$lib/testing/html.js';

/** @param {Record<string, any>} [extra] */
const post = (extra = {}) => ({
	path: '/calendario/evento-inventado',
	meta: {
		title: 'Taller inventado',
		summary: 'Un evento de prueba.',
		tags: [],
		category: 'calendario',
		layout: 'calendario',
		postID: 'evento-inventado',
		status: 'abierto',
		start: '2099-12-01T20:00-03:00',
		end: '2099-12-01T22:00-03:00',
		tickets: [{ id: 'general', name: 'General', price: 5000 }],
		...extra
	}
});

/** @param {Partial<import('$lib/utils/ticketCta.js').ListTicketState>} s */
const states = (s) => ({ 'evento-inventado': { open: false, reason: null, opensAt: null, ...s } });

/** @param {Record<string, any>} props */
const body = (props) => render(PostListItem, { props: /** @type {any} */ (props) }).body;

/** Lo que dice el lugar del botón (la etiqueta `.CTA`): [clase extra, texto], o null. */
const cta = (/** @type {string} */ html) =>
	html.match(/<span class="CTA( note)?[^"]*"[^>]*>([^<]*)<\/span>/)?.slice(1) ?? null;

describe('PostListItem: venta de entradas', () => {
	it('venta abierta: «Comprar entradas», sin precio', () => {
		const html = body({ post: post(), ticketStates: states({ open: true }) });
		expect(cta(html)).toEqual([undefined, 'Comprar entradas']);
		expect(html).not.toContain('$');
		expect(html).not.toContain('INSCRIPCIÓN');
	});

	it('sin el estado (página prerenderizada): «Comprar entradas» igual', () => {
		expect(cta(body({ post: post(), ticketStates: null }))).toEqual([
			undefined,
			'Comprar entradas'
		]);
	});

	it('agotadas: un aviso, no un botón', () => {
		const html = body({ post: post(), ticketStates: states({ reason: 'soldout' }) });
		expect(cta(html)).toEqual([' note', 'Agotadas']);
		expect(html).not.toContain('Comprar entradas');
	});

	it('venta cerrada: un aviso, no un botón', () => {
		const html = body({ post: post(), ticketStates: states({ reason: 'closed' }) });
		expect(cta(html)).toEqual([' note', 'Venta cerrada']);
		expect(html).not.toContain('Comprar entradas');
	});

	it('sin entradas acá: nada de entradas (el link externo se arma al montar, como siempre)', () => {
		const html = body({
			post: post({ tickets: undefined, link: 'https://example.com/inscripcion' }),
			ticketStates: {}
		});
		expect(cta(html)).toBeNull();
		expect(html).not.toContain('Comprar entradas');
		// El botón de calendario sigue igual (evento con link y abierto).
		expect(html).toContain('<add-to-calendar-button');
	});

	it('evento terminado: ni botón ni aviso', () => {
		const html = body({
			post: post({ start: '2001-01-01T20:00-03:00', end: '2001-01-01T22:00-03:00' }),
			ticketStates: states({ open: true })
		});
		expect(cta(html)).toBeNull();
		expect(html).toContain('TERMINADO');
	});
});

/*
 * Las etiquetas de la lista usan el chip compartido (TagChip, `.kv-tag`), el mismo que la página
 * del evento y los filtros (decisión de gorrite, 4/10). En el servidor van sin link: un <a> en el
 * <a> de la tarjeta rompería la hidratación (el link se arma al montar).
 */
describe('PostListItem: etiquetas', () => {
	it('cada etiqueta es un chip `.kv-tag` (y KinkyVibe no sale como chip)', () => {
		const html = body({
			post: post({ tags: ['etiqueta inventada', 'otra inventada', 'KinkyVibe'] })
		});
		const chips = [
			...withoutComments(html).matchAll(/<span class="kv-tag[^"]*"[^>]*>([^<]*)<\/span>/g)
		].map((m) => m[1]);
		expect(chips).toEqual(['etiqueta inventada', 'otra inventada']);
		expect(html).not.toMatch(/class="tag\b/);
		expect(html).not.toMatch(/<a [^>]*rel="tag"/);
	});
});
