import { describe, expect, it } from 'vitest';
import {
	TRANSFER_CLOSING_HOUR,
	TRANSFER_WORKING_DAYS,
	transferDeadline,
	transferHoldText,
	transferRuleText,
	workingDaysText
} from './transferDeadline.js';

/** @param {string} iso */
const at = (iso) => Date.parse(iso);

describe('transferDeadline: 20:00 del segundo día hábil (martes a sábado) después del día de la compra', () => {
	it.each([
		['domingo → miércoles', '2026-10-11T10:00-03:00', '2026-10-14T20:00-03:00'],
		['martes 15:00 → jueves', '2026-10-13T15:00-03:00', '2026-10-15T20:00-03:00'],
		['viernes → martes (sábado y martes)', '2026-10-16T12:00-03:00', '2026-10-20T20:00-03:00'],
		['sábado → miércoles', '2026-10-17T18:00-03:00', '2026-10-21T20:00-03:00'],
		['lunes → miércoles', '2026-10-12T09:00-03:00', '2026-10-14T20:00-03:00'],
		// El día de la compra nunca cuenta, sea la hora que sea.
		['martes 00:00 → jueves', '2026-10-13T00:00-03:00', '2026-10-15T20:00-03:00'],
		['martes 19:59 → jueves', '2026-10-13T19:59-03:00', '2026-10-15T20:00-03:00'],
		['martes 20:30 → jueves', '2026-10-13T20:30-03:00', '2026-10-15T20:00-03:00'],
		['martes 23:59 → jueves', '2026-10-13T23:59-03:00', '2026-10-15T20:00-03:00']
	])('%s', (_, bought, deadline) => {
		expect(transferDeadline(at(bought))).toBe(at(deadline));
	});

	it('el día se cuenta en Argentina, no en UTC (alrededor de la medianoche UTC)', () => {
		// Lunes 23:00 en Argentina = martes 02:00 UTC: es una compra del lunes.
		expect(transferDeadline(at('2026-10-13T02:00Z'))).toBe(at('2026-10-14T20:00-03:00'));
		// Martes 21:30 en Argentina = miércoles 00:30 UTC: es una compra del martes.
		expect(transferDeadline(at('2026-10-14T00:30Z'))).toBe(at('2026-10-15T20:00-03:00'));
		// Martes 00:00 en Argentina = martes 03:00 UTC, el primer instante del martes.
		expect(transferDeadline(at('2026-10-13T03:00Z'))).toBe(at('2026-10-15T20:00-03:00'));
		expect(transferDeadline(at('2026-10-13T02:59:59.999Z'))).toBe(at('2026-10-14T20:00-03:00'));
	});

	it('las 20:00 de Argentina son las 23:00 UTC todo el año (Argentina no tiene horario de verano)', () => {
		const fmt = new Intl.DateTimeFormat('en-GB', {
			timeZone: 'America/Argentina/Buenos_Aires',
			hour: '2-digit',
			minute: '2-digit',
			hourCycle: 'h23'
		});
		for (const bought of ['2026-01-14T10:00Z', '2026-03-29T10:00Z', '2026-07-08T10:00Z']) {
			const d = transferDeadline(at(bought));
			expect(new Date(d).getUTCHours()).toBe(23);
			expect(fmt.format(d)).toBe('20:00');
		}
	});

	it('cruza fin de mes', () => {
		// Jueves 29/10 → viernes 30, sábado 31.
		expect(transferDeadline(at('2026-10-29T16:00-03:00'))).toBe(at('2026-10-31T20:00-03:00'));
		// Viernes 30/10 → sábado 31, martes 3/11.
		expect(transferDeadline(at('2026-10-30T16:00-03:00'))).toBe(at('2026-11-03T20:00-03:00'));
		// Febrero: sábado 27/2/2027 → martes 2/3, miércoles 3/3.
		expect(transferDeadline(at('2027-02-27T16:00-03:00'))).toBe(at('2027-03-03T20:00-03:00'));
	});

	it('cruza fin de año', () => {
		// Jueves 31/12/2026 → viernes 1/1, sábado 2/1/2027.
		expect(transferDeadline(at('2026-12-31T22:00-03:00'))).toBe(at('2027-01-02T20:00-03:00'));
		// Sábado 26/12/2026 → martes 29, miércoles 30.
		expect(transferDeadline(at('2026-12-26T11:00-03:00'))).toBe(at('2026-12-30T20:00-03:00'));
	});

	it('los feriados no se tienen en cuenta', () => {
		// Miércoles 23/12 → jueves 24, viernes 25 (Navidad cuenta como un día hábil más).
		expect(transferDeadline(at('2026-12-23T15:00-03:00'))).toBe(at('2026-12-25T20:00-03:00'));
	});
});

