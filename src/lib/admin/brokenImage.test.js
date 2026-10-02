/**
 * `brokenImage`: el avatar que no carga muestra la inicial, también si falló antes de que la
 * página se hidratara (Ajustes › Admins).
 */
import { describe, expect, it, vi } from 'vitest';
import { brokenImage } from './brokenImage.js';

/** Una imagen de mentira: lo justo que mira la acción. */
function fakeImage({ complete = false, naturalWidth = 0 } = {}) {
	/** @type {Map<string, () => void>} */
	const listeners = new Map();
	return {
		complete,
		naturalWidth,
		/** @param {string} type @param {() => void} fn */
		addEventListener: (type, fn) => listeners.set(type, fn),
		/** @param {string} type */
		removeEventListener: (type) => listeners.delete(type),
		/** @param {string} type */
		fire: (type) => listeners.get(type)?.(),
		listeners
	};
}

describe('brokenImage', () => {
	it('si ya falló (cargada del servidor, ancho 0), avisa enseguida', () => {
		const img = fakeImage({ complete: true, naturalWidth: 0 });
		const onBroken = vi.fn();
		brokenImage(/** @type {any} */ (img), onBroken);
		expect(onBroken).toHaveBeenCalledTimes(1);
	});

	it('si cargó bien no avisa; si falla después, sí', () => {
		const img = fakeImage({ complete: true, naturalWidth: 96 });
		const onBroken = vi.fn();
		brokenImage(/** @type {any} */ (img), onBroken);
		expect(onBroken).not.toHaveBeenCalled();
		img.fire('error');
		expect(onBroken).toHaveBeenCalledTimes(1);
	});

	it('todavía cargando: espera el error; al destruirse deja de escuchar', () => {
		const img = fakeImage({ complete: false });
		const onBroken = vi.fn();
		const action = brokenImage(/** @type {any} */ (img), onBroken);
		expect(onBroken).not.toHaveBeenCalled();
		const next = vi.fn();
		action.update(next);
		img.fire('error');
		expect(next).toHaveBeenCalledTimes(1);
		expect(onBroken).not.toHaveBeenCalled();
		action.destroy();
		expect(img.listeners.size).toBe(0);
	});
});
