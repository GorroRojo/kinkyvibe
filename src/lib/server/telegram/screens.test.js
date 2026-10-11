/**
 * Las pantallas: texto, entidades (`date_time`) y botones. Datos inventados, sin red.
 */
import { describe, expect, it } from 'vitest';
import {
	CAPTION_MAX,
	PAGE_SIZE,
	calendarLink,
	eventScreen,
	fondoScreen,
	homeScreen,
	listScreen,
	pagerRow,
	paginate,
	searchResultsScreen,
	searchScreen,
	tgTime
} from './screens.js';

const ORIGIN = 'https://ejemplo.test';
const NOW = Date.parse('2031-01-08T12:00:00-03:00');
/** @type {import('./screens.js').ScreenCtx} */
const PRIVATE = { origin: ORIGIN, chat: 'private', now: NOW };
/** @type {import('./screens.js').ScreenCtx} */
const GROUP = { origin: ORIGIN, chat: 'group', now: NOW };

/** @param {number} n */
const events = (n) =>
	Array.from({ length: n }, (_, i) => ({
		slug: `evento-inventado-${i + 1}`,
		title: `Evento inventado ${i + 1}`,
		start: new Date(NOW + (i + 1) * 3600e3 * 24).toISOString()
	}));

/** @param {import('./screens.js').Screen} s */
const flat = (s) => s.keyboard.flat();

describe('tgTime', () => {
	it('la entidad date_time con el texto en castellano adentro', () => {
		expect(tgTime('2031-02-14T23:00:00-03:00', NOW)).toBe(
			`<tg-time unix="${Date.parse('2031-02-14T23:00:00-03:00') / 1000}" format="wdt">vie 14 feb · 23:00</tg-time>`
		);
		expect(tgTime('cualquiera', NOW)).toBe('');
	});
});

describe('homeScreen', () => {
	it('los botones del inicio, con color en las listas', () => {
		const s = homeScreen(PRIVATE);
		expect(s.text).toContain('Podés pedirme');
		expect(s.keyboard[0].map((b) => [b.text, b.callback_data, b.style])).toEqual([
			['Hoy', 'l:d:0', 'primary'],
			['Semana', 'l:w:0', 'primary'],
			['Finde', 'l:f:0', 'primary']
		]);
		expect(flat(s).map((b) => b.callback_data ?? b.url)).toEqual([
			'l:d:0',
			'l:w:0',
			'l:f:0',
			's',
			'fo',
			'a',
			undefined,
			ORIGIN
		]);
		expect(flat(s).at(-2)).toEqual({
			text: '📅 Calendario',
			web_app: { url: `${ORIGIN}/telegram/app` }
		});
		expect(flat(s).at(-1)?.text).toBe('Abrir ejemplo.test ↗');
	});

	it('en un grupo no hay botón de Mini App (web_app solo anda en privado)', () => {
		expect(flat(homeScreen(GROUP)).some((b) => b.web_app)).toBe(false);
	});

	it('sin https no hay botón con link', () => {
		const s = homeScreen({ ...PRIVATE, origin: 'http://localhost:5173' });
		expect(flat(s).some((b) => b.url)).toBe(false);
	});
});

describe('paginación', () => {
	it('paginate acota la página', () => {
		expect(paginate(0, 3)).toMatchObject({ pages: 1, page: 0 });
		expect(paginate(11, 1)).toMatchObject({ pages: 3, page: 1, from: 5, to: 10 });
		expect(paginate(11, 9)).toMatchObject({ page: 2, from: 10 });
		expect(paginate(11, -4)).toMatchObject({ page: 0 });
	});

	it('«‹ 2/3 ›» con el del medio deshabilitado y sin flechas de más', () => {
		const data = (/** @type {number} */ n) => `p${n}`;
		expect(pagerRow(0, 1, data)).toBeNull();
		expect(pagerRow(0, 3, data)).toEqual([
			{ text: '1/3', disabled: {} },
			{ text: '›', callback_data: 'p1' }
		]);
		expect(pagerRow(1, 3, data)).toEqual([
			{ text: '‹', callback_data: 'p0' },
			{ text: '2/3', disabled: {} },
			{ text: '›', callback_data: 'p2' }
		]);
		expect(pagerRow(2, 3, data)).toEqual([
			{ text: '‹', callback_data: 'p1' },
			{ text: '3/3', disabled: {} }
		]);
	});
});

