/**
 * Panel → Eventos: «Online con lugar» es una lista de «Para revisar» (pedido de gorrite): no tiene
 * chip en la barra de filtros, se llega con su link (`?filtro=online-con-lugar`) y la página dice
 * en qué lista estás, con cómo salir. Datos inventados.
 */
import { describe, expect, it, vi } from 'vitest';
import { render } from 'svelte/server';

const url = vi.hoisted(() => ({ current: 'http://localhost/admin/eventos' }));
vi.mock('$app/stores', async () => {
	const { readable } = await import('svelte/store');
	return {
		page: readable(null, (set) => {
			set(/** @type {any} */ ({ url: new URL(url.current) }));
		})
	};
});

const { default: Page } = await import('./+page.svelte');

const NOW = Date.parse('2031-06-15T15:00:00Z');

/**
 * @param {string} slug
 * @param {Record<string, unknown>} [over]
 */
const row = (slug, over = {}) => ({
	slug,
	title: `Evento ${slug}`,
	start: '2031-07-01T20:00-03:00',
	end: '',
	status: '',
	locationName: 'Sala Inventada',
	location: '',
	place: '',
	unlisted: false,
	unpublished: false,
	online: false,
	onlineMismatch: false,
	thumb: '/img.webp',
	sellsTickets: false,
	capacity: null,
	goal: '',
	sold: 0,
	revenue: 0,
	mpFee: 0,
	transfers: 0,
	i: 0,
	...over
});

/** @param {string} href */
function page(href) {
	url.current = href;
	const events = [
		row('online-con-lugar-inventado', { onlineMismatch: true, i: 0 }),
		row('presencial-inventado', { i: 1 })
	];
	const data = /** @type {any} */ ({
		events,
		counts: { proximos: 2, pasados: 0, borradores: 0, 'sin-imagen': 0, 'online-con-lugar': 1 },
		total: 2,
		older: 0,
		now: NOW
	});
	return render(Page, { props: { data } }).body;
}

/** @param {string} body */
const chips = (body) => body.match(/<nav class="chips[\s\S]*?<\/nav>/)?.[0] ?? '';

describe('Panel → Eventos: «Online con lugar»', () => {
	it('la barra de filtros no tiene el chip (aunque haya alguno)', () => {
		const bar = chips(page('http://localhost/admin/eventos'));
		expect(bar).toContain('Próximos');
		expect(bar).toContain('Sin imagen');
		expect(bar).not.toContain('Online con lugar');
		expect(bar).not.toContain('filtro=online-con-lugar');
	});

	it('sin el filtro: no hay aviso de lista, y la fila igual lleva su marca', () => {
		const body = page('http://localhost/admin/eventos');
		expect(body).not.toContain('id="review-list-title"');
		expect(body).toContain('online con lugar');
	});

	it('con el filtro en la dirección: solo esos eventos, con título, explicación y cómo salir', () => {
		const body = page('http://localhost/admin/eventos?filtro=online-con-lugar');
		expect(body).toContain('id="review-list-title"');
		expect(body).toContain('Eventos con lugar y etiqueta «Online»');
		expect(body).toContain('los últimos 30 días');
		expect(body).toContain('href="/admin#para-revisar"');
		expect(body).toContain('href="?filtro=proximos"');
		expect(body).toContain('Ver todos los eventos');
		// La lista: el que avisa, con «Editar» a las etiquetas; el presencial, no.
		expect(body).toContain('Evento online-con-lugar-inventado');
		expect(body).not.toContain('Evento presencial-inventado');
		expect(body).toContain('href="/admin/eventos/online-con-lugar-inventado/editar#sec-etiquetas"');
		// Sigue sin chip.
		expect(chips(body)).not.toContain('Online con lugar');
	});
});
