import { describe, expect, it } from 'vitest';
import { ONLINE_MISMATCH_TEXT } from './onlineTagMismatch.js';
import {
	eventMissing,
	missingInputFromMeta,
	missingSummary,
	publishWarnings
} from './eventMissing.js';

/** Un evento completo (datos inventados). */
const FULL = {
	title: 'Taller de prueba',
	summary: 'Un taller inventado para los tests.',
	featured: 1,
	location: 'Calle Falsa 123',
	location_name: 'Lugar de prueba',
	tags: ['español', 'pago', 'AMBA', 'taller'],
	authors: ['KinkyVibe'],
	link: 'https://example.com/inscripcion',
	status: 'abierto'
};

/** @param {Record<string, unknown>} [changes] */
const missingOf = (changes = {}) =>
	eventMissing(missingInputFromMeta({ ...FULL, ...changes })).map((m) => m.id);

describe('eventMissing', () => {
	it('un evento completo no tiene nada pendiente', () => {
		expect(missingOf()).toEqual([]);
	});

	it('lista lo que falta, en orden', () => {
		expect(
			missingOf({
				featured: undefined,
				summary: '',
				location: '',
				location_name: '  ',
				tags: ['español'],
				authors: [],
				link: ''
			})
		).toEqual(['imagen', 'resumen', 'donde', 'region', 'precio', 'inscripcion', 'organizan']);
	});

	it('online no necesita dirección (pero sí región)', () => {
		expect(
			missingOf({ location: '', location_name: '', tags: ['español', 'gratis', 'Online'] })
		).toEqual([]);
	});

	it('«Dónde» con la regla de la página (eventMode): modalidad o «Zoom» cuentan como online', () => {
		// `modalidad: online` sin etiqueta: no falta el dónde (antes sí), sí la región.
		expect(missingOf({ location: '', location_name: '', modalidad: 'online' })).toEqual([]);
		expect(
			missingOf({ location: '', location_name: '', modalidad: 'online', tags: ['pago'] })
		).toEqual(['region']);
		expect(missingOf({ location: 'Zoom', location_name: '' })).toEqual([]);
		// `modalidad: presencial` con la etiqueta Online y sin «Dónde»: falta el dónde.
		expect(
			missingOf({
				location: '',
				location_name: '',
				modalidad: 'presencial',
				tags: ['Online', 'pago']
			})
		).toEqual(['donde']);
	});

	it('con entradas en el sitio no hace falta link', () => {
		expect(
			missingOf({ link: '', tickets: [{ id: 'general', name: 'General', price: 1000 }] })
		).toEqual([]);
	});

	it('«anunciado» no muestra el link: cuenta como que falta (salvo que venda entradas)', () => {
		expect(missingOf({ status: 'anunciado' })).toEqual(['inscripcion']);
		expect(missingOf({ status: 'anunciado', tickets: [{ id: 'general' }] })).toEqual([]);
	});

	it('acepta etiquetas y organizadores sueltos (un string)', () => {
		expect(missingOf({ tags: 'AMBA', authors: 'KinkyVibe' })).toEqual(['precio']);
	});

	it('sin frontmatter, falta todo', () => {
		expect(eventMissing(missingInputFromMeta(null))).toHaveLength(7);
	});
});

describe('missingSummary', () => {
	it('arma el texto corto', () => {
		expect(missingSummary([{ label: 'Imagen' }, { label: 'Link o entradas' }])).toBe(
			'Falta: imagen, link o entradas'
		);
		expect(missingSummary([])).toBe('');
	});
});

describe('publishWarnings (Revisar antes de publicar)', () => {
	const base = {
		image: true,
		summary: 'Resumen',
		location: 'Calle Falsa 123',
		locationName: 'Lugar de prueba',
		tags: ['AMBA', 'pago'],
		authors: ['Alguien'],
		link: 'https://example.com',
		tickets: false,
		status: 'abierto'
	};
	it('completo: sin avisos', () => {
		expect(publishWarnings(base)).toEqual([]);
	});
	it('«Abierto» sin link ni entradas: lo dice', () => {
		const w = publishWarnings({ ...base, link: '' });
		expect(w.map((x) => x.id)).toEqual(['inscripcion']);
		expect(w[0].detail).toContain('«Abierto»');
	});
	it('con entradas no hace falta el link', () => {
		expect(publishWarnings({ ...base, link: '', tickets: true })).toEqual([]);
	});
	it('sin imagen', () => {
		expect(publishWarnings({ ...base, image: false }).map((x) => x.id)).toEqual(['imagen']);
	});
	// Antes se llamaba «avisa que figura como Online»: la revisión ya no inventa «Online» para un
	// evento sin lugar (dice «—»), así que el aviso tampoco lo dice.
	it('región presencial sin dónde: avisa que falta el dónde', () => {
		const w = publishWarnings({ ...base, location: '', locationName: '' });
		expect(w.map((x) => x.id)).toEqual(['donde']);
		expect(w[0].detail).toContain('AMBA');
		expect(w[0].detail).not.toContain('Online');
	});
	it('un lugar elegido de la lista cuenta como dónde', () => {
		expect(publishWarnings({ ...base, location: '', locationName: '', venue: true })).toEqual([]);
	});
	it('etiqueta Online con dirección: avisa la contradicción', () => {
		const w = publishWarnings({ ...base, tags: ['Online', 'pago'] });
		expect(w.map((x) => x.label)).toEqual(['Online o presencial']);
	});
	it('la contradicción es la de onlineTagMismatch, con su mismo texto', () => {
		const w = publishWarnings({ ...base, tags: ['Online', 'pago'] });
		expect(w[0]).toMatchObject({ id: 'donde', detail: ONLINE_MISMATCH_TEXT });
		// Un lugar elegido de la lista también cuenta.
		expect(
			publishWarnings({
				...base,
				location: '',
				locationName: '',
				tags: ['Online', 'pago'],
				venue: true
			}).map((x) => x.label)
		).toEqual(['Online o presencial']);
		// «Zoom» no es un lugar: no hay contradicción (antes avisaba).
		expect(
			publishWarnings({ ...base, location: 'Zoom', locationName: '', tags: ['Online', 'pago'] })
		).toEqual([]);
	});
});
