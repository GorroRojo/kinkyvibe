import { describe, expect, it } from 'vitest';
import { get } from 'svelte/store';
import {
	HINTS_MEDIA,
	SHORTCUT_TIP_KEY,
	SHORTCUT_TIP_VERSION,
	dismissTip,
	goPending,
	hintsDevice,
	isMac,
	tipDismissed
} from './shortcutHints.js';

/** Un localStorage de mentira. */
function memoryStorage(initial = /** @type {Record<string, string>} */ ({})) {
	const data = { ...initial };
	return {
		data,
		/** @param {string} k */
		getItem: (k) => (k in data ? data[k] : null),
		/** @param {string} k @param {string} v */
		setItem: (k, v) => {
			data[k] = String(v);
		}
	};
}

const throwing = {
	getItem() {
		throw new Error('bloqueado');
	},
	setItem() {
		throw new Error('lleno');
	}
};

describe('aviso de atajos', () => {
	it('se muestra la primera vez y, cerrado, no vuelve', () => {
		const storage = memoryStorage();
		expect(tipDismissed(storage)).toBe(false);
		dismissTip(storage);
		expect(storage.data[SHORTCUT_TIP_KEY]).toBe(String(SHORTCUT_TIP_VERSION));
		expect(tipDismissed(storage)).toBe(true);
	});
	it('si se cerró en una versión vieja de los atajos, vuelve a aparecer', () => {
		const storage = memoryStorage({ [SHORTCUT_TIP_KEY]: String(SHORTCUT_TIP_VERSION - 1) });
		expect(tipDismissed(storage)).toBe(false);
	});
	it('un valor raro cuenta como no cerrado', () => {
		expect(tipDismissed(memoryStorage({ [SHORTCUT_TIP_KEY]: 'sí' }))).toBe(false);
	});
	it('sin storage (o bloqueado) no se muestra y cerrarlo no rompe', () => {
		expect(tipDismissed(null)).toBe(true);
		expect(tipDismissed(throwing)).toBe(true);
		expect(() => dismissTip(throwing)).not.toThrow();
		expect(() => dismissTip(null)).not.toThrow();
	});
});

describe('dispositivo con pistas', () => {
	it('pide mouse, hover y pantalla ancha', () => {
		expect(HINTS_MEDIA).toBe('(hover: hover) and (pointer: fine) and (min-width: 1100px)');
	});
	it('usa matchMedia con esa consulta; sin matchMedia, no', () => {
		/** @type {string[]} */
		const asked = [];
		const match = (/** @type {string} */ q) => {
			asked.push(q);
			return { matches: true };
		};
		expect(hintsDevice(match)).toBe(true);
		expect(asked).toEqual([HINTS_MEDIA]);
		expect(hintsDevice(() => ({ matches: false }))).toBe(false);
		expect(
			hintsDevice(() => {
				throw new Error('x');
			})
		).toBe(false);
	});
	it('Mac muestra ⌘', () => {
		expect(isMac({ platform: 'MacIntel' })).toBe(true);
		expect(isMac({ platform: 'Win32' })).toBe(false);
		expect(isMac({ platform: '', userAgent: 'Mozilla/5.0 (X11; Linux x86_64)' })).toBe(false);
	});
	it('goPending arranca apagado', () => {
		expect(get(goPending)).toBe(false);
	});
});
