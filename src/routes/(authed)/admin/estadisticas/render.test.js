/**
 * Las tres pestañas de Estadísticas renderizadas con datos inventados: cada una muestra sus
 * bloques (y no los de las otras), el filtro de período marca el elegido y los links llevan el
 * período en la URL.
 */
import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import { textOf } from '$lib/testing/html.js';
import { SALES_PERIODS, VISITS_PERIODS, parsePeriod } from '$lib/admin/statsPeriod.js';
import { attendancePage, salesPage } from '$lib/server/admin/statsPages.js';
import Ventas from './ventas/+page.svelte';
import Asistencia from './asistencia/+page.svelte';
import Visitas from './visitas/+page.svelte';

const NOW = Date.parse('2026-10-11T15:00:00Z');
const BASE = 'https://kinkyvibe.test';

/** @param {string} html */
const text = (html) => textOf(html).replace(/\s+/g, ' ').trim();

/**
 * Los links del filtro de período, como URLs, y cuál está marcado. Sin expresiones regulares
 * sobre el HTML: se corta con indexOf.
 * @param {string} html
 */
function periodLinks(html) {
	const navAt = html.indexOf('aria-label="Período"');
	const nav = html.slice(navAt, html.indexOf('</nav>', navAt));
	return nav
		.split('<a')
		.slice(1)
		.map((tag) => {
			const open = tag.slice(0, tag.indexOf('>'));
			const href = open.split('href="')[1].split('"')[0].split('&amp;').join('&');
			return { url: new URL(href, BASE), current: open.includes('aria-current="true"') };
		});
}

let n = 0;
/** @param {Partial<import('$lib/server/admin/people.js').PersonOrder>} o */
function order(o) {
	n++;
	return {
		id: `o${n}`,
		event_slug: 'fiesta-2026-09',
		ticket_type: 'general',
		quantity: 1,
		total: 1000,
		payment_method: 'mercadopago',
		fondo_option: 'completo',
		fondo_amount: 0,
		fondo_contribution: 0,
		surcharge_amount: 0,
		buyer_name: 'Persona Inventada',
		buyer_pronouns: null,
		buyer_email: `persona${n}@example.com`,
		status: 'approved',
		created_at: Date.parse('2026-09-01T12:00:00-03:00'),
		checked: 1,
		...o
	};
}
const orders = [
	order({}),
	order({ quantity: 2, total: 2000, payment_method: 'transferencia' }),
	order({ event_slug: 'taller-2026-09', checked: 0 })
];
/** @type {Map<string, import('$lib/server/admin/people.js').EventInfo>} */
const events = new Map([
	['fiesta-2026-09', { title: 'Fiesta Inventada (septiembre)', start: '2026-09-20T22:00-03:00' }],
	['taller-2026-09', { title: 'Taller Inventado', start: '2026-09-25T18:00-03:00' }]
]);

describe('Ventas', () => {
	const period = parsePeriod('90d', SALES_PERIODS, '12m');
	const sales = salesPage(orders, events, { period, now: NOW });

	it('KPIs del período, ventas, series, medios de pago y Fondo; nada de asistencia ni visitas', () => {
		const html = render(Ventas, {
			props: { data: /** @type {any} */ ({ dbAvailable: true, period: '90d', serie: '', sales }) }
		}).body;
		const t = text(html);
		expect(t).toContain('Ventas en el tiempo');
		expect(t).toContain('Entradas vendidas');
		expect(t).toContain('últimos 90 días');
		for (const block of ['Por serie', 'Cómo pagan', 'Opciones del fondo', 'Fondo y finanzas'])
			expect(t, block).toContain(block);
		expect(t).toContain('Fiesta Inventada');
		expect(t).toContain('Transferencia');
		// Lo de las otras pestañas no está (solo el link).
		for (const other of ['Vendidas y entraron', 'Primera vez y vuelven', 'Asistencia por evento'])
			expect(t, other).not.toContain(other);
		expect(t).not.toContain('Páginas más vistas');
		// Selector de serie con las series de las ventas.
		expect(t).toContain('Todas las series');
		expect(t).toContain('Taller Inventado');
		// Período: los cuatro links, con el elegido marcado.
		const links = periodLinks(html);
		expect(links.map((l) => l.url.searchParams.get('periodo'))).toEqual([
			'30d',
			'90d',
			'12m',
			'todo'
		]);
		expect(links.every((l) => l.url.pathname === '/admin/estadisticas/ventas')).toBe(true);
		expect(links.filter((l) => l.current).map((l) => l.url.searchParams.get('periodo'))).toEqual([
			'90d'
		]);
	});

	it('con una serie elegida, los links de período la conservan y se dice cuál es', () => {
		const one = salesPage(orders, events, { period, serie: 'taller', now: NOW });
		const html = render(Ventas, {
			props: {
				data: /** @type {any} */ ({ dbAvailable: true, period: '90d', serie: 'taller', sales: one })
			}
		}).body;
		expect(text(html)).toContain('Solo la serie Taller Inventado');
		for (const l of periodLinks(html)) expect(l.url.searchParams.get('serie')).toBe('taller');
	});

	it('sin base: «Sin datos», con el filtro igual', () => {
		const html = render(Ventas, {
			props: {
				data: /** @type {any} */ ({ dbAvailable: false, period: '12m', serie: '', sales: null })
			}
		}).body;
		expect(text(html)).toContain('No hay base de datos disponible.');
		expect(
			periodLinks(html)
				.find((l) => l.current)
				?.url.searchParams.get('periodo')
		).toBe('12m');
	});
});

