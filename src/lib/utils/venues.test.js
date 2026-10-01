import { describe, expect, it } from 'vitest';
import {
	DEFAULT_VENUE_PRIVACY,
	REJECT_REASON_MAX,
	VENUE_PRIVACY_LABELS,
	VENUE_PRIVACY_LEVELS,
	VENUE_PRIVACY_SHORT,
	VENUE_PRIVACY_UNSET_LABEL,
	cleanRejectReason,
	coordinateText,
	effectivePrivacy,
	eventPrivacyText,
	fullAddress,
	inheritPrivacyLabel,
	osmLink,
	osmTiles,
	parseCoordinate,
	reviewState,
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
	// gorrite: los textos dicen qué se muestra, no "qué dirección".
	it('cada nivel dice explícito qué se muestra, largo y corto', () => {
		expect(VENUE_PRIVACY_LABELS).toEqual({
			public: 'Mostrar la dirección completa',
			name: 'Mostrar solo el nombre',
			area: 'Mostrar solo el barrio',
			hidden: 'No mostrar el lugar'
		});
		for (const level of VENUE_PRIVACY_LEVELS) {
			expect(VENUE_PRIVACY_LABELS[level]).toBeTruthy();
			expect(VENUE_PRIVACY_SHORT[level]).toBeTruthy();
		}
		expect(Object.keys(VENUE_PRIVACY_LABELS)).toEqual([...VENUE_PRIVACY_LEVELS]);
		expect(VENUE_PRIVACY_UNSET_LABEL).toBe('Sin elegir (dirección completa)');
	});

	it('"igual que el lugar" muestra el nivel del lugar; sin nivel, la dirección completa', () => {
		expect(inheritPrivacyLabel('name')).toBe('Igual que el lugar (ahora: solo el nombre)');
		expect(inheritPrivacyLabel('area')).toBe('Igual que el lugar (ahora: solo el barrio)');
		expect(inheritPrivacyLabel('hidden')).toBe('Igual que el lugar (ahora: lugar oculto)');
		expect(inheritPrivacyLabel('public')).toBe('Igual que el lugar (ahora: dirección completa)');
		for (const unset of [null, undefined, '', 'cualquiera']) {
			expect(inheritPrivacyLabel(unset)).toBe('Igual que el lugar (ahora: dirección completa)');
		}
	});

	it('en un evento: su nivel si tiene uno, si no "igual que el lugar"', () => {
		expect(eventPrivacyText('hidden', 'public')).toBe('No mostrar el lugar');
		expect(eventPrivacyText('public', 'hidden')).toBe('Mostrar la dirección completa');
		expect(eventPrivacyText(null, 'name')).toBe('Igual que el lugar (ahora: solo el nombre)');
		expect(eventPrivacyText(null, null)).toBe('Igual que el lugar (ahora: dirección completa)');
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
