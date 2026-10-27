/**
 * El recordatorio de «Lo que sigo» sale cuando el evento entra en las próximas 24 horas: dice
 * «Hoy», «Mañana» o «Se viene» según el día (hora de Argentina). Datos inventados.
 */
import { describe, expect, it } from 'vitest';
import { buildFollowEmail, followReminderDay } from './email.js';

const START = '2026-10-10T22:00:00-03:00';
const input = {
	kind: /** @type {const} */ ('recordatorio'),
	title: 'Fiesta de prueba',
	start: START,
	eventUrl: 'https://kinkyvibe.example/calendario/fiesta-de-prueba',
	reasons: ['Ciclo de prueba'],
	manageUrl: 'https://kinkyvibe.example/mi-rincon/sigo',
	stopUrl: 'https://kinkyvibe.example/sigo/baja?t=x',
	origin: 'https://kinkyvibe.example'
};

describe('recordatorio de «Lo que sigo»', () => {
	it('el mismo día (hora de Argentina): «Hoy»', () => {
		const now = Date.parse('2026-10-10T00:30:00-03:00');
		expect(followReminderDay(START, now)).toBe('hoy');
		const m = buildFollowEmail({ ...input, now });
		expect(m.subject).toBe('Hoy: Fiesta de prueba');
		expect(m.html).toContain('Hoy se viene');
	});

	it('el día anterior: «Mañana», aunque en UTC ya sea el mismo día', () => {
		// 23:00 del 9 en Argentina = 02:00 del 10 en UTC.
		const now = Date.parse('2026-10-09T23:00:00-03:00');
		expect(followReminderDay(START, now)).toBe('manana');
		const m = buildFollowEmail({ ...input, now });
		expect(m.subject).toBe('Mañana: Fiesta de prueba');
		expect(m.html).toContain('Mañana se viene');
	});

	it('más adelante (o sin fecha que se pueda leer): «Se viene»', () => {
		const now = Date.parse('2026-10-07T12:00:00-03:00');
		expect(followReminderDay(START, now)).toBe('pronto');
		expect(buildFollowEmail({ ...input, now }).subject).toBe('Se viene: Fiesta de prueba');
		expect(followReminderDay('no es una fecha', now)).toBe('pronto');
	});
});