describe('listScreen', () => {
	it('de a cinco, con «Ver», «‹ 2/3 ›» e «🏠 Inicio»', () => {
		const list = events(12);
		const s = listScreen('w', list, 1, PRIVATE);
		expect(s.text.startsWith('<b>En los próximos 7 días</b> · 2/3')).toBe(true);
		expect(s.text).toContain('Evento inventado 6');
		expect(s.text).not.toContain('Evento inventado 5<');
		expect(s.text).toContain('<tg-time unix=');
		expect(s.text).toContain(`href="${ORIGIN}/calendario/evento-inventado-6"`);
		expect(s.keyboard.slice(0, PAGE_SIZE).map((r) => r[0].callback_data)).toEqual([
			'e:evento-inventado-6:w',
			'e:evento-inventado-7:w',
			'e:evento-inventado-8:w',
			'e:evento-inventado-9:w',
			'e:evento-inventado-10:w'
		]);
		expect(s.keyboard.at(-2)).toEqual([
			{ text: '‹', callback_data: 'l:w:0' },
			{ text: '2/3', disabled: {} },
			{ text: '›', callback_data: 'l:w:2' }
		]);
		expect(s.keyboard.at(-1)).toEqual([{ text: '🏠 Inicio', callback_data: 'h' }]);
	});

	it('una página pedida de más muestra la última', () => {
		expect(listScreen('p', events(6), 7, PRIVATE).text).toContain('2/2');
	});

	it('vacía: el texto de siempre y solo «Inicio»', () => {
		const s = listScreen('f', [], 0, PRIVATE);
		expect(s.text).toBe('Este finde no hay eventos públicos. Mirá lo que viene con /proximos.');
		expect(s.keyboard).toEqual([[{ text: '🏠 Inicio', callback_data: 'h' }]]);
	});

	it('los títulos se escapan', () => {
		const s = listScreen('p', [{ ...events(1)[0], title: 'A <b>&</b> "B"' }], 0, PRIVATE);
		expect(s.text).toContain('A &lt;b&gt;&amp;&lt;/b&gt; &quot;B&quot;');
	});
});

describe('eventScreen', () => {
	const list = events(7);
	const ev = list[1];

	it('con foto, lugar, fecha, comprar (verde), calendario, cómo llegar y navegación', () => {
		const s = eventScreen(
			ev,
			{
				image: `${ORIGIN}/media/afiche.jpg`,
				place: 'Lugar de Prueba · Calle Falsa 123',
				mapUrl: 'https://www.google.com/maps/search/?api=1&query=-34.6,-58.4',
				ticket: { kind: 'buy', href: `/calendario/${ev.slug}/entradas`, text: 'Comprar entradas' }
			},
			{ back: 'w', list },
			PRIVATE
		);
		expect(s.photo).toBe(`${ORIGIN}/media/afiche.jpg`);
		expect(s.preview).toBe(`${ORIGIN}/calendario/${ev.slug}`);
		expect(s.text).toContain('<b>Evento inventado 2</b>');
		expect(s.text).toContain('📅 <tg-time');
		expect(s.text).toContain('📍 Lugar de Prueba · Calle Falsa 123');
		expect(s.text.length).toBeLessThanOrEqual(CAPTION_MAX);
		expect(s.keyboard[0]).toEqual([
			{
				text: '🎟 Comprar en el sitio',
				url: `${ORIGIN}/calendario/${ev.slug}/entradas`,
				style: 'success'
			}
		]);
		expect(s.keyboard[1].map((b) => b.text)).toEqual(['📅 Agregar al calendario', '🗺 Cómo llegar']);
		expect(s.keyboard.at(-2)).toEqual([
			{ text: '‹', callback_data: 'e:evento-inventado-1:w' },
			{ text: '2/7', disabled: {} },
			{ text: '›', callback_data: 'e:evento-inventado-3:w' }
		]);
		expect(s.keyboard.at(-1)).toEqual([
			{ text: '‹ Volver', callback_data: 'l:w:0' },
			{ text: '🏠 Inicio', callback_data: 'h' }
		]);
	});

	it('«Volver» va a la página de la lista que tiene el evento', () => {
		const s = eventScreen(list[6], {}, { back: 'p', list }, PRIVATE);
		expect(s.keyboard.at(-1)?.[0]).toEqual({ text: '‹ Volver', callback_data: 'l:p:1' });
	});

	it('sin lugar público ni mapa: ni 📍 ni «Cómo llegar»; agotadas como botón deshabilitado', () => {
		const s = eventScreen(
			ev,
			{ ticket: { kind: 'note', text: 'Agotadas' } },
			{ back: 'n' },
			PRIVATE
		);
		expect(s.text).not.toContain('📍');
		expect(s.text).toContain('🎟 Agotadas');
		expect(s.keyboard[0]).toEqual([{ text: '🎟 Agotadas', disabled: {} }]);
		expect(flat(s).map((b) => b.text)).not.toContain('🗺 Cómo llegar');
		expect(s.keyboard.at(-1)).toEqual([{ text: '🏠 Inicio', callback_data: 'h' }]);
		expect(s.photo).toBeUndefined();
	});

	it('un link al mapa que no es https no va', () => {
		const s = eventScreen(ev, { mapUrl: 'javascript:alert(1)' }, { back: 'n' }, PRIVATE);
		expect(flat(s).map((b) => b.text)).not.toContain('🗺 Cómo llegar');
	});

	it('sin https: sin botones con link, sin foto ni vista previa', () => {
		const s = eventScreen(
			ev,
			{ image: 'http://localhost/a.jpg', mapUrl: 'https://maps.example' },
			{ back: 'n' },
			{ ...PRIVATE, origin: 'http://localhost:5173' }
		);
		expect(flat(s).some((b) => b.url)).toBe(false);
		expect(s.photo).toBeUndefined();
		expect(s.preview).toBeUndefined();
	});

	it('el botón «Seguir» lo pasa quien llama', () => {
		const follow = { text: '⭐ Seguir', callback_data: 'f:evento-inventado-2' };
		const s = eventScreen(ev, {}, { back: 'n' }, PRIVATE, { follow });
		expect(flat(s)).toContainEqual(follow);
	});
});

