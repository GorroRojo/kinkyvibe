/**
 * «Vincular lugares»: normalización y sugerencias (src/lib/utils/venueMatch.js). Lugares y
 * direcciones inventados.
 */
import { describe, expect, it } from 'vitest';
import {
	CONFIDENT_SCORE,
	MIN_SCORE,
	isConfident,
	linkPrivacy,
	matchVenue,
	nameKey,
	parseStreet,
	placeKeyOf,
	searchVenues,
	similarity,
	suggestVenues
} from './venueMatch.js';

/**
 * @param {number} id
 * @param {string} title
 * @param {Record<string, unknown>} [data]
 * @param {string} [slug]
 */
const venue = (id, title, data = {}, slug = `lugar-${id}`) => ({
	id,
	slug,
	title,
	data: { kind: 'lugar', ...data }
});

/** @param {string[]} names @param {string[]} [locations] @param {string} [mapUrl] */
const place = (names, locations = [], mapUrl = '') => ({
	names: names.map((text) => ({ text })),
	locations: locations.map((text) => ({ text })),
	mapUrl
});

describe('parseStreet', () => {
	it('saca «Av.», «Avenida», «Calle» y deja la calle y el número', () => {
		expect(parseStreet('Av. Falsa 830, Almagro, CABA')).toEqual({ street: 'falsa', number: '830' });
		expect(parseStreet('Avenida Falsa 830')).toEqual({ street: 'falsa', number: '830' });
		expect(parseStreet('Avda Falsa 830')).toEqual({ street: 'falsa', number: '830' });
		expect(parseStreet('Calle Inventada 12')).toEqual({ street: 'inventada', number: '12' });
	});

	it('sin tildes ni mayúsculas, y con los títulos enteros', () => {
		expect(parseStreet('GRAL. JOSÉ DE PRUEBA 1500')).toEqual({
			street: 'general jose de prueba',
			number: '1500'
		});
		expect(parseStreet('General José de Prueba 1500')).toEqual({
			street: 'general jose de prueba',
			number: '1500'
		});
		expect(parseStreet('Pte. Inventado 40')).toEqual(parseStreet('Presidente Inventado 40'));
	});

	it('números: el punto de los miles, «N°» y lo que viene después del número', () => {
		expect(parseStreet('Falsa 1.234')).toEqual({ street: 'falsa', number: '1234' });
		expect(parseStreet('Falsa N° 1234')).toEqual({ street: 'falsa', number: '1234' });
		expect(parseStreet('Falsa nº 1234')).toEqual({ street: 'falsa', number: '1234' });
		expect(parseStreet('Falsa 1234 piso 2 depto B')).toEqual({ street: 'falsa', number: '1234' });
	});

	it('el primer tramo con número (lo de antes es un nombre o un barrio)', () => {
		expect(parseStreet('Barrio Falso, Falsa 99, CABA')).toEqual({ street: 'falsa', number: '99' });
	});

	it('sin número no es una calle', () => {
		expect(parseStreet('Almagro, CABA')).toBeNull();
		expect(parseStreet('')).toBeNull();
		expect(parseStreet('123')).toBeNull();
	});
});

describe('nameKey y similarity', () => {
	it('sin tildes, mayúsculas ni puntuación; también la dirección en el sitio', () => {
		expect(nameKey('El Galpón!')).toBe('el galpon');
		expect(nameKey('la.colectiva-de_prueba')).toBe('la colectiva de prueba');
	});

	it('1 si son iguales, 0 sin nada en común, y en el medio si se parecen', () => {
		expect(similarity('galpon', 'galpon')).toBe(1);
		expect(similarity('abc', 'xyz')).toBe(0);
		expect(similarity('galpon inventado', 'galpon inventada')).toBeGreaterThan(0.8);
		expect(similarity('', 'x')).toBe(0);
	});
});

