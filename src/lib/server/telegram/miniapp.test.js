/**
 * La Mini App del calendario: los próximos eventos por día, con lo público y links al sitio.
 * Eventos inventados.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import { cleanBotTextOverrides } from '$lib/utils/botTexts.js';
import { APP_MAX_EVENTS, groupByDay, miniAppData, miniAppTexts } from './miniapp.js';
import { saveBotTextOverrides } from './texts.js';

vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

const ORIGIN = 'https://ejemplo.test';
const NOW = Date.parse('2031-01-08T12:00:00-03:00');

/** @param {string} postID @param {string} start @param {object} [extra] */
const post = (postID, start, extra = {}) => ({
	meta: { postID, title: `Evento inventado ${postID}`, start, category: 'calendario', ...extra }
});

describe('groupByDay', () => {
	it('agrupa por día en hora de Argentina, en orden, sin lo pasado', () => {
		const days = groupByDay(
			[
				post('b', '2031-01-09T21:00:00-03:00'),
				post('pasado', '2031-01-01T21:00:00-03:00'),
				post('a', '2031-01-09T19:00:00-03:00'),
				// 00:30 del 10 en Argentina, aunque en UTC sea otro día.
				post('c', '2031-01-10T00:30:00-03:00', { status: 'cancelado' })
			],
			null,
			{ now: NOW, origin: ORIGIN }
		);
		expect(days.map((d) => [d.day, d.events.map((e) => e.slug)])).toEqual([
			['jueves 9 de enero', ['a', 'b']],
			['viernes 10 de enero', ['c']]
		]);
		expect(days[0].events[0]).toMatchObject({
			time: '19:00',
			href: `${ORIGIN}/calendario/a`,
			image: null,
			ticket: null
		});
		expect(days[1].events[0].cancelled).toBe(true);
	});

	it('lugar público, imagen absoluta y comprar en el sitio', () => {
		const [day] = groupByDay(
			[
				post('x', '2031-01-09T19:00:00-03:00', {
					location_name: 'Lugar de Prueba',
					featured: '/media/afiche.jpg',
					tickets: [{ name: 'General' }]
				})
			],
			null,
			{ now: NOW, origin: ORIGIN }
		);
		expect(day.events[0]).toMatchObject({
			place: 'Lugar de Prueba',
			image: `${ORIGIN}/media/afiche.jpg`,
			ticket: { text: 'Comprar en el sitio', href: `${ORIGIN}/calendario/x/entradas` }
		});
	});

	it('agotadas: aviso sin link', () => {
		const [day] = groupByDay(
			[post('x', '2031-01-09T19:00:00-03:00', { tickets: [{ name: 'General' }] })],
			{ x: { open: false, reason: 'soldout', opensAt: null } },
			{ now: NOW, origin: ORIGIN }
		);
		expect(day.events[0].ticket).toEqual({ text: 'Agotadas', href: null });
	});

	it('no más de APP_MAX_EVENTS', () => {
		const many = Array.from({ length: APP_MAX_EVENTS + 5 }, (_, i) =>
			post(`e${i}`, new Date(NOW + (i + 1) * 3600e3).toISOString())
		);
		const total = groupByDay(many, null, { now: NOW, origin: ORIGIN }).flatMap((d) => d.events);
		expect(total).toHaveLength(APP_MAX_EVENTS);
	});
});

describe('los textos de la página («Textos del bot»)', () => {
	it('sin nada cambiado, los de siempre', () => {
		expect(miniAppTexts()).toEqual({
			titulo: 'Calendario',
			bajada: 'Lo que viene en Kinky Vibe. Para comprar entradas se abre el sitio.',
			botonInicio: '📲 Agregar a la pantalla de inicio',
			agregada: 'Listo: quedó en tu pantalla de inicio.',
			vacio: 'Por ahora no hay eventos próximos.',
			cancelado: 'Cancelado',
			comprar: 'Comprar en el sitio',
			verTodo: 'Ver el calendario completo en el sitio ↗'
		});
	});

	it('lo cambiado en el panel reemplaza al original, texto solo (sin formato)', () => {
		const overrides = cleanBotTextOverrides({
			'miniapp.titulo': 'Agenda',
			'miniapp.boton_comprar': 'Sacá tu entrada',
			// Con formato no vale: queda el original.
			'miniapp.vacio': '**Nada** por ahora'
		});
		const texts = miniAppTexts(overrides);
		expect(texts.titulo).toBe('Agenda');
		expect(texts.comprar).toBe('Sacá tu entrada');
		expect(texts.vacio).toBe('Por ahora no hay eventos próximos.');
	});

	it('el botón de comprar usa el texto que le pasan', () => {
		const [day] = groupByDay(
			[post('x', '2031-01-09T19:00:00-03:00', { tickets: [{ name: 'General' }] })],
			null,
			{ now: NOW, origin: ORIGIN, buyText: 'Sacá tu entrada' }
		);
		expect(day.events[0].ticket).toEqual({
			text: 'Sacá tu entrada',
			href: `${ORIGIN}/calendario/x/entradas`
		});
	});
});

describe('miniAppData: los textos guardados en el panel llegan a la página', () => {
	/** @type {Awaited<ReturnType<typeof createTestDB>>} */
	let t;
	beforeAll(async () => {
		t = await createTestDB();
	});
	afterAll(async () => {
		await t?.dispose();
	});

	it('sin nada guardado, los de siempre; con algo guardado, lo guardado', async () => {
		await resetDB(t.db);
		expect((await miniAppData(t.platform, ORIGIN, NOW)).texts).toEqual(miniAppTexts());
		await saveBotTextOverrides(
			t.db,
			{ 'miniapp.titulo': 'Agenda', 'miniapp.vacio': 'Nada por ahora.' },
			{ by: 'admin-inventade', now: NOW }
		);
		const { texts } = await miniAppData(t.platform, ORIGIN, NOW);
		expect(texts.titulo).toBe('Agenda');
		expect(texts.vacio).toBe('Nada por ahora.');
		expect(texts.bajada).toBe(miniAppTexts().bajada);
	});
});
