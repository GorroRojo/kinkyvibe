/**
 * El mail para confirmar «Avisame si se repite» dice cuándo vence el link, con el día y la hora
 * de Argentina. Reloj fijo; links inventados.
 */
import { describe, expect, it } from 'vitest';
import { buildSeriesConfirmEmail, editionDate } from './email.js';
import { CONFIRM_TTL_MS } from './subscriptions.js';

// Viernes 2 de octubre de 2026, 14:25 en Argentina.
const NOW = Date.UTC(2026, 9, 2, 17, 25);

describe('buildSeriesConfirmEmail', () => {
	it('el link vence en 48 horas, el domingo a las 14:25 (hora de Argentina y Uruguay)', () => {
		const m = buildSeriesConfirmEmail({
			seriesName: 'Serie Inventada',
			confirmUrl: 'https://kinkyvibe.ar/avisos/confirmar/abc',
			unsubscribeUrl: 'https://kinkyvibe.ar/avisos/baja/def',
			expiresAt: NOW + CONFIRM_TTL_MS,
			now: NOW
		});
		const vence =
			'El link vence en 48 horas (el domingo 4 de octubre a las 14:25, hora de Argentina y Uruguay).';
		expect(m.text).toContain(
			`Para confirmarlo, entrá a este link: https://kinkyvibe.ar/avisos/confirmar/abc\n${vence}`
		);
		expect(m.html).toContain(vence);
	});
});

describe('editionDate', () => {
	it('shows the time on a 24-hour clock, in Argentina time', () => {
		const out = editionDate('2026-10-11T22:00:00-03:00');
		expect(out).toContain('11 de octubre de 2026');
		expect(out).toContain('22:00');
		expect(out).not.toMatch(/[ap]\.\s?m\./i);
	});
});
