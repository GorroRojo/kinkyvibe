/**
 * Lugares desde los eventos (reglas puras): cómo se comparan nombres y direcciones, qué se
 * saltea, cómo se juntan los eventos, qué nivel de privacidad muestra lo mismo que el evento y
 * qué cambiaría al vincular. Lugares y eventos inventados.
 */
import { describe, expect, it } from 'vitest';
import {
	addressKey,
	coordsFromMapLink,
	eventFit,
	eventShowLevel,
	importLinks,
	isOnlinePlace,
	looksLikeStreetAddress,
	mapKey,
	newVenueFor,
	normalizePlaceText,
	planVenueImport,
	privacyOverride,
	readEventPlace,
	refitEvents,
	streetKey,
	venueDataFor,
	venueDefaultLevel,
	venueListing,
	DEFAULT_VENUE_LISTING
} from './venueImport.js';

/**
 * @param {string} slug
 * @param {Record<string, any>} meta
 * @param {string} [start]
 */
const ev = (slug, meta, start = '2025-01-01T20:00-03:00') => ({
	slug,
	title: `Evento ${slug}`,
	start,
	meta: { category: 'calendario', ...meta }
});

describe('comparar textos', () => {
	it('sin mayúsculas, tildes, espacios de más ni puntuación', () => {
		expect(normalizePlaceText('  Galpón   INVENTADO. ')).toBe('galpon inventado');
		expect(normalizePlaceText('La Casa del Árbol Falso')).toBe(
			normalizePlaceText('la casa  del arbol falso')
		);
		expect(normalizePlaceText(undefined)).toBe('');
	});

	it('la ciudad se escribe siempre igual en las direcciones', () => {
		expect(addressKey('Calle Falsa 123, Ciudad Autónoma de Buenos Aires')).toBe(
			addressKey('calle falsa 123,  CABA')
		);
		expect(addressKey('Calle Falsa 123, Capital Federal')).toBe('calle falsa 123 caba');
		expect(addressKey('Calle Falsa 123, Rosario')).not.toBe(addressKey('Calle Falsa 123, CABA'));
	});

	it('calle y número: el primer tramo con números, sin «Av.»', () => {
		expect(streetKey('Av. Inventada 830, Barrio Falso, CABA')).toBe('inventada 830');
		expect(streetKey('Inventada 830, Ciudad Autónoma de Buenos Aires')).toBe('inventada 830');
		expect(streetKey('Barrio Falso, CABA')).toBe('');
		expect(looksLikeStreetAddress('Barrio Falso, CABA')).toBe(false);
		expect(looksLikeStreetAddress('Calle Falsa 123')).toBe(true);
	});

	it('link al mapa: sin www ni barra final; el punto si lo trae', () => {
		expect(mapKey('https://www.openstreetmap.org/node/1/')).toBe(
			mapKey('https://openstreetmap.org/node/1')
		);
		expect(
			coordsFromMapLink('https://www.openstreetmap.org/?mlat=-34.6&mlon=-58.4#map=17/-34.6/-58.4')
		).toEqual({ lat: -34.6, lng: -58.4 });
		expect(coordsFromMapLink('https://www.openstreetmap.org/#map=17/-34.61/-58.42')).toEqual({
			lat: -34.61,
			lng: -58.42
		});
		expect(coordsFromMapLink('https://www.google.com/maps/place/x/@-34.5,-58.3,17z')).toEqual({
			lat: -34.5,
			lng: -58.3
		});
		expect(
			coordsFromMapLink('https://www.google.com/maps/search/?api=1&query=-34.1,-58.2')
		).toEqual({ lat: -34.1, lng: -58.2 });
		expect(coordsFromMapLink('https://maps.app.goo.gl/abc')).toBeNull();
		expect(coordsFromMapLink('https://www.openstreetmap.org/?mlat=200&mlon=1')).toBeNull();
		expect(coordsFromMapLink('')).toBeNull();
	});
});

