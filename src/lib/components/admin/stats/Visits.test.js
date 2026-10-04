/**
 * Visitas en Estadísticas: el aviso «Falta configurar» dice exactamente qué cargar, y con datos
 * (inventados) se ven los paneles.
 */
import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import { analyticsConfig } from '$lib/server/analytics/sql.js';
import Visits from './Visits.svelte';

/** Texto visible (sin etiquetas). @param {string} html */
const text = (html) =>
	html
		.split('<')
		.map((part, i) => (i === 0 ? part : part.slice(part.indexOf('>') + 1 || part.length)))
		.join('')
		.replace(/\s+/g, ' ');

/** @returns {import('$lib/server/analytics/report.js').VisitsReport} */
const base = () => ({
	configured: true,
	missing: [],
	error: null,
	liveFrom: '2026-09-01',
	topDays: 30,
	totals: { views: 0, phoneShare: 0, countries: 0 },
	daily: [],
	months: [],
	pages: [],
	sources: [],
	countries: [],
	devices: [],
	funnel: []
});

describe('Visits', () => {
	it('sin configurar: «Falta configurar» con las dos variables y dónde cargarlas', () => {
		const config = analyticsConfig({});
		const visits = { ...base(), configured: false, missing: config.ok ? [] : config.missing };
		const t = text(render(Visits, { props: { visits } }).body);
		expect(t).toContain('Falta configurar las visitas');
		expect(t).toContain('CF_ACCOUNT_ID (Text)');
		expect(t).toContain('CF_ANALYTICS_TOKEN (Secret)');
		expect(t).toContain('Account Analytics: Read');
		expect(t).toContain('Variables and Secrets');
		expect(t).toContain('docs/analiticas.md');
		expect(t).not.toContain('Visitas por día');
	});

	it('con datos: visitas, rankings y el embudo por evento', () => {
		const visits = {
			...base(),
			totals: { views: 150, phoneShare: 0.8, countries: 2 },
			daily: [{ day: '2026-10-03', label: '3/10', views: 30 }],
			months: [{ month: '2026-10', label: 'oct 2026', views: 30, saved: false }],
			pages: [{ key: '/calendario/fiesta-rara', n: 100 }],
			sources: [
				{ key: '', n: 90 },
				{ key: 'instagram.com', n: 60 }
			],
			countries: [{ key: 'AR', n: 140 }],
			devices: [{ key: 'phone', n: 120 }],
			funnel: [
				{
					slug: 'fiesta-rara',
					title: 'Fiesta Rara (inventada)',
					evento: 100,
					abrio: 40,
					datos: 25,
					pagar: 20,
					orden: 12,
					aprobada: 8,
					rate: 0.08
				}
			]
		};
		const t = text(render(Visits, { props: { visits } }).body);
		expect(t).toContain('Visitas por día');
		expect(t).toContain('Páginas más vistas');
		expect(t).toContain('instagram.com');
		expect(t).toContain('Directo o desde el mismo sitio');
		expect(t).toContain('Celu');
		expect(t).toContain('Fiesta Rara (inventada)');
		expect(t).toContain('8 %');
		expect(t).not.toContain('Falta configurar');
	});

	it('si Cloudflare falla, muestra el aviso', () => {
		const t = text(
			render(Visits, { props: { visits: { ...base(), error: 'Cloudflare rechazó el token' } } })
				.body
		);
		expect(t).toContain('Cloudflare rechazó el token');
	});
});
