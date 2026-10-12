/**
 * El `callback_data` de las pantallas y los deep links: ida y vuelta, límites de largo y datos
 * rotos. Eventos inventados.
 */
import { describe, expect, it } from 'vitest';
import {
	CALLBACK_MAX_BYTES,
	NAV_SLUG_MAX,
	START_PARAM_MAX,
	byteLength,
	decodeNav,
	encodeNav,
	findByDeepId,
	findByNavId,
	navId,
	parseStartParam,
	startLink,
	startParam
} from './nav.js';

const LONG = `evento-de-mentira-${'x'.repeat(80)}`;
const EVENTS = [
	{
		slug: 'fiesta-inventada-2031-02',
		title: 'Fiesta inventada',
		start: '2031-02-14T23:00:00-03:00'
	},
	{ slug: LONG, title: 'Uno largo', start: '2031-03-01T18:00:00-03:00' },
	{ slug: 'ñandú-con-tilde', title: 'Con tilde', start: '2031-04-01T18:00:00-03:00' }
];

/** @type {Parameters<typeof encodeNav>[0][]} */
const STATES = [
	{ screen: 'home' },
	{ screen: 'list', view: 'd', page: 0 },
	{ screen: 'list', view: 'w', page: 2 },
	{ screen: 'list', view: 'f', page: 999 },
	{ screen: 'list', view: 'p', page: 1 },
	{ screen: 'event', id: navId(EVENTS[0].slug), back: 'w' },
	{ screen: 'event', id: navId(LONG), back: 'n' },
	{ screen: 'search' },
	{ screen: 'search_cancel' },
	{ screen: 'sigo' },
	{ screen: 'fondo' },
	{ screen: 'help' },
	{ screen: 'follow', id: navId(LONG) },
	{ screen: 'follow_do', id: navId(EVENTS[0].slug), tag: 'abc1234' },
	{ screen: 'search_follow', tag: 'abc1234', query: 'shibari' },
	{ screen: 'search_follow', tag: 'abc1234', query: 'una búsqueda: con dos puntos' },
	{ screen: 'noop' }
];

describe('encodeNav / decodeNav', () => {
	it('ida y vuelta para cada pantalla', () => {
		for (const state of STATES) expect(decodeNav(encodeNav(state))).toEqual(state);
	});

	it('nada pasa de 64 bytes, ni con el id más largo posible', () => {
		const id = 'a'.repeat(NAV_SLUG_MAX);
		const worst = [
			encodeNav({ screen: 'event', id, back: 'n' }),
			encodeNav({ screen: 'follow_do', id, tag: 'zzzzzzz' }),
			encodeNav({ screen: 'list', view: 'p', page: 999 })
		];
		for (const d of worst) expect(byteLength(d)).toBeLessThanOrEqual(CALLBACK_MAX_BYTES);
		for (const s of STATES) expect(byteLength(encodeNav(s))).toBeLessThanOrEqual(64);
	});

	it('una dirección larga o con caracteres raros va como hash y se encuentra igual', () => {
		expect(navId(LONG)).toMatch(/^#[0-9a-z]{1,7}$/);
		expect(navId('ñandú-con-tilde')).toMatch(/^#/);
		expect(navId(EVENTS[0].slug)).toBe(EVENTS[0].slug);
		for (const e of EVENTS) expect(findByNavId(EVENTS, navId(e.slug))).toBe(e);
		expect(findByNavId(EVENTS, 'evento-que-ya-paso')).toBeUndefined();
	});

	it('datos rotos o inventados: null', () => {
		for (const bad of [
			null,
			undefined,
			42,
			'',
			'z',
			'l:q:0',
			'l:d:-1',
			'l:d:1000',
			'l:d',
			'e::w',
			'e:<script>:w',
			'e:ok:z',
			`e:${'a'.repeat(41)}:w`,
			'f:',
			'fy:ok:NO-HASH',
			'fy:ok',
			'x'.repeat(65),
			'ev:',
			'ev:<script>'
		]) {
			expect(decodeNav(bad), String(bad)).toBeNull();
		}
	});

	it('seguir la etiqueta buscada (`sf:`): la búsqueda más larga entra y una rota no', () => {
		const long = encodeNav({ screen: 'search_follow', tag: 'abc1234', query: 'ñ'.repeat(40) });
		expect(byteLength(long)).toBeLessThanOrEqual(CALLBACK_MAX_BYTES);
		expect(decodeNav(long)).toEqual({
			screen: 'search_follow',
			tag: 'abc1234',
			query: 'ñ'.repeat(20)
		});
		for (const bad of [
			'sf:',
			'sf:abc',
			'sf::shibari',
			'sf:ABC!:shibari',
			`sf:abc:${'x'.repeat(41)}`
		]) {
			expect(decodeNav(bad), bad).toBeNull();
		}
	});

	it('los botones de antes siguen andando', () => {
		expect(decodeNav('ls')).toEqual({ screen: 'list', view: 'p', page: 0 });
		expect(decodeNav('ev:fiesta-inventada-2031-02')).toEqual({
			screen: 'legacy_event',
			token: 'fiesta-inventada-2031-02'
		});
		expect(decodeNav('ev:#abc12')).toEqual({ screen: 'legacy_event', token: '#abc12' });
	});
});

describe('deep links', () => {
	it('ida y vuelta, siempre con caracteres válidos y hasta 64', () => {
		for (const view of /** @type {const} */ (['d', 'w', 'f', 'p'])) {
			expect(parseStartParam(startParam({ screen: 'list', view }))).toEqual({
				screen: 'list',
				view
			});
		}
		for (const e of EVENTS) {
			for (const screen of /** @type {const} */ (['event', 'follow'])) {
				const param = startParam({ screen, slug: e.slug });
				expect(param).toMatch(/^[A-Za-z0-9_-]+$/);
				expect(param.length).toBeLessThanOrEqual(START_PARAM_MAX);
				const parsed = parseStartParam(param);
				expect(parsed?.screen).toBe(screen);
				expect(findByDeepId(EVENTS, /** @type {any} */ (parsed).deep)).toBe(e);
			}
		}
		expect(parseStartParam('sigo')).toEqual({ screen: 'sigo' });
		expect(parseStartParam('fondo')).toEqual({ screen: 'fondo' });
		expect(parseStartParam('buscar')).toEqual({ screen: 'search' });
	});

	it('el código de vincular no se confunde con un deep link', () => {
		expect(parseStartParam('ABCD2345')).toBeNull();
		expect(parseStartParam('ev-')).toBeNull();
		expect(parseStartParam('x'.repeat(65))).toBeNull();
	});

	it('el link al bot solo con usuario', () => {
		expect(startLink(null, 'semana')).toBeNull();
		expect(new URL(/** @type {string} */ (startLink('BotDePrueba', 'seguir-x'))).href).toBe(
			'https://t.me/BotDePrueba?start=seguir-x'
		);
	});
});
