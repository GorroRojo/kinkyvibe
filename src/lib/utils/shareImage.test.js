import { describe, it, expect } from 'vitest';
import {
	formatEventDate,
	splitTitle,
	priceLabel,
	shortPlace,
	defaultTexts,
	buildCaption
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
		start: '2026-09-12T20:00-03:00',
		end: '2026-09-13T01:30-03:00',
		location: 'Agrelo 3399, Boedo. Ciudad Autónoma de Buenos Aires',
		link: 'https://example.com',
		link_text: 'PRE VENTA'
	};
	it('defaultTexts fills the image texts from the event', () => {
		const t = defaultTexts(meta);
		expect(t.title).toBe('Picantearla');
		expect(t.sub).toBe('61ª Edición');
		expect(t.place).toBe('Agrelo 3399, Boedo. CABA');
		expect(t.cta).toBe('PRE VENTA · LINK EN BIO');
		expect(t.kicker).toBe('');
	});
	it('cancelled events get no call to action and a caption warning', () => {
		const m = { ...meta, status: 'cancelado' };
		expect(defaultTexts(m).cta).toBe('');
		expect(buildCaption(m).startsWith('❌ EVENTO CANCELADO ❌')).toBe(true);
	});
	it('caption has link and hashtags', () => {
		const c = buildCaption(meta);
		expect(c).toContain('🔗 Más info: kinkyvibe.ar/calendario/picantearla-2026-09');
		expect(c).toContain('#kinkyvibe #picantearla');
		expect(c).toContain('#buenosaires');
		expect(c).toContain('👉 Pre venta: link en bio');
	});
});
