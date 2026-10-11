/**
 * «Buscar en el mapa»: armado de la búsqueda, lectura de las respuestas de Nominatim, memoria y
 * el límite de un pedido por segundo. Nunca se llama a Nominatim de verdad: `fetch` es de mentira
 * y las direcciones son inventadas.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import {
	USER_AGENT,
	buildGeocodeQuery,
	clearGeocodeCache,
	geocodeVenue,
	nominatimUrl,
	parseNominatimResults
} from './nominatim.js';

/** Una respuesta como las de Nominatim (jsonv2), con datos inventados. */
const FAKE = [
	{
		lat: '-34.6040001',
		lon: '-58.3870009',
		display_name: 'Calle Inventada 123, Barrio Ficticio, Ciudad de Prueba, Argentina'
	},
	{ lat: '-34.61', lon: '-58.39', display_name: 'Otra Calle Falsa 123, Argentina' }
];

/** @param {unknown} body @param {number} [status] */
function fakeFetch(body, status = 200) {
	return vi.fn(async () => new Response(JSON.stringify(body), { status }));
}

describe('buildGeocodeQuery', () => {
	it('junta dirección, barrio y ciudad, con Argentina al final', () => {
		expect(
			buildGeocodeQuery({
				address: ' Calle Inventada  123 ',
				area: 'Barrio Ficticio',
				city: 'CABA'
			})
		).toBe('Calle Inventada 123, Barrio Ficticio, CABA, Argentina');
	});

	it('saltea lo vacío y lo repetido, y no repite Argentina', () => {
		expect(buildGeocodeQuery({ address: 'Calle Falsa 123', area: '', city: 'Rosario' })).toBe(
			'Calle Falsa 123, Rosario, Argentina'
		);
		expect(
			buildGeocodeQuery({ address: 'Calle Falsa 123', area: 'Rosario', city: 'rosario' })
		).toBe('Calle Falsa 123, Rosario, Argentina');
		expect(buildGeocodeQuery({ address: 'Calle Falsa 123, Argentina' })).toBe(
			'Calle Falsa 123, Argentina'
		);
	});

	it('sin dirección no hay búsqueda', () => {
		expect(buildGeocodeQuery({ address: '  ', area: 'Barrio Ficticio', city: 'CABA' })).toBe('');
		expect(buildGeocodeQuery({ address: 42, city: 'CABA' })).toBe('');
	});
});

describe('nominatimUrl', () => {
	it('pide jsonv2, pocas respuestas, solo Argentina y en castellano', () => {
		const url = new URL(nominatimUrl('Calle Falsa 123, Argentina'));
		expect(url.origin + url.pathname).toBe('https://nominatim.openstreetmap.org/search');
		expect(url.searchParams.get('q')).toBe('Calle Falsa 123, Argentina');
		expect(url.searchParams.get('format')).toBe('jsonv2');
		expect(url.searchParams.get('limit')).toBe('5');
		expect(url.searchParams.get('countrycodes')).toBe('ar');
		expect(url.searchParams.get('accept-language')).toBe('es');
	});
});

describe('parseNominatimResults', () => {
	it('lee lat, lon y display_name, redondeando a 6 decimales', () => {
		expect(parseNominatimResults(FAKE)).toEqual([
			{
				lat: -34.604,
				lng: -58.387001,
				label: 'Calle Inventada 123, Barrio Ficticio, Ciudad de Prueba, Argentina'
			},
			{ lat: -34.61, lng: -58.39, label: 'Otra Calle Falsa 123, Argentina' }
		]);
	});

	it('descarta lo roto o fuera de rango y corta en 5', () => {
		expect(parseNominatimResults(null)).toEqual([]);
		expect(parseNominatimResults({ error: 'x' })).toEqual([]);
		expect(
			parseNominatimResults([
				null,
				{ lat: 'abc', lon: '1' },
				{ lat: '', lon: '' },
				{ lat: '95', lon: '1' },
				{ lat: '-34', lon: '-58' }
			])
		).toEqual([{ lat: -34, lng: -58, label: '' }]);
		const many = Array.from({ length: 8 }, (_, i) => ({ lat: String(-34 - i / 100), lon: '-58' }));
		expect(parseNominatimResults(many)).toHaveLength(5);
	});
});