describe('qué se saltea', () => {
	it('online: modalidad, «Online»/«Zoom» como Dónde, o la etiqueta sin dirección', () => {
		expect(isOnlinePlace({ modalidad: 'online', location: 'Calle Falsa 123' })).toBe(true);
		expect(isOnlinePlace({ location: 'Zoom' })).toBe(true);
		expect(isOnlinePlace({ location_name: 'Online' })).toBe(true);
		expect(isOnlinePlace({ tags: ['Online'] })).toBe(true);
		expect(isOnlinePlace({ tags: ['Online'], location: 'Calle Falsa 123' })).toBe(false);
		expect(isOnlinePlace({ modalidad: 'presencial', tags: ['Online'] })).toBe(false);
	});

	it('sin «Dónde» o con un link al mapa que no sirve: nada', () => {
		expect(readEventPlace({})).toBeNull();
		expect(readEventPlace({ location: '  ', location_map: 'https://ejemplo.com/mapa' })).toBeNull();
		expect(readEventPlace({ location_name: ' Galpón Inventado ' })).toEqual({
			name: 'Galpón Inventado',
			location: '',
			mapUrl: ''
		});
	});

	it('cuenta online, vacíos y los que ya tienen lugar', () => {
		const { candidates, skipped } = planVenueImport(
			[
				ev('a', { location: 'Online' }),
				ev('b', {}),
				ev('c', { location_name: 'Galpón Inventado' }),
				ev('d', { location_name: 'Galpón Inventado' })
			],
			{ linked: new Set(['d']) }
		);
		expect(skipped).toEqual({ online: 1, empty: 1, linked: 1 });
		expect(candidates.map((c) => c.events.map((e) => e.slug))).toEqual([['c']]);
	});
});

describe('privacidad: el nivel que muestra lo mismo que el evento', () => {
	it('la tabla', () => {
		const lv = (/** @type {Partial<import('./venueImport.js').EventPlaceFields>} */ p) =>
			eventShowLevel({ name: '', location: '', mapUrl: '', ...p });
		expect(lv({ name: 'Galpón', location: 'Calle Falsa 123' })).toBe('public');
		expect(lv({ name: 'Galpón', location: 'Barrio Falso' })).toBe('public');
		expect(lv({ name: 'Galpón', mapUrl: 'https://osm.org/x' })).toBe('public');
		expect(lv({ name: 'Galpón' })).toBe('name');
		expect(lv({ location: 'Calle Falsa 123, CABA' })).toBe('address');
		expect(lv({ mapUrl: 'https://osm.org/x' })).toBe('address');
		expect(lv({ location: 'Barrio Falso, CABA' })).toBe('area');
	});

	it('el lugar: el más abierto de sus eventos; cada evento que muestra menos, el suyo', () => {
		expect(venueDefaultLevel(['area', 'name', 'address'])).toBe('name');
		expect(venueDefaultLevel(['address', 'public'])).toBe('public');
		expect(venueDefaultLevel(['area'])).toBe('area');
		expect(venueDefaultLevel([])).toBe('hidden');
		expect(privacyOverride('name', 'public')).toBe('name');
		expect(privacyOverride('public', 'public')).toBeNull();
	});
});

