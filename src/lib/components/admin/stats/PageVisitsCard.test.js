/**
 * La tarjeta «Visitas» de las fichas: con datos (inventados) muestra 7 y 30 días, orígenes y los
 * pasos de la compra; sin visitas o sin configurar, una nota corta.
 */
import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import PageVisitsCard from './PageVisitsCard.svelte';

/** Texto visible (sin etiquetas). @param {string} html */
const text = (html) =>
	html
		.split('<')
		.map((part, i) => (i === 0 ? part : part.slice(part.indexOf('>') + 1 || part.length)))
		.join('')
		.replace(/\s+/g, ' ');

/** @returns {import('$lib/server/analytics/page.js').PageVisits} */
const base = () => ({
	status: 'ok',
	message: '',
	path: '/calendario/fiesta-rara',
	paths: ['/calendario/fiesta-rara'],
	statsHref: '/admin/estadisticas/visitas?pagina=%2Fcalendario%2Ffiesta-rara',
	week: 0,
	month: 0,
	daily: Array.from({ length: 30 }, (_, i) => ({ day: `d${i}`, label: `${i + 1}/10`, views: 0 })),
	sources: [],
	funnel: null,
	funnelDays: 90
});

describe('PageVisitsCard', () => {
	it('con datos: 7 y 30 días, el gráfico, de dónde llegan, la compra y el link', () => {
		const visits = {
			...base(),
			paths: ['/calendario/fiesta-rara', '/calendario/fiesta-vieja'],
			week: 16,
			month: 23,
			sources: [
				{ key: '', label: 'Directo o desde el mismo sitio', n: 13, share: 13 / 23 },
				{ key: 'instagram.com', label: 'instagram.com', n: 10, share: 10 / 23 }
			],
			funnel: { evento: 30, abrio: 8, datos: 5, pagar: 4, orden: 3, aprobada: 2 }
		};
		const html = render(PageVisitsCard, { props: { visits } }).body;
		const t = text(html);
		expect(t).toContain('Últimos 7 días 16');
		expect(t).toContain('Últimos 30 días 23');
		expect(html).toContain('aria-label="Visitas por día de los últimos 30 días');
		expect(t).toContain('De dónde llegan (30 días)');
		expect(t).toContain('instagram.com 43 %');
		expect(t).toContain('Pasos de la compra (90 días)');
		expect(t).toContain('Pagaron 2');
		expect(t).toContain('7 % de las visitas');
		expect(t).toContain('Suma las visitas a /calendario/fiesta-rara, /calendario/fiesta-vieja.');
		expect(html).toContain('href="/admin/estadisticas/visitas?pagina=%2Fcalendario%2Ffiesta-rara"');
		expect(t).toContain('Anónimo');
	});

	it('sin visitas: una nota, sin números', () => {
		const t = text(render(PageVisitsCard, { props: { visits: base() } }).body);
		expect(t).toContain('Todavía no hay visitas anotadas en los últimos 30 días.');
		expect(t).not.toContain('Últimos 7 días');
	});

	it('sin configurar: lo dice y lleva a Estadísticas › Visitas', () => {
		const visits = {
			...base(),
			status: /** @type {const} */ ('unconfigured'),
			message: 'Las visitas todavía no se pueden leer desde el panel (falta configurarlas).'
		};
		const html = render(PageVisitsCard, { props: { visits } }).body;
		expect(text(html)).toContain('falta configurarlas');
		expect(html).toContain('href="/admin/estadisticas/visitas"');
		expect(html).not.toContain('pagina=');
	});

	it('mientras llega (promesa): «Cargando las visitas…»', () => {
		const visits = new Promise(() => {});
		const t = text(render(PageVisitsCard, { props: { visits } }).body);
		expect(t).toContain('Cargando las visitas…');
	});
});