describe('transferDeadline: cerca del evento', () => {
	const sunday = at('2026-10-11T10:00-03:00'); // vence el miércoles 14 a las 20:00

	it('si el evento empieza antes del vencimiento, la reserva dura hasta que empieza', () => {
		expect(transferDeadline(sunday, '2026-10-13T21:00-03:00')).toBe(at('2026-10-13T21:00-03:00'));
		expect(transferDeadline(sunday, at('2026-10-11T22:00-03:00'))).toBe(
			at('2026-10-11T22:00-03:00')
		);
		expect(transferDeadline(sunday, new Date('2026-10-14T19:00-03:00'))).toBe(
			at('2026-10-14T19:00-03:00')
		);
	});

	it('si empieza después, manda el vencimiento por días hábiles', () => {
		expect(transferDeadline(sunday, '2026-10-14T21:00-03:00')).toBe(at('2026-10-14T20:00-03:00'));
		expect(transferDeadline(sunday, '2026-12-12T21:00-03:00')).toBe(at('2026-10-14T20:00-03:00'));
	});

	it('sin comienzo (o ilegible) o con el evento ya empezado, solo los días hábiles', () => {
		const deadline = at('2026-10-14T20:00-03:00');
		expect(transferDeadline(sunday)).toBe(deadline);
		expect(transferDeadline(sunday, null)).toBe(deadline);
		expect(transferDeadline(sunday, '')).toBe(deadline);
		expect(transferDeadline(sunday, 'no es una fecha')).toBe(deadline);
		// La venta puede seguir abierta después del comienzo (`tickets_close`): una reserva que
		// nace vencida no sirve.
		expect(transferDeadline(sunday, '2026-10-11T09:00-03:00')).toBe(deadline);
		expect(transferDeadline(sunday, sunday)).toBe(deadline);
	});
});

describe('la configuración y los textos', () => {
	it('días hábiles de martes a sábado, cierre a las 20', () => {
		expect(TRANSFER_WORKING_DAYS).toEqual([2, 3, 4, 5, 6]);
		expect(TRANSFER_CLOSING_HOUR).toBe(20);
		expect(workingDaysText()).toBe('de martes a sábado');
	});

	it('la regla en una frase', () => {
		expect(transferRuleText()).toBe(
			'hasta las 20:00 (hora de Argentina) del segundo día hábil después de la compra, sin contar el día en que se compra (los días hábiles son de martes a sábado)'
		);
	});

	it('lo que se le dice a quien compra, con la fecha exacta en hora de Argentina', () => {
		const d = at('2026-10-14T20:00-03:00');
		expect(transferHoldText(d)).toBe(
			'Te guardamos el lugar hasta el miércoles 14 de octubre a las 20:00. Transferí y mandanos el comprobante antes de esa hora; si no llega, la reserva se libera.'
		);
		expect(transferHoldText(d, { note: 'hora de Argentina y Uruguay' })).toBe(
			'Te guardamos el lugar hasta el miércoles 14 de octubre a las 20:00 (hora de Argentina y Uruguay). Transferí y mandanos el comprobante antes de esa hora; si no llega, la reserva se libera.'
		);
	});
});
