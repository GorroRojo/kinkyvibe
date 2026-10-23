import { describe, expect, it } from 'vitest';
import {
	DEFAULT_RANGE_DAYS,
	FALLBACK_ICON,
	MAX_RANGE_DAYS,
	flyerDateLine,
	flyerPlaceText,
	flyerPriceText,
	flyerRow,
	inRange,
	parseRange,
	seriesSubtitle,
	withOverrides
} from './agendaImpresa.js';

// Datos inventados.
const NOW = Date.parse('2026-07-20T15:00:00Z');

describe('flyerDateLine', () => {
	it('día, fecha y hora en hora de Argentina, con «hs» como el diseño', () => {
		expect(flyerDateLine('2026-07-26T20:00:00-03:00')).toBe('domingo 26 de julio. 20:00 hs');
		expect(flyerDateLine('2026-07-25T18:30:00-03:00')).toBe('sábado 25 de julio. 18:30 hs');
	});
	it('un evento a la 1 de la mañana en Argentina es de ese día, aunque en UTC sea otro', () => {
		expect(flyerDateLine('2026-08-01T04:00:00Z')).toBe('sábado 1 de agosto. 01:00 hs');
	});
	it('sin fecha válida, vacío', () => {
		expect(flyerDateLine('cualquier cosa')).toBe('');
	});
});

describe('flyerPlaceText', () => {
	it('online dice Online', () => {
		expect(flyerPlaceText({ location: 'Zoom' }, null)).toBe('Online');
		expect(flyerPlaceText({ modalidad: 'online' }, null)).toBe('Online');
		expect(flyerPlaceText({ tags: ['Online'] }, null)).toBe('Online');
	});
	it('sin lugar vinculado, el «Dónde» en texto libre (dirección primero)', () => {
		expect(
			flyerPlaceText({ location: 'Calle Falsa 123', location_name: 'Bar de Prueba' }, null)
		).toBe('Calle Falsa 123');
		expect(flyerPlaceText({ location_name: 'Plaza Inventada' }, null)).toBe('Plaza Inventada');
		expect(flyerPlaceText({}, null)).toBe('');
	});
	it('lugar público: dirección y barrio', () => {
		const venue = /** @type {const} */ ({
			level: 'public',
			name: 'Espacio de Prueba',
			address: 'Calle Falsa 123',
			area: 'Barrio Inventado',
			city: 'CABA'
		});
		expect(flyerPlaceText({ location: 'Zoom' }, venue)).toBe('Calle Falsa 123, Barrio Inventado');
		expect(flyerPlaceText({}, { level: 'public', name: 'Espacio de Prueba' })).toBe(
			'Espacio de Prueba'
		);
	});
	it('«Sólo dirección»: la dirección, nunca el nombre', () => {
		expect(
			flyerPlaceText({}, { level: 'address', address: 'Calle Falsa 123', area: 'Barrio Inventado' })
		).toBe('Calle Falsa 123, Barrio Inventado');
	});
	it('niveles que no muestran la dirección: nunca la inventa, avisa «dirección x privado»', () => {
		// Lo que llega ya viene filtrado por su nivel (venueView): igual, el texto no usa más que eso.
		expect(
			flyerPlaceText({ location: 'Calle Falsa 123' }, { level: 'area', area: 'San Telmo' })
		).toBe('San Telmo (dirección x privado)');
		expect(flyerPlaceText({}, { level: 'area', city: 'CABA' })).toBe('CABA (dirección x privado)');
		expect(flyerPlaceText({}, { level: 'name', name: 'Espacio de Prueba' })).toBe(
			'Espacio de Prueba (dirección x privado)'
		);
		expect(flyerPlaceText({ location: 'Calle Falsa 123' }, { level: 'hidden' })).toBe(
			'Dirección x privado'
		);
	});
	it('aunque le llegue de más, en «Sólo barrio» no muestra la dirección', () => {
		const leaky = /** @type {any} */ ({
			level: 'area',
			area: 'San Telmo',
			address: 'Calle Falsa 123'
		});
		expect(flyerPlaceText({}, leaky)).not.toContain('Falsa');
	});
});

describe('flyerPriceText', () => {
	it('un precio: «Entrada: $ X»', () => {
		expect(flyerPriceText([{ price: 16500 }], [], NOW)).toBe('Entrada: $ 16.500');
		expect(flyerPriceText([{ price: 16500 }, { price: 16500 }], [], NOW)).toBe('Entrada: $ 16.500');
	});
	it('varios: «Desde $ X» con el más barato', () => {
		expect(flyerPriceText([{ price: 20000 }, { price: 12000 }], [], NOW)).toBe('Desde $ 12.000');
	});
	it('a la gorra', () => {
		expect(flyerPriceText([{ price: 0, gorra: { min: 0, suggested: 2000 } }], [], NOW)).toBe(
			'A la gorra'
		);
		expect(
			flyerPriceText([{ price: 5000 }, { price: 0, gorra: { min: 0, suggested: 1 } }], [], NOW)
		).toBe('Entrada: $ 5.000 o a la gorra');
	});
	it('un único precio 0: Gratis', () => {
		expect(flyerPriceText([{ price: 0 }], [], NOW)).toBe('Gratis');
	});
	it('con tramos: los que no vencieron por fecha', () => {
		const tiers = [
			{ price: 8000, until: NOW - 1 },
			{ price: 10000, until: NOW + 1000 },
			{ price: 12000, until: null }
		];
		expect(flyerPriceText([{ price: 12000, tiers }], [], NOW)).toBe('Desde $ 10.000');
		expect(flyerPriceText([{ price: 12000, tiers: tiers.slice(2) }], [], NOW)).toBe(
			'Entrada: $ 12.000'
		);
	});
	it('sin entradas por el sitio: lo que dicen las etiquetas, o nada', () => {
		expect(flyerPriceText(null, ['Gratis'], NOW)).toBe('Gratis');
		expect(flyerPriceText([], ['a la gorra'], NOW)).toBe('A la gorra');
		expect(flyerPriceText(null, ['taller'], NOW)).toBe('');
	});
});

