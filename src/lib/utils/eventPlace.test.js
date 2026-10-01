import { describe, expect, it } from 'vitest';
import { MAP_LINK_ERROR, checkMapLink, eventPlace, placeFileErrors } from './eventPlace.js';

describe('link al mapa del «Dónde»', () => {
	it('vacío vale (es opcional)', () => {
		expect(checkMapLink('')).toEqual({ ok: true, url: '' });
		expect(checkMapLink('   ')).toEqual({ ok: true, url: '' });
		expect(checkMapLink(undefined)).toEqual({ ok: true, url: '' });
	});

	it('acepta https de OpenStreetMap y Google Maps', () => {
		for (const url of [
			'https://www.openstreetmap.org/?mlat=-34.6&mlon=-58.4#map=17/-34.6/-58.4',
			'https://openstreetmap.org/node/123',
			'https://osm.org/go/abc',
			'https://www.google.com/maps/place/Plaza+de+Prueba',
			'https://google.com/maps?q=-34.6,-58.4',
			'https://www.google.com.ar/maps/@-34.6,-58.4,17z',
			'https://maps.google.com/?q=plaza',
			'https://maps.app.goo.gl/AbCdEf123',
			'https://goo.gl/maps/AbCdEf123'
		]) {
			expect(checkMapLink(`  ${url} `), url).toMatchObject({ ok: true });
		}
		expect(checkMapLink('https://osm.org/go/abc')).toEqual({
			ok: true,
			url: 'https://osm.org/go/abc'
		});
	});

	it('rechaza lo que no es https de un sitio de mapas', () => {
		for (const url of [
			'http://www.openstreetmap.org/node/1',
			'javascript:alert(1)',
			'https://www.google.com/search?q=plaza',
			'https://openstreetmap.org.ejemplo.com/node/1',
			'https://ejemplo.com/maps',
			'https://usuario:clave@www.openstreetmap.org/',
			'https://www.openstreetmap.org:8443/',
			'www.openstreetmap.org/node/1',
			'https://www.openstreetmap.org/ con espacio',
			`https://www.openstreetmap.org/${'x'.repeat(500)}`
		]) {
			expect(checkMapLink(url), url).toEqual({ ok: false, message: MAP_LINK_ERROR });
		}
	});
});

describe('lo que muestran la página y el .ics', () => {
	const meta = {
		location: '  Plaza de Prueba, frente a la fuente ',
		location_map: 'https://www.openstreetmap.org/node/1'
	};

	it('sin lugar: el «Dónde» del .md y su link al mapa', () => {
		expect(eventPlace(meta)).toEqual({
			text: 'Plaza de Prueba, frente a la fuente',
			mapUrl: 'https://www.openstreetmap.org/node/1',
			fromVenue: false
		});
		expect(eventPlace({})).toEqual({ text: 'Online', mapUrl: '', fromVenue: false });
		// Un link que no sirve no se muestra.
		expect(eventPlace({ ...meta, location_map: 'http://ejemplo.com' }).mapUrl).toBe('');
	});

	it('con lugar vinculado («Sucede en»), manda el lugar y no se usa el link del .md', () => {
		expect(
			eventPlace(meta, { level: 'public', name: 'Lugar de Prueba', address: 'Calle Falsa 123' })
		).toEqual({ text: 'Lugar de Prueba · Calle Falsa 123', mapUrl: '', fromVenue: true });
		expect(eventPlace(meta, { level: 'area', area: 'Barrio Inventado' }).text).toBe(
			'Barrio Inventado'
		);
	});
});

describe('guardado', () => {
	/** @param {string} fm */
	const file = (fm) => `---\ntitle: Evento de prueba\n${fm}\n---\nTexto.\n`;
	it('solo se queja de un link al mapa que no sirve', () => {
		expect(placeFileErrors(file('location: Plaza de Prueba'))).toEqual([]);
		expect(placeFileErrors(file('location_map: https://osm.org/go/abc'))).toEqual([]);
		expect(placeFileErrors(file('location_map: http://ejemplo.com'))).toEqual([MAP_LINK_ERROR]);
		// Un archivo que no se puede leer lo valida el resto del guardado.
		expect(placeFileErrors('sin propiedades')).toEqual([]);
		expect(placeFileErrors(file('location_map: [roto'))).toEqual([]);
	});
});
