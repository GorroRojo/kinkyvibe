import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	HIDE_SOON_KEY,
	OPEN_AREA_KEY,
	OPEN_GROUPS_KEY,
	allGroupsOpen,
	normalizeGroups,
	parseArea,
	parseGroups,
	pickOpenGroups,
	readHideSoon,
	readOpenGroups,
	saveHideSoon,
	saveOpenGroups,
	toggleAllGroups,
	toggleGroup
} from './navPrefs.js';
import { NAV_GROUPS } from './nav.js';

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
	it('recuerda varios grupos abiertos y "Ocultar lo que viene"', () => {
		const s = memoryStorage();
		vi.stubGlobal('localStorage', s);
		expect(readOpenGroups()).toBe(null);
		expect(readHideSoon()).toBe(false);
		saveOpenGroups(['ventas', 'eventos', 'ajustes']);
		saveHideSoon(true);
		// En el orden del menú, no en el que se abrieron.
		expect(JSON.parse(s.m.get(OPEN_GROUPS_KEY) ?? '')).toEqual(['eventos', 'ventas', 'ajustes']);
		expect(readOpenGroups()).toEqual(['eventos', 'ventas', 'ajustes']);
		expect(readHideSoon()).toBe(true);
		saveHideSoon(false);
		expect(s.m.has(HIDE_SOON_KEY)).toBe(false);
	});

	it('todos cerrados también se recuerda (no es lo mismo que nunca haber tocado el menú)', () => {
		const s = memoryStorage();
		vi.stubGlobal('localStorage', s);
		saveOpenGroups([]);
		expect(s.m.get(OPEN_GROUPS_KEY)).toBe('[]');
		expect(readOpenGroups()).toEqual([]);
	});

	it('ignora grupos que no existen, repetidos y basura', () => {
		const s = memoryStorage();
		vi.stubGlobal('localStorage', s);
		s.setItem(OPEN_GROUPS_KEY, JSON.stringify(['inventado', 'ventas', 'ventas', 3, null]));
		expect(readOpenGroups()).toEqual(['ventas']);
		saveOpenGroups(['inventado']);
		expect(s.m.get(OPEN_GROUPS_KEY)).toBe('[]');
		expect(parseGroups('no es json')).toBe(null);
		expect(parseGroups('{"ventas":true}')).toBe(null);
		expect(parseGroups(null)).toBe(null);
		// Mensajes es un área pero no un grupo del menú (va dentro de Comunidad).
		expect(normalizeGroups(['mensajes', 'comunidad'])).toEqual(['comunidad']);
		expect(parseArea('ajustes')).toBe('ajustes');
		expect(parseArea(null)).toBe(null);
	});

	it('con solo la clave vieja (un área abierta), abre su grupo; al guardar la borra', () => {
		const s = memoryStorage();
		vi.stubGlobal('localStorage', s);
		s.setItem(OPEN_AREA_KEY, 'mensajes');
		expect(readOpenGroups()).toEqual(['comunidad']);
		s.setItem(OPEN_AREA_KEY, 'inventada');
		expect(readOpenGroups()).toBe(null);
		saveOpenGroups(['ventas']);
		expect(s.m.has(OPEN_AREA_KEY)).toBe(false);
		expect(readOpenGroups()).toEqual(['ventas']);
	});

	it('sin storage (ventana privada, bloqueado) no rompe nada', () => {
		const boom = () => {
			throw new Error('bloqueado');
		};
		vi.stubGlobal('localStorage', { getItem: boom, setItem: boom, removeItem: boom });
		expect(readOpenGroups()).toBe(null);
		expect(readHideSoon()).toBe(false);
		expect(() => saveOpenGroups(['ventas'])).not.toThrow();
		expect(() => saveHideSoon(true)).not.toThrow();
	});

	it('al cargar: lo guardado más el grupo de la página actual, aunque lo hayan cerrado', () => {
		expect(pickOpenGroups('ventas', ['ajustes', 'eventos'])).toEqual([
			'eventos',
			'ventas',
			'ajustes'
		]);
		expect(pickOpenGroups('ventas', [])).toEqual(['ventas']);
		expect(pickOpenGroups('ventas', ['ventas'])).toEqual(['ventas']);
	});

	it('por defecto (nada guardado): solo el grupo de la página actual; en Inicio, ninguno', () => {
		expect(pickOpenGroups('comunidad', null)).toEqual(['comunidad']);
		expect(pickOpenGroups(null, null)).toEqual([]);
		expect(pickOpenGroups(undefined, ['estadisticas'])).toEqual(['estadisticas']);
		expect(pickOpenGroups('inventado', null)).toEqual([]);
	});

	it('abrir o cerrar un grupo no toca los demás', () => {
		let open = ['eventos'];
		open = toggleGroup(open, 'ajustes');
		expect(open).toEqual(['eventos', 'ajustes']);
		open = toggleGroup(open, 'ventas');
		expect(open).toEqual(['eventos', 'ventas', 'ajustes']);
		open = toggleGroup(open, 'eventos');
		expect(open).toEqual(['ventas', 'ajustes']);
	});

	it('«Abrir todo / Cerrar todo»: abre todos si falta alguno; si están todos, cierra todo', () => {
		const all = NAV_GROUPS.map((g) => g.id);
		expect(allGroupsOpen([], all)).toBe(false);
		expect(allGroupsOpen(['eventos'], all)).toBe(false);
		expect(toggleAllGroups(['eventos'], all)).toEqual(all);
		expect(toggleAllGroups([], all)).toEqual(all);
		expect(allGroupsOpen(all, all)).toBe(true);
		expect(toggleAllGroups(all, all)).toEqual([]);
		// Solo cuentan los grupos que se ven (con "Ocultar lo que viene" puede faltar alguno).
		expect(allGroupsOpen(['eventos', 'ventas'], ['eventos', 'ventas'])).toBe(true);
		expect(allGroupsOpen([], [])).toBe(false);
	});
});
