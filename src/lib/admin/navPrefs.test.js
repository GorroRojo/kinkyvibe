import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	HIDE_SOON_KEY,
	OPEN_AREA_KEY,
	parseArea,
	pickOpenArea,
	readHideSoon,
	readOpenArea,
	saveHideSoon,
	saveOpenArea
} from './navPrefs.js';

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
	it('recuerda el área abierta y "Ocultar lo que viene"', () => {
		const s = memoryStorage();
		vi.stubGlobal('localStorage', s);
		expect(readOpenArea()).toBe(null);
		expect(readHideSoon()).toBe(false);
		saveOpenArea('ventas');
		saveHideSoon(true);
		expect(s.m.get(OPEN_AREA_KEY)).toBe('ventas');
		expect(readOpenArea()).toBe('ventas');
		expect(readHideSoon()).toBe(true);
		saveOpenArea(null);
		saveHideSoon(false);
		expect(s.m.has(OPEN_AREA_KEY)).toBe(false);
		expect(s.m.has(HIDE_SOON_KEY)).toBe(false);
	});

	it('ignora áreas que no existen', () => {
		const s = memoryStorage();
		vi.stubGlobal('localStorage', s);
		s.setItem(OPEN_AREA_KEY, 'inventada');
		expect(readOpenArea()).toBe(null);
		saveOpenArea('inventada');
		expect(s.m.has(OPEN_AREA_KEY)).toBe(false);
		expect(parseArea('ajustes')).toBe('ajustes');
		expect(parseArea(null)).toBe(null);
	});

	it('sin storage (ventana privada, bloqueado) no rompe nada', () => {
		const boom = () => {
			throw new Error('bloqueado');
		};
		vi.stubGlobal('localStorage', { getItem: boom, setItem: boom, removeItem: boom });
		expect(readOpenArea()).toBe(null);
		expect(readHideSoon()).toBe(false);
		expect(() => saveOpenArea('ventas')).not.toThrow();
		expect(() => saveHideSoon(true)).not.toThrow();
	});

	it('se abre el área de la página actual; en Inicio, la última que se abrió', () => {
		expect(pickOpenArea('ventas', 'ajustes')).toBe('ventas');
		expect(pickOpenArea(null, 'ajustes')).toBe('ajustes');
		expect(pickOpenArea(undefined, 'inventada')).toBe(null);
		expect(pickOpenArea(null, null)).toBe(null);
	});
});
