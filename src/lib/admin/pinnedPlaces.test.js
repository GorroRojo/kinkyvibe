import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	PIN_MAX,
	addPin,
	canPin,
	isPinned,
	movePin,
	parsePinned,
	pinKey,
	readPinned,
	removePin,
	savePinned
} from './pinnedPlaces.js';
import { NAV } from './nav.js';

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

/** @param {number} n */
const places = (n) =>
	Array.from({ length: n }, (_, i) => ({
		href: `/admin/eventos/ev-${i}/ordenes`,
		label: `Órdenes ${i}`,
		context: `Evento ${i}`
	}));

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('pinnedPlaces (Fijados)', () => {
	it('una clave por login, como Recientes', () => {
		expect(pinKey('Ana')).not.toBe(pinKey('bruno'));
		expect(pinKey('ana')).toMatch(/^kv-panel-fijados/);
	});

	it('solo se fijan páginas del panel que existen: ni «Próximamente» ni las de la barra', () => {
		expect(canPin('/admin/ventas/transferencias')).toBe(true);
		expect(canPin('/admin/eventos/fiesta/ordenes')).toBe(true);
		expect(canPin('/admin/comunidad/personas/12?tab=notas')).toBe(true);
		expect(canPin('/admin/checkin')).toBe(true);
		for (const soon of NAV.filter((i) => i.soon)) expect(canPin(soon.href), soon.id).toBe(false);
		expect(canPin('/admin')).toBe(false);
		expect(canPin('/admin/ventas')).toBe(false);
		expect(canPin('/admin/ajustes/cobros')).toBe(false);
		expect(canPin('/calendario/algo')).toBe(false);
		expect(canPin('//otro.sitio/admin')).toBe(false);
		expect(canPin('https://otro.sitio/admin')).toBe(false);
		expect(canPin('/administrar')).toBe(false);
		expect(canPin(null)).toBe(false);
	});

	it('fijar suma al final, sin repetir, hasta 7; soltar saca', () => {
		let list = addPin([], places(1)[0]);
		expect(list).toEqual(places(1));
		expect(addPin(list, places(1)[0])).toBe(list);
		expect(isPinned(list, places(1)[0].href)).toBe(true);
		list = places(PIN_MAX);
		expect(addPin(list, { href: '/admin/ventas/codigos', label: 'Códigos' })).toBe(list);
		expect(addPin([], { href: '/admin/ventas/tienda', label: 'Tienda' })).toEqual([]);
		expect(removePin(places(3), places(3)[1].href)).toEqual([places(3)[0], places(3)[2]]);
	});

	it('mover: arrastrar o Subir/Bajar; fuera de rango, igual', () => {
		const [a, b, c] = places(3);
		expect(movePin([a, b, c], 0, 2)).toEqual([b, c, a]);
		expect(movePin([a, b, c], 2, 1)).toEqual([a, c, b]);
		const same = [a, b, c];
		expect(movePin(same, 0, -1)).toBe(same);
		expect(movePin(same, 2, 3)).toBe(same);
		expect(movePin(same, 1, 1)).toBe(same);
	});

	it('lee y guarda por login; descarta basura, lo que no se puede fijar y lo que sobra', () => {
		const storage = memoryStorage();
		vi.stubGlobal('localStorage', storage);
		savePinned('ana', places(2));
		expect(readPinned('ana')).toEqual(places(2));
		expect(readPinned('bruno')).toEqual([]);
		storage.setItem(
			pinKey('ana'),
			JSON.stringify([
				{ href: '/admin/ventas/tienda', label: 'Tienda (próximamente)' },
				{ href: '/admin/ventas', label: 'Ventas (está en la barra)' },
				{ href: '/admin/ventas/codigos', label: 'Códigos' },
				'basura'
			])
		);
		expect(readPinned('ana')).toEqual([{ href: '/admin/ventas/codigos', label: 'Códigos' }]);
		expect(parsePinned(JSON.stringify(places(20)))).toHaveLength(PIN_MAX);
	});

	it('sin storage no rompe nada', () => {
		vi.stubGlobal('localStorage', {
			getItem: () => {
				throw new Error('bloqueado');
			},
			setItem: () => {
				throw new Error('bloqueado');
			}
		});
		expect(readPinned('ana')).toEqual([]);
		expect(() => savePinned('ana', places(1))).not.toThrow();
	});
});