describe('geocodeVenue', () => {
	/** @type {Awaited<ReturnType<typeof createTestDB>>} */
	let t;
	beforeAll(async () => {
		t = await createTestDB();
	});
	afterAll(async () => {
		await t?.dispose();
	});
	beforeEach(async () => {
		await resetDB(t.db);
		clearGeocodeCache();
	});

	const input = { address: 'Calle Inventada 123', area: 'Barrio Ficticio', city: 'CABA' };
	const NOW = 1_800_000_000_000;

	it('llama a Nominatim con un User-Agent con la URL del sitio y devuelve los resultados', async () => {
		const fetch = fakeFetch(FAKE);
		const out = await geocodeVenue(input, { db: t.db, fetch, now: NOW });
		expect(out).toEqual({ ok: true, cached: false, results: parseNominatimResults(FAKE) });
		expect(fetch).toHaveBeenCalledTimes(1);
		const [url, init] = /** @type {any} */ (fetch.mock.calls[0]);
		expect(new URL(url).searchParams.get('q')).toBe(
			'Calle Inventada 123, Barrio Ficticio, CABA, Argentina'
		);
		expect(init.headers['User-Agent']).toBe(USER_AGENT);
		expect(USER_AGENT).toContain('https://kinkyvibe.ar');
		expect(USER_AGENT).not.toContain('@');
	});

	it('sin dirección no llama a nadie', async () => {
		const fetch = fakeFetch(FAKE);
		expect(await geocodeVenue({ address: '' }, { db: t.db, fetch, now: NOW })).toEqual({
			ok: false,
			reason: 'empty-query'
		});
		expect(fetch).not.toHaveBeenCalled();
	});

	it('como mucho un pedido por segundo para todo el sitio', async () => {
		const fetch = fakeFetch(FAKE);
		const first = await geocodeVenue(input, { db: t.db, fetch, now: NOW });
		expect(first.ok).toBe(true);
		// Otra dirección en el mismo segundo: no sale.
		const second = await geocodeVenue(
			{ address: 'Calle Falsa 123', city: 'Rosario' },
			{ db: t.db, fetch, now: NOW + 300 }
		);
		expect(second).toMatchObject({ ok: false, reason: 'rate-limited' });
		expect(fetch).toHaveBeenCalledTimes(1);
		// Al segundo siguiente, sí.
		const third = await geocodeVenue(
			{ address: 'Calle Falsa 123', city: 'Rosario' },
			{ db: t.db, fetch, now: NOW + 1000 }
		);
		expect(third.ok).toBe(true);
		expect(fetch).toHaveBeenCalledTimes(2);
	});

	it('repetir la misma búsqueda sale de la memoria, sin pedido ni límite', async () => {
		const fetch = fakeFetch(FAKE);
		await geocodeVenue(input, { db: t.db, fetch, now: NOW });
		const again = await geocodeVenue(
			{ ...input, address: ' calle inventada 123 ' },
			{ db: t.db, fetch, now: NOW + 100 }
		);
		expect(again).toMatchObject({ ok: true, cached: true });
		expect(fetch).toHaveBeenCalledTimes(1);
	});

	it('sin resultados devuelve una lista vacía', async () => {
		const out = await geocodeVenue(input, { db: t.db, fetch: fakeFetch([]), now: NOW });
		expect(out).toEqual({ ok: true, cached: false, results: [] });
	});

	it('si Nominatim falla o no hay base, avisa que no está disponible', async () => {
		expect(await geocodeVenue(input, { db: t.db, fetch: fakeFetch({}, 503), now: NOW })).toEqual({
			ok: false,
			reason: 'unavailable'
		});
		const boom = vi.fn(async () => {
			throw new Error('sin red');
		});
		expect(await geocodeVenue(input, { db: t.db, fetch: boom, now: NOW + 2000 })).toEqual({
			ok: false,
			reason: 'unavailable'
		});
		const fetch = fakeFetch(FAKE);
		expect(await geocodeVenue(input, { db: null, fetch, now: NOW })).toEqual({
			ok: false,
			reason: 'unavailable'
		});
		expect(fetch).not.toHaveBeenCalled();
	});
});