describe('Asistencia', () => {
	const period = parsePeriod('12m', SALES_PERIODS, '12m');
	const attendance = attendancePage(orders, events, { period, now: NOW, seriesIndex: new Map() });

	it('KPIs de asistencia, los gráficos de vuelta y la tabla por evento; nada de ventas', () => {
		const html = render(Asistencia, {
			props: { data: /** @type {any} */ ({ dbAvailable: true, period: '12m', attendance }) }
		}).body;
		const t = text(html);
		for (const block of [
			'Vinieron',
			'Personas que entraron',
			'Primera vez',
			'Vuelven',
			'Vendidas y entraron',
			'Primera vez y vuelven',
			'Vuelven a la misma serie',
			'Vuelven, por serie',
			'Asistencia por evento'
		])
			expect(t, block).toContain(block);
		expect(t).toContain('Fiesta Inventada (septiembre)');
		expect(t).toContain('Taller Inventado');
		expect(t).not.toContain('Cómo pagan');
		expect(t).not.toContain('Fondo y finanzas');
		expect(t).not.toContain('Todas las series');
		const links = periodLinks(html);
		expect(links.every((l) => l.url.pathname === '/admin/estadisticas/asistencia')).toBe(true);
		expect(links.find((l) => l.current)?.url.searchParams.get('periodo')).toBe('12m');
		// Nadie con nombre ni mail.
		expect(t).not.toContain('@example.com');
		expect(t).not.toContain('Persona Inventada');
	});
});

describe('Visitas al sitio', () => {
	/** @type {import('$lib/server/analytics/report.js').VisitsReport} */
	const visits = {
		configured: true,
		missing: [],
		error: null,
		liveFrom: '2026-09-01',
		topDays: 7,
		totals: { views: 150, phoneShare: 0.8, countries: 2 },
		previousViews: 100,
		daily: [{ day: '2026-10-05', label: '5/10', views: 30 }],
		months: [{ month: '2026-10', label: 'oct 2026', views: 30, saved: false }],
		pages: [{ key: '/calendario/fiesta-inventada', n: 100 }],
		sources: [{ key: 'instagram.com', n: 60 }],
		countries: [{ key: 'AR', n: 140 }],
		devices: [{ key: 'phone', n: 120 }],
		funnel: []
	};

	it('visitas del período con la comparación, el aviso de los 3 meses y nada de ventas', () => {
		const html = render(Visitas, {
			props: { data: /** @type {any} */ ({ period: '7d', visits }) }
		}).body;
		const t = text(html);
		expect(t).toContain('Visitas al sitio');
		expect(t).toContain('últimos 7 días');
		expect(t).toContain('▲ 50 % vs. los 7 días anteriores');
		// El título del gráfico (va en su nombre accesible) dice desde cuándo.
		expect(html).toContain('Visitas por día desde el 2026-10-05');
		expect(t).toContain('Páginas más vistas');
		expect(t).toContain('Visitas por mes');
		expect(t).toContain('unos 3 meses');
		expect(t).toContain('hasta 90 días');
		expect(t).not.toContain('Entradas vendidas');
		expect(t).not.toContain('Asistencia por evento');
		const links = periodLinks(html);
		expect(links.map((l) => l.url.searchParams.get('periodo'))).toEqual(
			VISITS_PERIODS.map((p) => p.id)
		);
		expect(links.every((l) => l.url.pathname === '/admin/estadisticas/visitas')).toBe(true);
		expect(links.find((l) => l.current)?.url.searchParams.get('periodo')).toBe('7d');
	});
});
