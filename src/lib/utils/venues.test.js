import { describe, expect, it } from 'vitest';
import {
	DEFAULT_VENUE_PRIVACY,
	effectivePrivacy,
	fullAddress,
	osmLink,
	osmTiles,
	showsVenueLink,
	venueLine,
	venueSchema,
	venueView
} from './venues.js';

/** Un lugar inventado con todos los campos. */
const venue = {
	title: 'Galpón Inventado',
	data: {
		kind: 'lugar',
		address: 'Calle Falsa 742',
		area: 'Barrio Inventado',
		city: 'Ciudad de Prueba',
		lat: -34.6,
		lng: -58.4,
		accessibility: 'Rampa en la entrada',
		how_to_get_there: 'Colectivo 999'
	}
};
const href = '/amigues/galpon-inventado';

describe('privacidad del lugar', () => {
	it('el evento manda sobre el lugar; sin nada, solo el nombre', () => {
		expect(effectivePrivacy('hidden', 'public')).toBe('hidden');
		expect(effectivePrivacy(null, 'area')).toBe('area');
		expect(effectivePrivacy(undefined, undefined)).toBe(DEFAULT_VENUE_PRIVACY);
		expect(DEFAULT_VENUE_PRIVACY).toBe('name');
		expect(effectivePrivacy('cualquiera', 'otra')).toBe('name');
	});

	it('el link al lugar se ve solo en los niveles 1 y 2', () => {
		expect(showsVenueLink('public')).toBe(true);
		expect(showsVenueLink('name')).toBe(true);
		expect(showsVenueLink('area')).toBe(false);
		expect(showsVenueLink('hidden')).toBe(false);
	});

	it('1 · pública: todo', () => {
		expect(venueView(venue, 'public', href)).toEqual({
			level: 'public',
			name: 'Galpón Inventado',
			href,
			address: 'Calle Falsa 742',
			area: 'Barrio Inventado',
			city: 'Ciudad de Prueba',
			lat: -34.6,
			lng: -58.4,
			accessibility: 'Rampa en la entrada',
			howTo: 'Colectivo 999'
		});
	});

	it('2 · solo el nombre: ni dirección, ni barrio, ni mapa', () => {
		const v = venueView(venue, 'name', href);
		expect(v).toEqual({ level: 'name', name: 'Galpón Inventado', href });
		expect(JSON.stringify(v)).not.toMatch(/Falsa|Barrio|-34|Colectivo|Rampa/);
	});

	it('3 · solo el barrio: ni el nombre ni el link', () => {
		const v = venueView(venue, 'area', href);
		expect(v).toEqual({ level: 'area', area: 'Barrio Inventado', city: 'Ciudad de Prueba' });
		expect(JSON.stringify(v)).not.toMatch(/Galpón|Falsa|amigues/);
	});

	it('4 · oculta: nada', () => {
		expect(venueView(venue, 'hidden', href)).toEqual({ level: 'hidden' });
	});

	it('las líneas y los datos estructurados respetan el nivel', () => {
		expect(venueLine(venueView(venue, 'public', href))).toBe('Galpón Inventado · Calle Falsa 742');
		expect(venueLine(venueView(venue, 'name', href))).toBe('Galpón Inventado');
		expect(venueLine(venueView(venue, 'area', href))).toBe('Barrio Inventado, Ciudad de Prueba');
		expect(venueLine({ level: 'hidden' })).toBe('Lugar a confirmar');
		expect(venueSchema(venueView(venue, 'public', href))).toMatchObject({
			address: { name: 'Calle Falsa 742' }
		});
		expect(JSON.stringify(venueSchema(venueView(venue, 'name', href)))).not.toMatch(/Falsa/);
		expect(venueSchema({ level: 'hidden' })).toBeUndefined();
	});

	it('la dirección completa para quien compró', () => {
		expect(fullAddress(venue.data)).toBe('Calle Falsa 742, Barrio Inventado, Ciudad de Prueba');
		expect(fullAddress({ city: 'Solo ciudad' })).toBe('Solo ciudad');
	});
});

describe('mapa de OpenStreetMap', () => {
	it('arma el link con el marcador', () => {
		expect(osmLink(-34.6, -58.4)).toBe(
			'https://www.openstreetmap.org/?mlat=-34.600000&mlon=-58.400000#map=17/-34.600000/-58.400000'
		);
	});

	it('cubre el recuadro con baldosas y deja el punto en el centro', () => {
		const { tiles, zoom } = osmTiles(-34.6, -58.4, { width: 320, height: 200 });
		expect(zoom).toBe(16);
		expect(tiles.length).toBeGreaterThanOrEqual(2);
		for (const t of tiles) {
			expect(t.url).toMatch(/^https:\/\/tile\.openstreetmap\.org\/16\/\d+\/\d+\.png$/);
			expect(t.left).toBeLessThan(320);
			expect(t.left + 256).toBeGreaterThan(0);
			expect(t.top).toBeLessThan(200);
			expect(t.top + 256).toBeGreaterThan(0);
		}
		// El centro del recuadro cae dentro de alguna baldosa.
		expect(tiles.some((t) => t.left <= 160 && t.left + 256 > 160 && t.top <= 100 && t.top + 256 > 100)).toBe(
			true
		);
	});
});
