/**
 * Talleres en varias partes: reglas puras (etiquetas, fechas, de qué evento es la entrada, datos
 * de una parte nueva). Datos inventados.
 */
import { describe, expect, it } from 'vitest';
import {
	addDays,
	coveringTicketSlug,
	newPartData,
	newPartTitle,
	numberParts,
	partDateText,
	partLabel,
	partLabelsBySlug,
	partLine,
	partsListTitle,
	partOf,
	sellsPerPart,
	withPartLabel
} from './partes.js';

/** @param {string} slug @param {string} start */
const info = (slug, start) => ({ slug, title: slug, start, end: null, status: null });

const taller = numberParts(info('taller-x', '2026-10-02T22:00-03:00'), [
	info('taller-x-parte-2', '2026-10-09T22:00-03:00'),
	info('taller-x-parte-3', '2026-10-16T19:30-03:00')
]);

describe('textos', () => {
	it('«Parte N de M»', () => {
		expect(partLabel(2, 3)).toBe('Parte 2 de 3');
	});

	it('fecha corta «vie 2 oct · 22:00», sin ISO ni «hs»', () => {
		expect(partDateText('2026-10-02T22:00-03:00')).toBe('vie 2 oct · 22:00');
		expect(partDateText('2026-10-16T19:30-03:00')).toBe('vie 16 oct · 19:30');
		expect(partDateText('2026-10-03')).toBe('sáb 3 oct');
		expect(partDateText('')).toBe('');
		expect(partDateText(null)).toBe('');
		expect(partDateText('cualquier cosa')).toBe('');
	});
});

describe('lista de partes (mails y página de la entrada)', () => {
	it('título «Las N partes del taller»', () => {
		expect(partsListTitle(3)).toBe('Las 3 partes del taller');
	});

	it('«Parte N · vie 2 oct · 22:00 · lugar», sin «hs» ni ISO', () => {
		expect(partLine({ n: 1, start: '2026-10-02T22:00-03:00', where: 'Espacio Inventado' })).toBe(
			'Parte 1 · vie 2 oct · 22:00 · Espacio Inventado'
		);
		expect(partLine({ n: 2, start: '2026-10-09', where: '' })).toBe('Parte 2 · vie 9 oct');
		expect(partLine({ n: 3, start: null, where: 'Online' })).toBe('Parte 3 · Online');
		expect(
			partLine({ n: 2, start: '2026-10-09T22:00-03:00', where: 'X', status: 'cancelado' })
		).toBe('Parte 2 · vie 9 oct · 22:00 · X · cancelada');
	});
});

describe('numerar y cubrir', () => {
	it('el taller es la parte 1 y las demás siguen en orden', () => {
		expect(taller.total).toBe(3);
		expect(taller.parts.map((p) => [p.slug, p.n])).toEqual([
			['taller-x', 1],
			['taller-x-parte-2', 2],
			['taller-x-parte-3', 3]
		]);
		expect(taller.workshop.perPart).toBe(false);
		expect(partOf(taller, 'taller-x-parte-3')?.n).toBe(3);
		expect(partOf(taller, 'otro')).toBeNull();
	});

	it('una sola entrada: las partes 2 en adelante usan la del taller', () => {
		expect(coveringTicketSlug(taller, 'taller-x-parte-2')).toBe('taller-x');
		expect(coveringTicketSlug(taller, 'taller-x-parte-3')).toBe('taller-x');
		// El taller vende la suya; un evento ajeno, también.
		expect(coveringTicketSlug(taller, 'taller-x')).toBeNull();
		expect(coveringTicketSlug(taller, 'otro')).toBeNull();
		expect(coveringTicketSlug(null, 'taller-x-parte-2')).toBeNull();
	});

	it('entradas por parte: cada parte vende la suya', () => {
		const porParte = numberParts({ ...info('t', '2026-10-02T22:00-03:00'), perPart: true }, [
			info('t-parte-2', '2026-10-09T22:00-03:00')
		]);
		expect(coveringTicketSlug(porParte, 't-parte-2')).toBeNull();
		expect(sellsPerPart({ entradas_por_parte: true })).toBe(true);
		expect(sellsPerPart({ entradas_por_parte: 'true' })).toBe(false);
		expect(sellsPerPart(null)).toBe(false);
	});

	it('etiquetas del calendario por dirección', () => {
		const labels = partLabelsBySlug([taller]);
		expect(labels.get('taller-x')).toEqual({ n: 1, m: 3, workshop: 'taller-x' });
		expect(labels.get('taller-x-parte-3')).toEqual({ n: 3, m: 3, workshop: 'taller-x' });
		const post = { path: '/calendario/taller-x-parte-2', meta: { postID: 'taller-x-parte-2' } };
		expect(withPartLabel(post, labels).meta).toEqual({
			postID: 'taller-x-parte-2',
			parte: { n: 2, m: 3 }
		});
		const suelto = { path: '/calendario/otro', meta: { postID: 'otro' } };
		expect(withPartLabel(suelto, labels)).toBe(suelto);
	});
});

