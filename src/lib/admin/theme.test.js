import { describe, expect, it } from 'vitest';
import { DEFAULT_THEME, THEME_HEAD_SCRIPT, nextTheme, parseTheme } from './theme.js';

describe('tema del panel', () => {
	it('sin elección guardada es claro', () => {
		expect(DEFAULT_THEME).toBe('light');
		expect(parseTheme(null)).toBe('light');
		expect(parseTheme('cualquier cosa')).toBe('light');
	});

	it('respeta la elección guardada', () => {
		expect(parseTheme('dark')).toBe('dark');
		expect(parseTheme('light')).toBe('light');
		expect(parseTheme('auto')).toBe('auto');
	});

	it('el botón pasa por los tres temas empezando por el claro', () => {
		expect(nextTheme('light')).toBe('dark');
		expect(nextTheme('dark')).toBe('auto');
		expect(nextTheme('auto')).toBe('light');
	});

	it('el script del head solo marca oscuro o automático (claro es el de base)', () => {
		expect(THEME_HEAD_SCRIPT).toContain("t==='dark'||t==='auto'");
		expect(THEME_HEAD_SCRIPT).not.toContain("t==='light'");
	});
});
