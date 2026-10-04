import { describe, expect, it } from 'vitest';
import {
	DEFAULT_VENUE_PRIVACY,
	REJECT_REASON_MAX,
	VENUE_PRIVACY_LABELS,
	VENUE_PRIVACY_LEVELS,
	VENUE_PRIVACY_UNSET_LABEL,
	cleanRejectReason,
	coordinateText,
	effectivePrivacy,
	eventPrivacyText,
	fullAddress,
	googleMapsLink,
	inheritPrivacyLabel,
	osmLink,
	osmTiles,
	parseCoordinate,
	reviewState,
	showsAddress,
	showsVenueLink,
	venueHasDetails,
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
	// gorrite cambió el valor por defecto: sin nivel elegido se muestra la dirección completa
	// (antes, solo el nombre).
	it('el evento manda sobre el lugar; sin nada, la dirección completa', () => {
		expect(effectivePrivacy('hidden', 'public')).toBe('hidden');
		expect(effectivePrivacy(null, 'area')).toBe('area');
		expect(effectivePrivacy(undefined, undefined)).toBe(DEFAULT_VENUE_PRIVACY);
		expect(DEFAULT_VENUE_PRIVACY).toBe('public');
		expect(effectivePrivacy('cualquiera', 'otra')).toBe('public');
	});

	it('un lugar sin nivel (NULL o sin el campo) resuelve a público; los niveles elegidos no cambian', () => {
		for (const unset of [null, undefined, '']) {
			expect(effectivePrivacy(null, unset)).toBe('public');
			expect(effectivePrivacy(undefined, unset)).toBe('public');
		}
		for (const level of /** @type {const} */ (['public', 'name', 'area', 'hidden'])) {
			// el del lugar, si está elegido
			expect(effectivePrivacy(null, level)).toBe(level);
			// el del evento manda, también sobre un lugar sin nivel
			expect(effectivePrivacy(level, null)).toBe(level);
			for (const venueLevel of ['public', 'name', 'area', 'hidden']) {
				expect(effectivePrivacy(level, venueLevel)).toBe(level);
			}
		}
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

describe('textos de la privacidad (panel y Mi rincón)', () => {
	// gorrite pidió estos textos exactos (con "Sólo" con tilde y esas mayúsculas).
	it('cada nivel tiene su texto, en el orden de los desplegables', () => {
		expect(VENUE_PRIVACY_LABELS).toEqual({
			public: 'Nombre + dirección',
			name: 'Sólo Nombre',
			address: 'Sólo dirección',
			area: 'Sólo dirección parcial (Barrio)',
			hidden: 'Nada'
		});
		expect(Object.keys(VENUE_PRIVACY_LABELS)).toEqual([...VENUE_PRIVACY_LEVELS]);
		expect(VENUE_PRIVACY_UNSET_LABEL).toBe('Sin elegir (Nombre + dirección)');
	});

	it('"Igual que el Lugar" muestra el nivel del lugar; sin nivel, Nombre + dirección', () => {
		expect(inheritPrivacyLabel('name')).toBe('Igual que el Lugar (Sólo Nombre)');
		expect(inheritPrivacyLabel('address')).toBe('Igual que el Lugar (Sólo dirección)');
		expect(inheritPrivacyLabel('area')).toBe(
			'Igual que el Lugar (Sólo dirección parcial (Barrio))'
		);
		expect(inheritPrivacyLabel('hidden')).toBe('Igual que el Lugar (Nada)');
		expect(inheritPrivacyLabel('public')).toBe('Igual que el Lugar (Nombre + dirección)');
		for (const unset of [null, undefined, '', 'cualquiera']) {
			expect(inheritPrivacyLabel(unset)).toBe('Igual que el Lugar (Nombre + dirección)');
		}
	});

	it('en un evento: su nivel si tiene uno, si no "Igual que el Lugar"', () => {
		expect(eventPrivacyText('hidden', 'public')).toBe('Nada');
		expect(eventPrivacyText('address', 'hidden')).toBe('Sólo dirección');
		expect(eventPrivacyText(null, 'name')).toBe('Igual que el Lugar (Sólo Nombre)');
		expect(eventPrivacyText(null, null)).toBe('Igual que el Lugar (Nombre + dirección)');
	});
});

describe('nivel «Sólo dirección» (address)', () => {
	it('la dirección, el barrio, la ciudad y el mapa; ni el nombre, ni el link, ni los textos libres', () => {
		const v = venueView(venue, 'address', href);
		expect(v).toEqual({
			level: 'address',
			address: 'Calle Falsa 742',
			area: 'Barrio Inventado',
			city: 'Ciudad de Prueba',
			lat: -34.6,
			lng: -58.4
		});
		expect(JSON.stringify(v)).not.toMatch(/Galpón|amigues|Colectivo|Rampa/);
	});

	it('es un nivel válido, se elige en el evento o en el lugar, y no muestra el link', () => {
		expect(effectivePrivacy('address', 'public')).toBe('address');
		expect(effectivePrivacy(null, 'address')).toBe('address');
		expect(showsVenueLink('address')).toBe(false);
		expect(showsAddress('address')).toBe(true);
		expect(showsAddress('public')).toBe(true);
		for (const level of /** @type {const} */ (['name', 'area', 'hidden'])) {
			expect(showsAddress(level)).toBe(false);
		}
	});

	it('la línea y los datos estructurados: la dirección sin el nombre', () => {
		const v = venueView(venue, 'address', href);
		expect(venueLine(v)).toBe('Calle Falsa 742, Barrio Inventado, Ciudad de Prueba');
		expect(venueSchema(v)).toEqual({
			'@type': 'Place',
			name: 'Calle Falsa 742, Barrio Inventado, Ciudad de Prueba',
			address: {
				'@type': 'PostalAddress',
				name: 'Calle Falsa 742, Barrio Inventado, Ciudad de Prueba'
			}
		});
		expect(venueLine({ level: 'address' })).toBe('Lugar a confirmar');
		expect(venueSchema({ level: 'address' })).toBeUndefined();
	});
});

describe('"Ver en Google Maps"', () => {
	const G = 'https://www.google.com/maps/search/?api=1&query=';
	// Galpón sin el punto en el mapa, para probar la búsqueda por dirección.
	const noPoint = { title: venue.title, data: { ...venue.data, lat: undefined, lng: undefined } };

	it('con el punto en el mapa busca el punto (en los dos niveles con dirección)', () => {
		expect(googleMapsLink(venueView(venue, 'public', href))).toBe(`${G}-34.6%2C-58.4`);
		expect(googleMapsLink(venueView(venue, 'address', href))).toBe(`${G}-34.6%2C-58.4`);
	});

	it('sin el punto, la dirección; en "Sólo dirección", nunca el nombre', () => {
		expect(googleMapsLink(venueView(noPoint, 'public', href))).toBe(
			G +
				encodeURIComponent('Galpón Inventado, Calle Falsa 742, Barrio Inventado, Ciudad de Prueba')
		);
		const addressOnly = googleMapsLink(venueView(noPoint, 'address', href));
		expect(addressOnly).toBe(
			G + encodeURIComponent('Calle Falsa 742, Barrio Inventado, Ciudad de Prueba')
		);
		expect(decodeURIComponent(String(addressOnly))).not.toContain('Galpón');
		// Aunque la vista trajera el nombre por error, en "Sólo dirección" no se usa.
		expect(
			googleMapsLink({ level: 'address', name: 'Galpón Inventado', address: 'Calle Falsa 742' })
		).toBe(G + encodeURIComponent('Calle Falsa 742'));
	});

	it('en los niveles que no muestran la dirección, o sin dirección ni punto, no hay link', () => {
		for (const level of /** @type {const} */ (['name', 'area', 'hidden'])) {
			expect(googleMapsLink(venueView(venue, level, href))).toBeUndefined();
		}
		expect(googleMapsLink({ level: 'address', area: 'Barrio Inventado' })).toBeUndefined();
		expect(googleMapsLink({ level: 'public', name: 'Galpón Inventado' })).toBeUndefined();
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
		expect(
			tiles.some((t) => t.left <= 160 && t.left + 256 > 160 && t.top <= 100 && t.top + 256 > 100)
		).toBe(true);
	});
});

describe('ubicación en el mapa (panel y Mi rincón)', () => {
	it('parseCoordinate acepta coma o punto, vacío es undefined y lo raro queda como texto', () => {
		expect(parseCoordinate('-34,6037')).toBe(-34.6037);
		expect(parseCoordinate(' -58.3816 ')).toBe(-58.3816);
		expect(parseCoordinate('')).toBeUndefined();
		expect(parseCoordinate('   ')).toBeUndefined();
		expect(parseCoordinate('acá')).toBe('acá');
	});

	it('coordinateText muestra solo números guardados', () => {
		expect(coordinateText(-34.6037)).toBe('-34.6037');
		expect(coordinateText(undefined)).toBe('');
		expect(coordinateText('-34')).toBe('');
		expect(coordinateText(Number.NaN)).toBe('');
	});
});

describe('rechazo de lugares que cargan las cuentas', () => {
	it('cleanRejectReason junta espacios, recorta y corta al máximo', () => {
		expect(cleanRejectReason('  falta   la\n dirección ')).toBe('falta la dirección');
		expect(cleanRejectReason(undefined)).toBe('');
		expect(cleanRejectReason(42)).toBe('');
		expect(cleanRejectReason('x'.repeat(REJECT_REASON_MAX + 50))).toHaveLength(REJECT_REASON_MAX);
	});

	it('reviewState: aprobar gana; si no, rechazado o esperando', () => {
		expect(reviewState(true, false)).toBe('approved');
		expect(reviewState(true, true)).toBe('approved');
		expect(reviewState(false, true)).toBe('rejected');
		expect(reviewState(false, false)).toBe('pending');
	});
});

describe('venueHasDetails: «Ver mapa y cómo llegar» en la página del evento', () => {
	it('con mapa, «Cómo llegar» o «Accesibilidad» según el nivel', () => {
		expect(venueHasDetails(venueView(venue, 'public', href))).toBe(true);
		// «Sólo dirección»: el mapa sin el resto
		expect(venueHasDetails(venueView(venue, 'address', href))).toBe(true);
		for (const level of /** @type {const} */ (['name', 'area', 'hidden'])) {
			expect(venueHasDetails(venueView(venue, level, href))).toBe(false);
		}
	});

	it('pública sin coordenadas ni textos: no hay nada que plegar', () => {
		const bare = { title: 'Sala Inventada', data: { address: 'Calle Falsa 1' } };
		expect(venueHasDetails(venueView(bare, 'public', href))).toBe(false);
		const howTo = {
			title: 'Sala',
			data: { address: 'Calle Falsa 1', how_to_get_there: 'Timbre B' }
		};
		expect(venueHasDetails(venueView(howTo, 'public', href))).toBe(true);
	});
});