describe('calendarLink', () => {
	it('Google Calendar con fechas en UTC y 2 horas si no hay fin', () => {
		const url = new URL(
			/** @type {string} */ (
				calendarLink(
					{ slug: 'a', title: 'Fiesta inventada', start: '2031-02-14T23:00:00-03:00' },
					ORIGIN,
					'Lugar de Prueba'
				)
			)
		);
		expect(url.host).toBe('calendar.google.com');
		expect(url.searchParams.get('dates')).toBe('20310215T020000Z/20310215T040000Z');
		expect(url.searchParams.get('text')).toBe('Fiesta inventada');
		expect(url.searchParams.get('details')).toBe(`${ORIGIN}/calendario/a`);
		expect(url.searchParams.get('location')).toBe('Lugar de Prueba');
	});
});

describe('Buscar', () => {
	it('en privado: force_reply y «Cancelar»', () => {
		const s = searchScreen(PRIVATE);
		expect(s.forceReply).toBe(true);
		expect(s.keyboard).toEqual([[{ text: 'Cancelar', callback_data: 'sx' }]]);
	});

	it('en un grupo: cómo buscar con /evento, sin abrir nada', () => {
		const s = searchScreen(GROUP);
		expect(s.forceReply).toBeUndefined();
		expect(s.text).toContain('/evento');
	});

	it('resultados: un botón por evento que vuelve al inicio', () => {
		const s = searchResultsScreen('cuer', events(2), PRIVATE);
		expect(s.text).toContain('«cuer»');
		expect(s.keyboard[0][0].callback_data).toBe('e:evento-inventado-1:n');
		const none = searchResultsScreen('<nada>', [], PRIVATE);
		expect(none.text).toContain('«&lt;nada&gt;»');
	});
});

describe('fondoScreen', () => {
	it('solo los números públicos', () => {
		const s = fondoScreen(
			{ percent: 30, collected: 120000, goal: 200000, step: 10, updatedAt: NOW },
			PRIVATE
		);
		expect(s.text).toContain('60 % de la meta');
		expect(s.text).toContain('<b>30 %</b>');
		expect(s.text).toMatch(/120\.000/);
		expect(s.text).toContain('<tg-time');
		expect(s.keyboard[0][0].url).toBe('https://fondo.kinkyvibe.ar');
	});

	it('sin datos lo dice; con datos viejos avisa', () => {
		expect(fondoScreen(null, PRIVATE).text).toContain('no pude leer');
		const stale = fondoScreen(
			{ percent: 0, collected: 0, goal: 0, step: 0, updatedAt: null, stale: true },
			PRIVATE
		);
		expect(stale.text).toContain('mes pasado');
		expect(stale.text).toContain('0 % de la meta');
	});
});