describe('parte nueva', () => {
	it('fecha: el mismo horario días después, con la zona escrita', () => {
		expect(addDays('2026-10-02T22:00-03:00', 7)).toBe('2026-10-09T22:00-03:00');
		expect(addDays('2026-10-30T22:00-03:00', 7)).toBe('2026-11-06T22:00-03:00');
		expect(addDays('2026-12-28', 7)).toBe('2027-01-04');
		expect(addDays('raro', 7)).toBe('raro');
	});

	it('título: el del taller sin su «(parte 1 de 2)»', () => {
		expect(newPartTitle('Contra la moral sexual (parte 1 de 2)', 3)).toBe(
			'Contra la moral sexual (parte 3)'
		);
		expect(newPartTitle('Taller de prueba', 2)).toBe('Taller de prueba (parte 2)');
		expect(newPartTitle('Taller - Parte 1', 2)).toBe('Taller (parte 2)');
		expect(newPartTitle('', 2)).toBe('Taller (parte 2)');
	});

	const data = {
		summary: 'Un taller inventado',
		start: '2026-10-02T22:00-03:00',
		end: '2026-10-02T23:59-03:00',
		tags: ['taller'],
		published_date: '2026-09-01Z-03:00',
		extra: {
			tickets: [{ id: 'general', name: 'General', price: 1000 }],
			tickets_close: '2026-10-01',
			puerta: true,
			color: 'rosa'
		}
	};

	it('una sola entrada: copia todo menos la configuración de entradas', () => {
		const out = newPartData(data, { start: '2026-10-09T22:00-03:00' });
		expect(out).toEqual({
			summary: 'Un taller inventado',
			start: '2026-10-09T22:00-03:00',
			tags: ['taller'],
			extra: { color: 'rosa' }
		});
		// No toca el original.
		expect(data.extra.tickets).toHaveLength(1);
	});

	it('entradas por parte: copia la configuración de entradas (sin la marca del taller)', () => {
		const out = newPartData(
			{ ...data, extra: { ...data.extra, entradas_por_parte: true } },
			{ start: '2026-10-09T22:00-03:00', end: '2026-10-09T23:00-03:00' }
		);
		expect(out.end).toBe('2026-10-09T23:00-03:00');
		expect(out.extra).toEqual({
			tickets: [{ id: 'general', name: 'General', price: 1000 }],
			tickets_close: '2026-10-01',
			puerta: true,
			color: 'rosa'
		});
	});

	it('sin nada más en `extra`, sin `extra`', () => {
		const out = newPartData(
			{ start: '2026-10-02T22:00-03:00', extra: { tickets: [] } },
			{ start: '2026-10-09T22:00-03:00' }
		);
		expect(out).toEqual({ start: '2026-10-09T22:00-03:00' });
	});
});