describe('juntar eventos', () => {
	it('mismo nombre sin importar mayúsculas, tildes ni espacios', () => {
		const { candidates } = planVenueImport([
			ev('a', { location_name: 'Galpón Inventado', location: 'Calle Falsa 123, CABA' }),
			ev('b', { location_name: 'galpon  inventado' }),
			ev('c', { location_name: 'GALPÓN INVENTADO.' })
		]);
		expect(candidates).toHaveLength(1);
		expect(candidates[0].events).toHaveLength(3);
		// Se leen igual: no es una «junta» que haya que mostrar, y todos muestran lo mismo.
		expect(candidates[0].merges).toEqual([]);
		expect(candidates[0].events.every((e) => e.fits)).toBe(true);
	});

	it('misma dirección (aunque cambie el nombre o la forma de escribir la ciudad) ⇒ mismo lugar', () => {
		const { candidates } = planVenueImport([
			ev('a', { location_name: 'Galpón Inventado', location: 'Calle Falsa 123, CABA' }, '2025-03'),
			ev('b', { location_name: 'Galpón Inventado', location: 'Calle Falsa 123, CABA' }, '2025-02'),
			ev('c', {
				location_name: 'El Galpón de Prueba',
				location: 'Calle Falsa 123, Ciudad Autónoma de Buenos Aires'
			}),
			ev('d', { location: 'Av. Calle Falsa 123, Barrio Falso, CABA' })
		]);
		expect(candidates).toHaveLength(1);
		const [c] = candidates;
		expect(c.title).toBe('Galpón Inventado');
		expect(c.address).toBe('Calle Falsa 123, CABA');
		expect(c.first).toBe('2025-01-01T20:00-03:00');
		expect(c.last).toBe('2025-03');
		expect(c.merges.join(' ')).toMatch(/El Galpón de Prueba.*la misma dirección/);
		const bySlug = Object.fromEntries(c.events.map((e) => [e.slug, e]));
		expect(bySlug.a.fits).toBe(true);
		// «CABA» por «Ciudad Autónoma…» es lo mismo, pero el nombre cambia: sin marcar.
		expect(bySlug.c.fits).toBe(false);
		expect(bySlug.c.diffs.join()).toMatch(/nombre «Galpón Inventado»/);
		// Agrega el barrio: también cambia lo que se ve.
		expect(bySlug.d.fits).toBe(false);
		expect(bySlug.d.level).toBe('address');
	});

	it('mismo link al mapa ⇒ mismo lugar, y el punto queda en el lugar', () => {
		const map = 'https://www.openstreetmap.org/?mlat=-34.6&mlon=-58.4';
		const { candidates } = planVenueImport([
			ev('a', { location_name: 'Galpón Inventado', location_map: map }),
			ev('b', { location_name: 'Otro Nombre Inventado', location_map: map.replace('www.', '') })
		]);
		expect(candidates).toHaveLength(1);
		expect(venueDataFor(candidates[0], 'public')).toEqual({
			kind: 'lugar',
			lat: -34.6,
			lng: -58.4,
			venue_privacy: 'public'
		});
	});

	it('un barrio no junta eventos con nombre; los eventos sin nombre del mismo barrio, sí', () => {
		const { candidates } = planVenueImport([
			ev('a', { location_name: 'Galpón Inventado', location: 'Barrio Falso, CABA' }),
			ev('b', { location_name: 'Sótano Inventado', location: 'Barrio Falso, CABA' }),
			ev('c', { location: 'Barrio Falso, CABA' }),
			ev('d', { location: 'barrio falso, Ciudad Autónoma de Buenos Aires' })
		]);
		expect(candidates.map((c) => [c.title, c.events.length, c.level]).sort()).toEqual([
			['Barrio Falso, CABA', 2, 'area'],
			['Galpón Inventado', 1, 'public'],
			['Sótano Inventado', 1, 'public']
		]);
		const area = candidates.find((c) => !c.hasName);
		expect(area?.area).toBe('Barrio Falso, CABA');
		expect(area?.address).toBe('');
		// Sin nombre no se propone marcado (habría que ponerle uno).
		expect(area?.suggested).toBe(false);
	});

	it('mismo nombre en dos direcciones distintas: no se juntan y se avisa', () => {
		const { candidates } = planVenueImport([
			ev('a', { location_name: 'Galpón Inventado', location: 'Calle Falsa 123, CABA' }),
			ev('b', { location_name: 'Galpón Inventado', location: 'Otra Calle 456, CABA' })
		]);
		expect(candidates).toHaveLength(2);
		for (const c of candidates) expect(c.merges.join()).toMatch(/otra dirección/);
	});

	it('un lugar que ya existe (por nombre o por calle y número) no se vuelve a crear', () => {
		const venues = [
			{ id: 7, slug: 'galpon', title: 'Galpón Inventado', data: { kind: 'lugar' } },
			{
				id: 8,
				slug: 'sotano',
				title: 'Sótano Inventado',
				data: { kind: 'lugar', address: 'Av. Otra Calle 456', area: 'Barrio Falso' }
			}
		];
		const { candidates } = planVenueImport(
			[
				ev('a', { location_name: 'galpón inventado' }),
				ev('b', { location: 'Otra Calle 456, CABA' })
			],
			{ venues }
		);
		expect(candidates.map((c) => c.existing?.id).sort()).toEqual([7, 8]);
		const linkB = candidates.find((c) => c.existing?.id === 8);
		// El lugar muestra su dirección como la tiene cargada, no como el evento: se avisa.
		expect(linkB?.events[0].fits).toBe(false);
	});
});

