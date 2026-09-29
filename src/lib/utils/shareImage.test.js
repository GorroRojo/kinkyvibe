import { describe, it, expect } from 'vitest';
import {
	formatEventDate,
	splitTitle,
	priceLabel,
	shortPlace,
	defaultTexts,
	defaultEnabled,
	visibleTexts,
	buildCaption,
	firstSentences,
	findAmount,
	extrasFromSections,
	censorText
} from './shareImage.js';

const NOW = new Date('2026-09-01T12:00:00-03:00');

describe('formatEventDate', () => {
	it('same-day event', () => {
		const d = formatEventDate('2026-03-07T11:00-03:00', '2026-03-07T13:30-03:00', NOW);
		expect(d.dayShort).toBe('SÁB 7 MAR');
		expect(d.hoursShort).toBe('11 A 13:30 HS');
		expect(d.day).toBe('Sábado 7 de marzo');
		expect(d.multiDay).toBe(false);
	});
	it('a night that ends after midnight is still one day', () => {
		const d = formatEventDate('2026-09-12T20:00-03:00', '2026-09-13T01:30-03:00', NOW);
		expect(d.dayShort).toBe('SÁB 12 SEP');
		expect(d.hoursShort).toBe('20 A 1:30 HS');
		expect(d.multiDay).toBe(false);
	});
	it('multi-day event shows a range', () => {
		const d = formatEventDate('2026-11-04T10:00-03:00', '2026-11-05T18:00-03:00', NOW);
		expect(d.multiDay).toBe(true);
		expect(d.dayShort).toBe('MIÉ 4 AL JUE 5 NOV');
		expect(d.hoursShort).toBe('DESDE LAS 10 HS');
		expect(d.day).toBe('Miércoles 4 de noviembre al jueves 5 de noviembre');
	});
	it('multi-day across months names both months', () => {
		const d = formatEventDate('2026-10-31T10:00-03:00', '2026-11-01T18:00-03:00', NOW);
		expect(d.dayShort).toBe('SÁB 31 OCT AL DOM 1 NOV');
	});
	it('adds the year for other years', () => {
		expect(formatEventDate('2023-11-04T10:00-03:00', undefined, NOW).day).toContain('2023');
	});
	it('invalid dates give empty strings', () => {
		expect(formatEventDate('nope').dayShort).toBe('');
	});
});

describe('splitTitle', () => {
	it('moves a trailing parenthesis to the subtitle', () => {
		expect(splitTitle('Picantearla (49ª Edición)')).toEqual({
			kicker: '',
			title: 'Picantearla',
			sub: '49ª Edición'
		});
	});
	it('splits on " - "', () => {
		expect(splitTitle('Club de Hosts - Erotismo y Misterio')).toMatchObject({
			title: 'Club de Hosts',
			sub: 'Erotismo y Misterio'
		});
	});
	it('uses the series as kicker when the title already has a colon', () => {
		expect(splitTitle('Amarres: placer en el trabajo sexual - Cuirdas Sudacas')).toEqual({
			kicker: 'Cuirdas Sudacas',
			title: 'Amarres',
			sub: 'placer en el trabajo sexual'
		});
	});
	it('leaves simple titles alone', () => {
		expect(splitTitle('Jamarada Kinky')).toEqual({ kicker: '', title: 'Jamarada Kinky', sub: '' });
	});
});

describe('small helpers', () => {
	it('priceLabel reads the price tags', () => {
		expect(priceLabel(['BDSM', 'Gratis'])).toBe('GRATIS');
		expect(priceLabel(['a la gorra'])).toBe('A LA GORRA');
		expect(priceLabel(['pago'])).toBe('');
		expect(priceLabel(undefined)).toBe('');
	});
	it('shortPlace abbreviates CABA', () => {
		expect(shortPlace('San Telmo, Ciudad Autónoma de Buenos Aires')).toBe('San Telmo, CABA');
	});
});

