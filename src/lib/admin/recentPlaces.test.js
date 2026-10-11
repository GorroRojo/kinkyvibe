import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	RECENT_KEPT,
	RECENT_SHOWN,
	addRecent,
	parseRecent,
	readRecent,
	recentKey,
	recentLabel,
	saveRecent,
	shouldRemember,
	visibleRecent
} from './recentPlaces.js';

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
		label: `Ev ${i}`
	}));

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('recentPlaces', () => {
	it('muestra hasta 7 y guarda una más (la actual no se muestra)', () => {
		expect(RECENT_SHOWN).toBe(7);
		expect(RECENT_KEPT).toBe(8);
	});

	it('una clave por login, limpia (como el panel lateral)', () => {
		expect(recentKey('Gorro-Rojo')).toBe('kv-panel-recientes:Gorro-Rojo');
		expect(recentKey('a"b</script>')).toBe('kv-panel-recientes:abscript');
		expect(recentKey(null)).toBe('kv-panel-recientes');
	});

	it('suma arriba, sube la que ya estaba y no pasa del máximo', () => {
		let list = places(RECENT_KEPT);
		list = addRecent(list, { href: '/admin/ventas/codigos', label: 'Códigos' });
		expect(list).toHaveLength(RECENT_KEPT);
		expect(list[0].href).toBe('/admin/ventas/codigos');
		list = addRecent(list, { href: '/admin/eventos/ev-3/ordenes', label: 'Ev 3 nuevo' });
		expect(list[0]).toEqual({ href: '/admin/eventos/ev-3/ordenes', label: 'Ev 3 nuevo' });
		expect(list.filter((r) => r.href === '/admin/eventos/ev-3/ordenes')).toHaveLength(1);
	});

	it('lo que se muestra: sin la página actual ni las secciones de la barra, hasta 7', () => {
		const list = [{ href: '/admin/ventas', label: 'Ventas' }, ...places(RECENT_KEPT)];
		const shown = visibleRecent(list, '/admin/eventos/ev-0/ordenes/');
		expect(shown).toHaveLength(RECENT_SHOWN);
		expect(shown.map((r) => r.href)).not.toContain('/admin/ventas');
		expect(shown.map((r) => r.href)).not.toContain('/admin/eventos/ev-0/ordenes');
	});

	it('no guarda Inicio, las secciones de la barra, errores ni lo que no es del panel', () => {
		expect(shouldRemember('/admin')).toBe(false);
		expect(shouldRemember('/admin/')).toBe(false);
		expect(shouldRemember('/admin/checkin')).toBe(false);
		expect(shouldRemember('/admin/ventas')).toBe(false);
		expect(shouldRemember('/admin/ajustes/cobros')).toBe(false);
		expect(shouldRemember('/admin/no-existe', { status: 404 })).toBe(false);
		expect(shouldRemember('/calendario/algo')).toBe(false);
		expect(shouldRemember('/administrar')).toBe(false);
		expect(shouldRemember('/admin/ventas/transferencias')).toBe(true);
		expect(shouldRemember('/admin/eventos/fiesta/ordenes')).toBe(true);
		expect(shouldRemember('/admin/eventos/nuevo')).toBe(true);
	});

	it('el nombre: evento y pestaña, sección del menú, o sección y título', () => {
		expect(
			recentLabel({ pathname: '/admin/eventos/fiesta/ordenes', heading: 'Fiesta de prueba' })
		).toBe('Fiesta de prueba · Órdenes');
		expect(
			recentLabel({ pathname: '/admin/eventos/fiesta', heading: ' Fiesta\n de prueba ' })
		).toBe('Fiesta de prueba');
		expect(recentLabel({ pathname: '/admin/eventos/fiesta/ingreso', heading: '' })).toBe(
			'fiesta · Puerta'
		);
		expect(recentLabel({ pathname: '/admin/ventas/transferencias', heading: 'Otra cosa' })).toBe(
			'Transferencias'
		);
		expect(recentLabel({ pathname: '/admin/eventos/agenda' })).toBe('Agenda');
		expect(
			recentLabel({ pathname: '/admin/comunidad/personas/123', heading: 'Persona de prueba' })
		).toBe('Personas · Persona de prueba');
		expect(recentLabel({ pathname: '/admin/eventos/series/9', heading: 'Serie de prueba' })).toBe(
			'Series · Serie de prueba'
		);
		expect(recentLabel({ pathname: '/admin/otra' })).toBe('Panel');
		expect(recentLabel({ pathname: '/admin/eventos/%E0%A4%A' })).toBe('%E0%A4%A');
		expect(
			recentLabel({ pathname: '/admin/comunidad/personas/1', heading: 'x'.repeat(200) }).length
		).toBeLessThanOrEqual(80);
	});

	it('lee y guarda por login; descarta basura, repetidas y lo que no es del panel', () => {
		const storage = memoryStorage();
		vi.stubGlobal('localStorage', storage);
		saveRecent('ana', places(3));
		expect(readRecent('ana')).toEqual(places(3));
		expect(readRecent('bruno')).toEqual([]);
		storage.setItem(
			recentKey('ana'),
			JSON.stringify([
				{ href: 'https://otro.sitio/admin', label: 'x' },
				{ href: '//otro.sitio', label: 'x' },
				{ href: '/admin/ventas/codigos', label: '' },
				{ href: '/admin/ventas/codigos', label: 'Códigos' },
				{ href: '/admin/ventas/codigos', label: 'Repetida' },
				'basura',
				null
			])
		);
		expect(readRecent('ana')).toEqual([{ href: '/admin/ventas/codigos', label: 'Códigos' }]);
		expect(parseRecent('{no es json')).toEqual([]);
		expect(parseRecent('{"a":1}')).toEqual([]);
		expect(parseRecent(JSON.stringify(places(20)))).toHaveLength(RECENT_KEPT);
	});

	it('sin storage (ventana privada, bloqueado) no rompe nada', () => {
		vi.stubGlobal('localStorage', {
			getItem: () => {
				throw new Error('bloqueado');
			},
			setItem: () => {
				throw new Error('bloqueado');
			}
		});
		expect(readRecent('ana')).toEqual([]);
		expect(() => saveRecent('ana', places(2))).not.toThrow();
	});
});
