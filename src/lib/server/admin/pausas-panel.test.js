/**
 * Las pausas de emergencia en el panel ($lib/server/emergencia.js): la tarjeta de Interruptores de
 * la portada de Ajustes lo dice en amarillo y «Para revisar» suma una fila roja por pausa, que se
 * va sola cuando se saca la variable.
 */
import { describe, expect, it } from 'vitest';
import { buildAjustesStatus } from './ajustesStatus.js';
import { PAUSES_HREF, pauseItems, reviewRows } from './review.js';

const NOW = Date.parse('2026-10-26T12:00:00Z');

/** @param {{ tickets: string | null, mails: string | null }} [pauses] */
const status = (pauses) =>
	buildAjustesStatus({
		settings: null,
		flags: { lo_que_sigo: true },
		lastActivity: null,
		tips: null,
		mpReady: true,
		automations: null,
		now: NOW,
		...(pauses ? { pauses } : {})
	});

describe('portada de Ajustes', () => {
	it('sin pausas, la tarjeta de Interruptores como siempre', () => {
		expect(status()['ajustes-interruptores']).toEqual({ text: 'Todos prendidos' });
		expect(status({ tickets: null, mails: null })['ajustes-interruptores']).toEqual({
			text: 'Todos prendidos'
		});
	});

	it('con una pausa, lo dice en amarillo', () => {
		expect(
			status({ tickets: 'Volvemos en un rato', mails: null })['ajustes-interruptores']
		).toEqual({ text: 'En pausa: la venta', tone: 'warn' });
		expect(status({ tickets: null, mails: '1' })['ajustes-interruptores']).toEqual({
			text: 'En pausa: los mails en tanda',
			tone: 'warn'
		});
		expect(status({ tickets: 'x', mails: '1' })['ajustes-interruptores']).toEqual({
			text: 'En pausa: la venta y los mails en tanda',
			tone: 'warn'
		});
	});
});

describe('«Para revisar»', () => {
	it('una fila roja por pausa, con el texto que ven les compradores', () => {
		expect(pauseItems({ tickets: null, mails: null })).toEqual([]);
		const items = pauseItems({ tickets: 'Volvemos en un rato', mails: '1' });
		expect(items.map((i) => i.id)).toEqual(['pause-tickets', 'pause-mails']);
		expect(items.every((i) => i.tone === 'bad' && i.href === PAUSES_HREF)).toBe(true);
		expect(items[0].text).toContain('«Volvemos en un rato»');
		expect(items[0].text).toContain('TICKETS_PAUSED');
		expect(items[1].text).toContain('MAILS_PAUSED');
	});

	it('van primero en la tarjeta (y cuentan en el número del menú)', () => {
		/** @param {{ tickets: string | null, mails: string | null }} pauses */
		const rows = (pauses) =>
			reviewRows({
				upcoming: [],
				ticketed: new Map(),
				settings: null,
				transfers: [],
				unsent: [],
				review: [],
				titles: new Map(),
				onlineMismatch: null,
				newProfiles: [],
				claims: [],
				integrity: null,
				tagRecords: null,
				tagUsage: null,
				pauses,
				now: NOW
			});
		expect(rows({ tickets: null, mails: null })).toEqual([]);
		expect(rows({ tickets: 'Pausa', mails: null }).map((r) => r.id)).toEqual(['pause-tickets']);
	});
});
