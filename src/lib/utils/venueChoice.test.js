import { describe, expect, it } from 'vitest';
import {
	NO_VENUE,
	readVenueChoice,
	sameVenueChoice,
	searchVenues,
	venueChoice,
	venueChoiceFields,
	venueChoiceText,
	venueOptionMarks,
	venueOptionPlace
} from './venueChoice.js';
import { PLACE_FIELD_KEYS, datosFields, splitPlaceFields } from '$lib/admin/postFields.js';

/** @param {Partial<import('./venueChoice.js').VenueOption>} o */
const option = (o) => ({
	id: 1,
	slug: 'sala-inventada',
	title: 'Sala Inventada',
	visibility: 'public',
	unlisted: false,
	approved: true,
	privacy: null,
	address: '',
	area: '',
	city: '',
	version: 1,
	...o
});

const VENUES = [
	option({
		id: 1,
		slug: 'cafe-del-arbol',
		title: 'Café del Árbol',
		address: 'Calle Inventada 742',
		area: 'Almagro'
	}),
	option({ id: 2, slug: 'el-sotano', title: 'El Sótano', city: 'La Plata', privacy: 'name' }),
	option({ id: 3, slug: 'arboleda', title: 'Arboleda', visibility: 'hidden', unlisted: true }),
	option({ id: 4, slug: 'casa-nueva', title: 'Casa Nueva', approved: false, visibility: 'members' })
];

describe('venueChoice', () => {
	it('limpia el id y el nivel', () => {
		expect(venueChoice('7', 'area')).toEqual({ venueId: 7, privacy: 'area' });
		expect(venueChoice(7, '')).toEqual({ venueId: 7, privacy: null });
		expect(venueChoice(7, 'cualquiera')).toEqual({ venueId: 7, privacy: null });
		for (const bad of ['', ' ', '0', '-3', '1.5', 'abc', null, undefined, 0]) {
			expect(venueChoice(bad, 'area'), String(bad)).toEqual(NO_VENUE);
		}
	});

	it('sin lugar, el nivel no cuenta para comparar', () => {
		expect(sameVenueChoice({ venueId: null, privacy: 'area' }, NO_VENUE)).toBe(true);
		expect(sameVenueChoice({ venueId: 1, privacy: null }, { venueId: 1, privacy: null })).toBe(
			true
		);
		expect(sameVenueChoice({ venueId: 1, privacy: 'area' }, { venueId: 1, privacy: null })).toBe(
			false
		);
		expect(sameVenueChoice({ venueId: 1, privacy: null }, { venueId: 2, privacy: null })).toBe(
			false
		);
	});
});

describe('readVenueChoice y venueChoiceFields', () => {
	/** @param {Record<string, string>} fields */
	const form = (fields) => {
		const f = new FormData();
		for (const [k, v] of Object.entries(fields)) f.set(k, v);
		return f;
	};

	it('sin `lugarCambio` no se tocó (aunque lleguen los otros campos)', () => {
		expect(readVenueChoice(form({}))).toBeNull();
		expect(readVenueChoice(form({ lugar: '3', lugarPrivacidad: 'hidden' }))).toBeNull();
	});

	it('ida y vuelta: elegir, cambiar el nivel y sacar', () => {
		for (const choice of [
			{ venueId: 3, privacy: null },
			{ venueId: 3, privacy: /** @type {const} */ ('hidden') },
			NO_VENUE
		]) {
			const fields = venueChoiceFields(choice, true);
			expect(fields.lugarCambio).toBe('1');
			expect(readVenueChoice(form(fields))).toEqual(choice);
		}
		expect(venueChoiceFields({ venueId: 3, privacy: 'area' }, false)).toEqual({
			lugar: '3',
			lugarPrivacidad: 'area',
			lugarCambio: ''
		});
		expect(venueChoiceFields({ venueId: null, privacy: 'area' }, true)).toEqual({
			lugar: '',
			lugarPrivacidad: '',
			lugarCambio: '1'
		});
	});
});

describe('searchVenues', () => {
	it('sin texto, los primeros', () => {
		expect(searchVenues(VENUES, '').map((v) => v.id)).toEqual([1, 2, 3, 4]);
		expect(searchVenues(VENUES, '  ', 2).map((v) => v.id)).toEqual([1, 2]);
	});

	it('sin importar tildes ni mayúsculas, primero los que empiezan así', () => {
		expect(searchVenues(VENUES, 'ARBOL').map((v) => v.id)).toEqual([3, 1]);
		expect(searchVenues(VENUES, 'sotano').map((v) => v.id)).toEqual([2]);
	});

	it('también por calle, barrio, ciudad y dirección en el sitio', () => {
		expect(searchVenues(VENUES, 'inventada 742').map((v) => v.id)).toEqual([1]);
		expect(searchVenues(VENUES, 'almagro').map((v) => v.id)).toEqual([1]);
		expect(searchVenues(VENUES, 'la plata').map((v) => v.id)).toEqual([2]);
		expect(searchVenues(VENUES, 'casa nueva').map((v) => v.id)).toEqual([4]);
		expect(searchVenues(VENUES, 'no existe')).toEqual([]);
	});
});

describe('marcas y textos', () => {
	it('marca los que no son públicos, los no listados y los sin aprobar', () => {
		expect(venueOptionMarks(VENUES[0])).toEqual([]);
		expect(venueOptionMarks(VENUES[2])).toEqual(['Oculto', 'No listado']);
		expect(venueOptionMarks(VENUES[3])).toEqual(['Solo con cuenta', 'Sin aprobar']);
	});

	it('dirección, barrio y ciudad (el panel ve la dirección)', () => {
		expect(venueOptionPlace(option({ area: 'Almagro', city: 'CABA' }))).toBe('Almagro, CABA');
		expect(venueOptionPlace(option({ address: 'Calle 1', city: 'CABA' }))).toBe('Calle 1, CABA');
		expect(venueOptionPlace(option({}))).toBe('');
	});

	it('lo elegido en palabras, con «Igual que el Lugar»', () => {
		expect(venueChoiceText({ venueId: 2, privacy: null }, VENUES)).toBe(
			'El Sótano · Igual que el Lugar (Sólo Nombre)'
		);
		expect(venueChoiceText({ venueId: 1, privacy: null }, VENUES)).toBe(
			'Café del Árbol · Igual que el Lugar (Nombre + dirección)'
		);
		expect(venueChoiceText({ venueId: 2, privacy: 'hidden' }, VENUES)).toBe('El Sótano · Nada');
		expect(venueChoiceText(NO_VENUE, VENUES)).toBe('');
		expect(venueChoiceText({ venueId: 99, privacy: null }, VENUES)).toBe('');
	});
});

describe('splitPlaceFields', () => {
	it('en los eventos, el «Dónde» en texto libre sale de Datos (en el mismo orden)', () => {
		for (const mode of /** @type {const} */ (['nuevo', 'editar'])) {
			const all = datosFields(mode);
			const { datos, place } = splitPlaceFields(all);
			expect(place.map((f) => f.key)).toEqual([...PLACE_FIELD_KEYS]);
			expect(datos.map((f) => f.key)).toEqual(
				all.map((f) => f.key).filter((k) => !PLACE_FIELD_KEYS.includes(k))
			);
		}
	});

	it('en las demás categorías no cambia nada (la «Dirección» de amigues queda en Datos)', () => {
		const all = datosFields('editar', 'amigues');
		expect(splitPlaceFields(all, 'amigues')).toEqual({ datos: all, place: [] });
	});
});