describe('qué cambiaría al vincular', () => {
	const venue = { title: 'Galpón Inventado', data: { kind: 'lugar', address: 'Calle Falsa 123' } };

	it('lo mismo, aunque cambien mayúsculas o tildes', () => {
		expect(
			eventFit({ name: 'galpon inventado', location: 'calle falsa 123', mapUrl: '' }, venue)
		).toEqual({ level: 'public', fits: true, diffs: [] });
		expect(eventFit({ name: 'Galpón Inventado', location: '', mapUrl: '' }, venue).fits).toBe(true);
	});

	it('otro nombre, otra dirección, o algo que el evento no mostraba', () => {
		expect(
			eventFit({ name: 'Otro', location: 'Calle Falsa 123', mapUrl: '' }, venue).diffs
		).toHaveLength(1);
		expect(
			eventFit({ name: 'Galpón Inventado', location: 'Calle Falsa 999', mapUrl: '' }, venue).fits
		).toBe(false);
		const extra = {
			title: 'Galpón Inventado',
			data: { ...venue.data, how_to_get_there: 'Timbre inventado' }
		};
		expect(
			eventFit({ name: 'Galpón Inventado', location: 'Calle Falsa 123', mapUrl: '' }, extra).diffs
		).toEqual(['también se va a ver lo que tiene el lugar: cómo llegar']);
		// Solo dirección: el nombre del lugar no se ve (no es un cambio).
		expect(eventFit({ name: '', location: 'Calle Falsa 123', mapUrl: '' }, venue).fits).toBe(true);
	});

	it('cambiar el nombre o el «Dónde» del lugar nuevo en la vista previa vuelve a calcular', () => {
		const { candidates } = planVenueImport([
			ev('a', { location_name: 'Galpón Inventado', location: 'Calle Falsa 123, CABA' }),
			ev('b', { location_name: 'El Galpón de Prueba', location: 'Calle Falsa 123, CABA' })
		]);
		const [c] = candidates;
		const fits = (/** @type {string} */ title) =>
			refitEvents(c, newVenueFor(c, { title, location: c.address }))
				.filter((e) => e.fits)
				.map((e) => e.slug);
		expect(fits('Galpón Inventado')).toEqual(['a']);
		expect(fits('El Galpón de Prueba')).toEqual(['b']);
	});

	it('lo que se guarda: el nivel del lugar y el propio de cada evento que muestra menos', () => {
		const { candidates } = planVenueImport([
			ev('a', { location_name: 'Galpón Inventado', location: 'Calle Falsa 123, CABA' }),
			ev('b', { location_name: 'Galpón Inventado' }),
			ev('c', { location: 'Calle Falsa 123, CABA' })
		]);
		const [c] = candidates;
		expect(c.events.every((e) => e.fits)).toBe(true);
		expect(importLinks(c, ['a', 'b', 'c', 'otro-evento'])).toEqual({
			venuePrivacy: 'public',
			links: [
				{ slug: 'a', privacy: null },
				{ slug: 'b', privacy: 'name' },
				{ slug: 'c', privacy: 'address' }
			].sort(
				(x, y) =>
					c.events.findIndex((e) => e.slug === x.slug) -
					c.events.findIndex((e) => e.slug === y.slug)
			)
		});
		// Sin el que muestra todo, el lugar no puede mostrar más que sus eventos.
		expect(importLinks(c, ['b', 'c']).venuePrivacy).toBe('name');
		// Un lugar que ya existe conserva su nivel.
		expect(importLinks(c, ['a'], 'area').links).toEqual([{ slug: 'a', privacy: 'public' }]);
	});
});

describe('cómo se crean (listados en Amigues o no)', () => {
	it('por defecto, no listados (decisión de gorrite)', () => {
		expect(DEFAULT_VENUE_LISTING).toBe('unlisted');
		expect(venueListing(undefined)).toBe('unlisted');
		expect(venueListing(null, null)).toBe('unlisted');
		expect(venueListing('cualquier cosa', '')).toBe('unlisted');
	});

	it('la opción para todos, salvo que el lugar tenga la suya', () => {
		expect(venueListing('listed')).toBe('listed');
		expect(venueListing('listed', '')).toBe('listed');
		expect(venueListing('unlisted', '')).toBe('unlisted');
		expect(venueListing('listed', 'unlisted')).toBe('unlisted');
		expect(venueListing('unlisted', 'listed')).toBe('listed');
		expect(venueListing(undefined, 'listed')).toBe('listed');
		expect(venueListing('listed', 'otra')).toBe('listed');
	});
});
