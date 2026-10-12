import { afterEach, describe, expect, it, vi } from 'vitest';
import { HIDE_SOON_KEY, readHideSoon, saveHideSoon } from './navPrefs.js';

/** localStorage de mentira (en Node no hay). */
function memoryStorage() {
	/** @type {Map<string, string>} */
	const m = new Map();
	return {
		getItem: (/** @type {string} */ k) => m.get(k) ?? null,
		setItem: (/** @type {string} */ k, /** @type {string} */ v) => void m.set(k, String(v)),
		removeItem: (/** @type {string} */ k) => void m.delete(k),
		m
	};
}

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('navPrefs', () => {
	it('recuerda "Ocultar lo que viene"', () => {
		const s = memoryStorage();
		vi.stubGlobal('localStorage', s);
		expect(readHideSoon()).toBe(false);
		saveHideSoon(true);
		expect(s.m.get(HIDE_SOON_KEY)).toBe('1');
		expect(readHideSoon()).toBe(true);
		saveHideSoon(false);
		expect(s.m.has(HIDE_SOON_KEY)).toBe(false);
	});

	it('sin storage (ventana privada, bloqueado) no rompe nada', () => {
		const boom = () => {
			throw new Error('bloqueado');
		};
		vi.stubGlobal('localStorage', { getItem: boom, setItem: boom, removeItem: boom });
		expect(readHideSoon()).toBe(false);
		expect(() => saveHideSoon(true)).not.toThrow();
	});
});
