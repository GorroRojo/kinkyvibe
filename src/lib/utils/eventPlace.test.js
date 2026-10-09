import { describe, expect, it } from 'vitest';
import {
	MAP_LINK_ERROR,
	checkMapLink,
	eventPlace,
	eventPlaceSchema,
	isOnlinePlace,
	placeFileErrors,
	stripMdPlace,
	venuePlaceMeta,
	venueShortLabel
} from './eventPlace.js';
import { venueView } from './venues.js';

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
		// Sin nada cargado no se inventa que es online (antes decía «Online»).
		expect(eventPlace({})).toEqual({ text: '', mapUrl: '', fromVenue: false });
		// Un link que no sirve no se muestra.
		expect(eventPlace({ ...meta, location_map: 'http://ejemplo.com' }).mapUrl).toBe('');
	});

	it('con nombre y dirección, «Nombre · Dirección» (como un lugar); con uno solo, ese', () => {
		const both = { location_name: ' Galpón Inventado ', location: 'Calle Falsa 123' };
		expect(eventPlace(both).text).toBe('Galpón Inventado · Calle Falsa 123');
		// Solo el nombre (antes decía «Online»).
		expect(eventPlace({ location_name: 'Zona Inventada | Lugar de Prueba' }).text).toBe(
			'Zona Inventada | Lugar de Prueba'
		);
		expect(eventPlace({ location: 'Calle Falsa 123' }).text).toBe('Calle Falsa 123');
		// El mismo texto en los dos, una sola vez.
		expect(eventPlace({ location_name: 'Plaza Falsa', location: 'plaza falsa' }).text).toBe(
			'Plaza Falsa'
		);
	});

	it('«Online» solo si el evento es online', () => {
		const online = { text: 'Online', mapUrl: '', fromVenue: false };
		expect(eventPlace({ location: 'Online' })).toEqual(online);
		expect(eventPlace({ location: ' virtual ' })).toEqual(online);
		expect(eventPlace({ tags: ['charla', 'Online'] })).toEqual(online);
		expect(eventPlace({ modalidad: 'online', location_name: 'Sala Virtual' })).toEqual(online);
		// La etiqueta «Online» con dirección, o `modalidad: presencial`, no es online.
		expect(eventPlace({ tags: ['Online'], location: 'Calle Falsa 123' }).text).toBe(
			'Calle Falsa 123'
		);
		expect(isOnlinePlace({ modalidad: 'presencial', tags: ['Online'] })).toBe(false);
		// Un nombre de lugar con la etiqueta «Online» (quedada de otra edición) es presencial.
		expect(eventPlace({ location_name: 'Zona Inventada', tags: ['Online'] }).text).toBe(
			'Zona Inventada'
		);
		expect(isOnlinePlace({ location_name: 'Galpón Inventado' })).toBe(false);
		expect(isOnlinePlace({})).toBe(false);
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

describe('los datos estructurados (schema.org)', () => {
	const OFFLINE = 'https://schema.org/OfflineEventAttendanceMode';
	it('con «Dónde» (nombre, dirección o los dos), presencial con un Place', () => {
		expect(eventPlaceSchema({ location_name: 'Galpón Inventado' }, null)).toEqual({
			eventAttendanceMode: OFFLINE,
			location: { '@type': 'Place', name: 'Galpón Inventado' }
		});
		expect(
			eventPlaceSchema({ location_name: 'Galpón Inventado', location: 'Calle Falsa 123' }, null)
		).toEqual({
			eventAttendanceMode: OFFLINE,
			location: {
				'@type': 'Place',
				name: 'Galpón Inventado',
				address: { '@type': 'PostalAddress', name: 'Calle Falsa 123' }
			}
		});
	});

	it('online, VirtualLocation; sin nada, ni modo ni lugar', () => {
		expect(eventPlaceSchema({ location: 'Online' }, null, 'https://example.com/sala')).toEqual({
			eventAttendanceMode: 'https://schema.org/OnlineEventAttendanceMode',
			location: { '@type': 'VirtualLocation', url: 'https://example.com/sala' }
		});
		expect(eventPlaceSchema({ title: 'Evento de prueba' }, null)).toEqual({});
	});

	it('con lugar vinculado, presencial con lo que su nivel deja ver', () => {
		const out = eventPlaceSchema(
			{ location: 'Online' },
			{ level: 'public', name: 'Lugar de Prueba', address: 'Calle Falsa 123' }
		);
		expect(out.eventAttendanceMode).toBe(OFFLINE);
		expect(out.location.name).toBe('Lugar de Prueba');
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

describe('un lugar vinculado manda sobre el «Dónde» del .md (salidas públicas)', () => {
	// Datos inventados.
	const MD = {
		title: 'Fiesta de prueba',
		location: 'Calle Del Archivo 111',
		location_name: 'Nombre Del Archivo',
		location_map: 'https://www.openstreetmap.org/node/111'
	};
	const VENUE = {
		title: 'Galpón Inventado',
		data: {
			address: 'Calle Del Lugar 222',
			area: 'Barrio Inventado',
			city: 'Ciudad Inventada',
			lat: -34.5,
			lng: -58.5,
			how_to_get_there: 'Tocar timbre inventado'
		}
	};
	/** @param {import('./venues.js').VenuePrivacy} level */
	const view = (level) => venueView(VENUE, level, '/amigues/galpon-inventado');
	const MD_TEXT = /Calle Del Archivo|Nombre Del Archivo|node\/111/;

	it('stripMdPlace saca los tres campos y deja el resto', () => {
		expect(stripMdPlace(MD)).toEqual({ title: 'Fiesta de prueba' });
		expect(MD.location).toBe('Calle Del Archivo 111'); // no toca el original
	});

	it('sin lugar, la meta como está', () => {
		expect(venuePlaceMeta(MD, null)).toBe(MD);
		expect(venuePlaceMeta(MD, undefined)).toBe(MD);
	});

	it('en cada nivel, nada del .md y solo lo que el nivel deja ver', () => {
		/** @type {Record<string, { location_name: string, location: string }>} */
		const expected = {
			public: { location_name: 'Galpón Inventado', location: 'Calle Del Lugar 222' },
			name: { location_name: 'Galpón Inventado', location: 'Galpón Inventado' },
			address: {
				location_name: 'Calle Del Lugar 222, Barrio Inventado, Ciudad Inventada',
				location: 'Calle Del Lugar 222, Barrio Inventado, Ciudad Inventada'
			},
			area: {
				location_name: 'Barrio Inventado, Ciudad Inventada',
				location: 'Barrio Inventado, Ciudad Inventada'
			},
			hidden: { location_name: 'Lugar a confirmar', location: 'Lugar a confirmar' }
		};
		for (const level of /** @type {const} */ (['public', 'name', 'address', 'area', 'hidden'])) {
			const meta = venuePlaceMeta(MD, view(level));
			expect(meta, level).toEqual({ title: 'Fiesta de prueba', ...expected[level] });
			const text = JSON.stringify(meta);
			expect(text, level).not.toMatch(MD_TEXT);
			expect(text, level).not.toContain('Tocar timbre');
			if (level !== 'public' && level !== 'name') expect(text, level).not.toContain('Galpón');
			if (level === 'name' || level === 'area' || level === 'hidden')
				expect(text, level).not.toContain('Calle Del Lugar');
			if (level === 'hidden') expect(text, level).not.toContain('Barrio');
		}
	});

	it('venueShortLabel: el nombre si se ve; si no, lo que se ve de la dirección', () => {
		expect(venueShortLabel(view('public'))).toBe('Galpón Inventado');
		expect(venueShortLabel(view('name'))).toBe('Galpón Inventado');
		expect(venueShortLabel(view('area'))).toBe('Barrio Inventado, Ciudad Inventada');
		expect(venueShortLabel({ level: 'area' })).toBe('Lugar a confirmar');
		expect(venueShortLabel({ level: 'hidden' })).toBe('Lugar a confirmar');
	});
});