describe('seriesSubtitle', () => {
	it('la primera oración, sin la sintaxis de los enlaces', () => {
		expect(seriesSubtitle('Espacio [[cuir]] de [[prácticas|prácticas fetichistas]]. Y más.')).toBe(
			'Espacio cuir de prácticas fetichistas'
		);
	});
	it('larga o vacía: sin subtítulo', () => {
		expect(seriesSubtitle('x'.repeat(200))).toBe('');
		expect(seriesSubtitle(undefined)).toBe('');
	});
});

describe('flyerRow y withOverrides', () => {
	const event = {
		slug: 'evento-de-prueba',
		title: ' Evento de Prueba ',
		start: '2026-07-26T20:00:00-03:00',
		tags: ['Serie Inventada'],
		meta: {},
		venue: /** @type {const} */ ({ level: 'area', area: 'Barrio Inventado' }),
		types: [{ price: 16500 }],
		series: { name: 'Serie Inventada', icon: '🌶️', description: 'Espacio de prueba.' }
	};
	it('arma la fila con los datos y la serie', () => {
		expect(flyerRow(event, { now: NOW })).toEqual({
			slug: 'evento-de-prueba',
			title: 'Evento de Prueba',
			date: 'domingo 26 de julio. 20:00 hs',
			icon: '🌶️',
			subtitle: 'Espacio de prueba',
			place: 'Barrio Inventado (dirección x privado)',
			price: 'Entrada: $ 16.500'
		});
	});
	it('sin serie: el ícono genérico y sin subtítulo', () => {
		const row = flyerRow({ ...event, series: null }, { now: NOW });
		expect(row.icon).toBe(FALLBACK_ICON);
		expect(row.subtitle).toBe('');
	});
	it('lo cambiado a mano manda, también vacío; sin ícono, el genérico', () => {
		const row = flyerRow(event, { now: NOW });
		expect(withOverrides(row, { price: '', place: ' Online sincrónico ', icon: '' })).toEqual({
			...row,
			price: '',
			place: 'Online sincrónico',
			icon: FALLBACK_ICON
		});
		expect(withOverrides(row, { subtitle: undefined })).toEqual(row);
		expect(withOverrides(row, null)).toBe(row);
	});
});

describe('parseRange e inRange', () => {
	it('por defecto, hoy y los próximos días (en hora de Argentina)', () => {
		// 20/7 a las 23:30 en Argentina (ya 21/7 en UTC).
		const late = Date.parse('2026-07-21T02:30:00Z');
		const r = parseRange(new URLSearchParams(), late);
		expect(r.from).toBe('2026-07-20');
		expect(r.to).toBe(
			new Date(Date.parse('2026-07-20T00:00:00Z') + (DEFAULT_RANGE_DAYS - 1) * 86400000)
				.toISOString()
				.slice(0, 10)
		);
	});
	it('respeta el rango pedido, nunca al revés ni demasiado largo; ignora lo inválido', () => {
		expect(parseRange(new URLSearchParams('desde=2026-08-01&hasta=2026-08-10'), NOW)).toEqual({
			from: '2026-08-01',
			to: '2026-08-10'
		});
		expect(parseRange(new URLSearchParams('desde=2026-08-10&hasta=2026-08-01'), NOW)).toEqual({
			from: '2026-08-10',
			to: '2026-08-10'
		});
		const long = parseRange(new URLSearchParams('desde=2026-01-01&hasta=2030-01-01'), NOW);
		expect((Date.parse(long.to) - Date.parse(long.from)) / 86400000).toBe(MAX_RANGE_DAYS - 1);
		expect(parseRange(new URLSearchParams('desde=ayer&hasta=<x>'), NOW).from).toBe('2026-07-20');
	});
	it('inRange cuenta el día en Argentina, con los dos bordes', () => {
		const range = { from: '2026-07-20', to: '2026-07-26' };
		expect(inRange('2026-07-26T23:00:00-03:00', range)).toBe(true);
		expect(inRange('2026-07-27T01:00:00Z', range)).toBe(true); // 26/7 22:00 en Argentina
		expect(inRange('2026-07-27T10:00:00-03:00', range)).toBe(false);
		expect(inRange('nada', range)).toBe(false);
	});
});
