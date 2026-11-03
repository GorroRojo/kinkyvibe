import { describe, expect, it } from 'vitest';
import { lastSeenText, loginMethodText } from './sessionInfo.js';

// 15:00 en Argentina (UTC-3).
const NOW = Date.parse('2026-10-20T18:00:00Z');
const HOUR = 60 * 60 * 1000;

describe('lastSeenText', () => {
	it('hoy, ayer o el día, en hora de Argentina', () => {
		expect(lastSeenText(NOW - 2 * HOUR, NOW)).toBe('hoy');
		// 00:30 de Argentina del mismo día (03:30 UTC).
		expect(lastSeenText(Date.parse('2026-10-20T03:30:00Z'), NOW)).toBe('hoy');
		// 23:30 de Argentina del día anterior (02:30 UTC del 20).
		expect(lastSeenText(Date.parse('2026-10-20T02:30:00Z'), NOW)).toBe('ayer');
		expect(lastSeenText(NOW - 5 * 24 * HOUR, NOW)).toBe('el 15 de octubre');
		expect(lastSeenText(Date.parse('2025-12-30T15:00:00Z'), NOW)).toBe(
			'el 30 de diciembre de 2025'
		);
	});
});

describe('loginMethodText', () => {
	it('código, contraseña o passkey', () => {
		expect(loginMethodText('code')).toBe('un código por mail');
		expect(loginMethodText('password')).toBe('tu contraseña');
		expect(loginMethodText('passkey')).toBe('una passkey');
	});
});
