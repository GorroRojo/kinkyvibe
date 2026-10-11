/**
 * `/hoy`, `/semana` y `/finde`: las ventanas en hora de Argentina y lo que contesta el router.
 * Eventos inventados, sin red.
 */
import { describe, expect, it } from 'vitest';
import { eventsInWindow, windowDays } from './windows.js';
import { handleUpdate } from './router.js';

const ORIGIN = 'https://ejemplo.test';
/** Un instante en hora de Argentina. @param {string} local `AAAA-MM-DDTHH:MM` */
const ar = (local) => Date.parse(`${local}:00-03:00`);
/** @param {string} slug @param {string} local */
const ev = (slug, local) => ({
	slug,
	title: `Evento inventado ${slug}`,
	start: new Date(ar(local)).toISOString()
});

// 2031-01-08 es miércoles.
const WED = ar('2031-01-08T12:00');
const EVENTS = [
	ev('hoy-noche', '2031-01-08T23:30'),
	ev('jueves', '2031-01-09T19:00'),
	ev('viernes', '2031-01-10T21:00'),
	ev('domingo', '2031-01-12T18:00'),
	ev('martes', '2031-01-14T20:00'),
	ev('miercoles-siguiente', '2031-01-15T20:00'),
	ev('otro-finde', '2031-01-17T21:00')
];
const slugs = (/** @type {{ slug: string }[]} */ list) => list.map((e) => e.slug);

describe('eventsInWindow', () => {
	it('hoy: hasta las 23:59 de Argentina, aunque en UTC ya sea mañana', () => {
		expect(slugs(eventsInWindow(EVENTS, 'hoy', WED))).toEqual(['hoy-noche']);
	});

	it('semana: hoy y los 6 días que siguen', () => {
		expect(slugs(eventsInWindow(EVENTS, 'semana', WED))).toEqual([
			'hoy-noche',
			'jueves',
			'viernes',
			'domingo',
			'martes'
		]);
	});

	it('finde: de lunes a jueves, el viernes a domingo que viene', () => {
		expect(slugs(eventsInWindow(EVENTS, 'finde', WED))).toEqual(['viernes', 'domingo']);
	});

	it('finde: el sábado y el domingo, el de este fin de semana', () => {
		for (const now of [ar('2031-01-11T10:00'), ar('2031-01-12T10:00'), ar('2031-01-10T08:00')]) {
			expect(slugs(eventsInWindow(EVENTS, 'finde', now))).toEqual(['viernes', 'domingo']);
		}
	});

	it('el domingo a las 23:30 de Argentina sigue siendo domingo', () => {
		const [from, to] = windowDays('finde', ar('2031-01-12T23:30'));
		expect(to - from).toBe(2);
		expect(slugs(eventsInWindow(EVENTS, 'finde', ar('2031-01-12T23:30')))).toContain('domingo');
	});

	it('una fecha que no se puede leer no entra', () => {
		expect(eventsInWindow([{ slug: 'x', title: 'x', start: 'cualquiera' }], 'semana', WED)).toEqual(
			[]
		);
	});
});

describe('router: /hoy, /semana, /finde', () => {
	const deps = { listUpcoming: async () => EVENTS, origin: ORIGIN, now: () => WED };
	/** @param {string} text */
	const ask = async (text) =>
		/** @type {any} */ (await handleUpdate({ message: { chat: { id: 5 }, text } }, deps));

	it('/semana: la lista con título y un botón por evento', async () => {
		const res = await ask('/semana');
		expect(res.method).toBe('sendMessage');
		expect(res.text.startsWith('<b>En los próximos 7 días</b>')).toBe(true);
		expect(res.text).toContain('Evento inventado martes');
		expect(res.text).not.toContain('Evento inventado miercoles-siguiente');
		expect(res.reply_markup.inline_keyboard).toHaveLength(5);
	});

	it('/finde y /hoy (también con @bot)', async () => {
		expect((await ask('/finde')).text.startsWith('<b>Este finde</b>')).toBe(true);
		const hoy = await ask('/hoy@BotDePrueba');
		expect(hoy.text).toContain('Evento inventado hoy-noche');
		expect(hoy.reply_markup.inline_keyboard).toHaveLength(1);
	});

	it('sin eventos: lo dice, manda a /proximos y no pone botones', async () => {
		const res = /** @type {any} */ (
			await handleUpdate(
				{ message: { chat: { id: 5 }, text: '/hoy' } },
				{ ...deps, listUpcoming: async () => [] }
			)
		);
		expect(res.text).toBe('Hoy no hay eventos públicos. Mirá lo que viene con /proximos.');
		expect(res.reply_markup).toBeUndefined();
	});
});