describe('matchVenue', () => {
	it('mismo nombre: 100, aunque cambien tildes y mayúsculas', () => {
		const r = matchVenue(place(['GALPON inventado']), venue(1, 'Galpón Inventado'));
		expect(r.score).toBe(100);
		expect(r.reasons[0]).toContain('mismo nombre');
	});

	it('la dirección vieja de la ficha también cuenta como nombre', () => {
		const v = { ...venue(1, 'Otro nombre'), legacySlug: 'galpon.inventado' };
		expect(matchVenue(place(['Galpón Inventado']), v).score).toBe(100);
	});

	it('misma calle y número con «Av.» y «Avenida», «CABA» y sin nombre', () => {
		const r = matchVenue(
			place([], ['Av. Falsa 830, CABA']),
			venue(1, 'Sótano de Prueba', { address: 'Avenida Falsa 830', area: 'Almagro' })
		);
		expect(r.score).toBe(95);
		expect(r.reasons[0]).toContain('misma calle y número');
	});

	it('mismo nombre y misma dirección suman (hasta 100)', () => {
		const r = matchVenue(
			place(['Galpón Inventado'], ['Falsa 123']),
			venue(1, 'Galpón Inventado', { address: 'Calle Falsa 123' })
		);
		expect(r.score).toBe(100);
		expect(r.reasons).toHaveLength(2);
	});

	it('mismo número y la calle escrita parecido', () => {
		const r = matchVenue(
			place([], ['Gral Inventadísimo 450']),
			venue(1, 'X', { address: 'General Inventadisimo 450' })
		);
		expect(r.score).toBe(95);
		const close = matchVenue(
			place([], ['Inventadisima 450']),
			venue(1, 'X', { address: 'Inventadisimo 450' })
		);
		expect(close.score).toBe(80);
		expect(close.reasons[0]).toContain('calle parecida');
	});

	it('otro número no es la misma dirección', () => {
		const r = matchVenue(place([], ['Falsa 124']), venue(1, 'X', { address: 'Falsa 123' }));
		expect(r.score).toBeLessThan(MIN_SCORE);
	});

	it('mismo nombre pero otra dirección: baja y lo dice', () => {
		const r = matchVenue(
			place(['Galpón Inventado'], ['Otra Calle 500']),
			venue(1, 'Galpón Inventado', { address: 'Calle Falsa 123' })
		);
		expect(r.score).toBe(70);
		expect(r.reasons[0]).toContain('otra dirección');
	});

	it('nombre parecido o contenido en el otro', () => {
		const similar = matchVenue(place(['Galpon Inventada']), venue(1, 'Galpón Inventado'));
		expect(similar.score).toBeGreaterThanOrEqual(MIN_SCORE);
		expect(similar.score).toBeLessThan(CONFIDENT_SCORE);
		expect(similar.reasons[0]).toContain('nombre parecido');
		const contained = matchVenue(place(['Galpón']), venue(1, 'El Galpón de Prueba'));
		expect(contained.score).toBe(75);
		expect(contained.reasons[0]).toContain('contiene');
	});

	it('palabras cortas no alcanzan para «contiene»', () => {
		expect(matchVenue(place(['Bar']), venue(1, 'El Bar de Prueba')).score).toBeLessThan(MIN_SCORE);
	});

	it('el mismo punto del mapa', () => {
		const r = matchVenue(
			place(['Algo'], [], 'https://www.openstreetmap.org/?mlat=-34.6&mlon=-58.4'),
			venue(1, 'Otra cosa', { lat: -34.6005, lng: -58.4 })
		);
		expect(r.score).toBe(90);
		expect(r.reasons[0]).toContain('mismo punto del mapa');
		const far = matchVenue(
			place(['Algo'], [], 'https://www.openstreetmap.org/?mlat=-34.6&mlon=-58.4'),
			venue(1, 'Otra cosa', { lat: -34.7, lng: -58.4 })
		);
		expect(far.score).toBe(0);
	});

	it('nada en común: 0 y sin motivos', () => {
		expect(matchVenue(place(['Galpón'], ['Falsa 1']), venue(1, 'Sótano'))).toEqual({
			score: 0,
			reasons: []
		});
	});
});

describe('suggestVenues e isConfident', () => {
	const venues = [
		venue(1, 'Galpón Inventado', { address: 'Calle Falsa 123' }),
		venue(2, 'Galpón Inventado Dos', { address: 'Otra 9' }),
		venue(3, 'Sótano de Prueba')
	];

	it('de más a menos probable, solo los que pasan el mínimo', () => {
		const s = suggestVenues(place(['Galpón Inventado'], ['Falsa 123, CABA']), venues);
		expect(s.map((x) => x.id)).toEqual([1, 2]);
		expect(s[0].score).toBe(100);
	});

	it('se propone marcada solo si es segura y le gana bien a la segunda', () => {
		expect(isConfident([{ id: 1, score: 100, reasons: [] }])).toBe(true);
		expect(
			isConfident([
				{ id: 1, score: 95, reasons: [] },
				{ id: 2, score: 90, reasons: [] }
			])
		).toBe(false);
		expect(isConfident([{ id: 1, score: 70, reasons: [] }])).toBe(false);
		expect(isConfident([])).toBe(false);
	});
});

describe('linkPrivacy', () => {
	it('el evento que mostraba menos lleva el suyo; si mostraba más, el del lugar', () => {
		expect(linkPrivacy('name', 'public')).toBe('name');
		expect(linkPrivacy('area', 'public')).toBe('area');
		expect(linkPrivacy('public', 'public')).toBeNull();
		// Nunca más abierto que el lugar.
		expect(linkPrivacy('public', 'name')).toBeNull();
		expect(linkPrivacy('public', 'hidden')).toBeNull();
	});
});

describe('placeKeyOf y searchVenues', () => {
	it('la clave no cambia por tildes, mayúsculas ni «CABA»', () => {
		expect(
			placeKeyOf({ name: 'Galpón', location: 'Falsa 1, Ciudad Autónoma de Buenos Aires' })
		).toBe(placeKeyOf({ name: 'galpon', location: 'Falsa 1, CABA' }));
		expect(placeKeyOf({ name: 'Galpón' })).not.toBe(
			placeKeyOf({ name: 'Galpón', location: 'X 1' })
		);
	});

	it('busca por nombre, calle o barrio, con todas las palabras', () => {
		const list = [
			{ id: 1, title: 'Galpón Inventado', address: 'Falsa 123', area: 'Almagro' },
			{ id: 2, title: 'Sótano', address: 'Otra 9', area: 'Boedo' }
		];
		expect(searchVenues(list, 'galpon').map((v) => v.id)).toEqual([1]);
		expect(searchVenues(list, 'boedo').map((v) => v.id)).toEqual([2]);
		expect(searchVenues(list, 'falsa almagro').map((v) => v.id)).toEqual([1]);
		expect(searchVenues(list, '  ')).toEqual([]);
	});
});