describe('texts', () => {
	const meta = {
		postID: 'picantearla-2026-09',
		title: 'Picantearla (61ª Edición)',
		summary: 'Espacio cuir de prácticas kinky.',
		tags: ['KinkyVibe', 'Picantearla', 'pago', 'AMBA'],
		authors: ['KinkyVibe'],
		status: 'abierto',
		// en el futuro, para que tenga llamado a inscribirse
		start: '2099-09-12T20:00-03:00',
		end: '2099-09-13T01:30-03:00',
		location: 'Agrelo 3399, Boedo. Ciudad Autónoma de Buenos Aires',
		link: 'https://example.com',
		link_text: 'PRE VENTA'
	};
	it('defaultTexts fills the image texts from the event', () => {
		const t = defaultTexts(meta);
		expect(t.title).toBe('Picantearla');
		expect(t.sub).toBe('61ª Edición');
		expect(t.place).toBe('Agrelo 3399, Boedo. CABA');
		expect(t.cta).toBe('Entradas en');
		expect(t.url).toBe('kinkyvibe.ar/calendario/picantearla-2026-09');
		expect(t.organizers).toBe('Kinky Vibe');
		expect(t.tags).toBe('Picantearla');
		expect(t.kicker).toBe('');
	});
	it('cancelled or past events only point to more info', () => {
		const m = { ...meta, status: 'cancelado' };
		expect(defaultTexts(m).cta).toBe('Más info en');
		expect(defaultTexts({ ...meta, start: '2020-01-01T20:00-03:00', end: '2020-01-01T22:00-03:00' }).cta).toBe('Más info en');
		expect(buildCaption(m).startsWith('❌ EVENTO CANCELADO ❌')).toBe(true);
	});
	it('caption has link and hashtags', () => {
		const c = buildCaption(meta);
		expect(c).toContain('👉 Pre venta y más info: kinkyvibe.ar/calendario/picantearla-2026-09');
		expect(c).toContain('#kinkyvibe #picantearla');
		expect(c).toContain('#buenosaires');
		expect(c).not.toMatch(/instagram|link en bio/i);
		expect(buildCaption({ ...meta, status: 'anunciado' })).toContain('🔗 Más info: kinkyvibe.ar/calendario/picantearla-2026-09');
	});
});

describe('datos del texto del evento', () => {
	it('firstSentences corta por oraciones', () => {
		expect(firstSentences('Uno. Dos. Tres.', 9)).toBe('Uno. Dos.');
		expect(firstSentences('Corto')).toBe('Corto');
		expect(firstSentences('una oración larguísima sin puntos que no entra', 20)).toBe('una oración…');
	});
	it('findAmount encuentra precios escritos de varias formas', () => {
		expect(findAmount('La entrada se paga en puerta a 6000$ por persona.')).toBe('$6.000');
		expect(findAmount('valor: $20.250 con beca')).toBe('$20.250');
		expect(findAmount('gratis')).toBe('');
	});
	it('extrasFromSections toma entrada, para quién, accesibilidad y dress code', () => {
		const ex = extrasFromSections([
			{ heading: '🤩 LA IDEA DEL EVENTO', text: 'Vení con dress code negro. Traé agua.', items: [] },
			{ heading: 'Entrada', text: 'La entrada se paga en puerta a 6000$ por persona. Con 50% de descuento para el Club.', items: [] },
			{ heading: '¿A quién está dirigido este espacio?', text: 'A todes quienes quieran practicar.', items: [] },
			{ heading: '¿Qué onda la accesibilidad del espacio?', text: 'QI cuenta con:', items: ['Baños sin género', 'Rampa'] },
			{ heading: '¿Qué aportes te vas a llevar?', text: 'Muchos.', items: [] }
		]);
		expect(ex.priceInfo).toBe('La entrada se paga en puerta a 6000$ por persona. Con 50% de descuento para el Club.');
		expect(ex.audience).toBe('A todes quienes quieran practicar.');
		expect(ex.access).toBe('Baños sin género · Rampa');
		expect(ex.dress).toBe('Vení con dress code negro.');
		expect(extrasFromSections([])).toEqual({ priceInfo: '', audience: '', access: '', dress: '' });
	});
	it('defaultTexts suma lo que vino del texto y las etiquetas de acceso', () => {
		const t = defaultTexts(
			{ postID: 'x', title: 'Jam', tags: ['LSA', 'pago', 'cuerdas', 'AMBA'], authors: ['Ana_B', 'KinkyVibe'], start: '2099-01-01T20:00-03:00' },
			{ priceInfo: 'A 6000$ en puerta.', access: 'Rampa' }
		);
		expect(t.price).toBe('$6.000');
		expect(t.access).toBe('Con intérprete de LSA · Rampa');
		expect(t.tags).toBe('Cuerdas');
		expect(t.kicker).toBe('con Ana B');
		expect(t.organizers).toBe('Ana B & Kinky Vibe');
		expect(t.place).toBe('ONLINE');
	});
	it('los campos apagados no se dibujan (salvo el título)', () => {
		const t = defaultTexts({ postID: 'x', title: 'Jam', summary: 'Hola', start: '2099-01-01T20:00-03:00' });
		const on = defaultEnabled(t);
		expect(on.summary).toBe(true);
		expect(on.audience).toBe(false);
		const v = visibleTexts(t, { ...on, summary: false, title: false });
		expect(v.summary).toBe('');
		expect(v.title).toBe('Jam');
		expect(v.date).toBe(t.date);
	});
});

describe('censorText', () => {
	it('disimula palabras sensibles como en los flyers', () => {
		expect(censorText('Taller de BDSM')).toBe('Taller de BD$M');
		expect(censorText('Asfixia erótica')).not.toMatch(/asfixia|erótica/i);
		const c = censorText('Tortura genital');
		expect(c).toHaveLength('Tortura genital'.length);
		expect(c).toMatch(/^T.rtur4 g.n.t.l$/);
		expect(c).not.toMatch(/tortura|genital/i);
		expect(censorText('Noche de juegos')).toBe('Noche de juegos');
		expect(censorText('')).toBe('');
	});
});
