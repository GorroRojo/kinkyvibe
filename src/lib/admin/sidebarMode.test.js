import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	DEFAULT_SIDEBAR_MODE,
	SIDEBAR_MODES,
	SIDEBAR_MODE_LABELS,
	parseSidebarMode,
	readSidebarMode,
	saveSidebarMode,
	SIDEBAR_SCRIPT_BODY,
	sidebarHeadScript,
	sidebarKey
} from './sidebarMode.js';

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

/** Un <html> de mentira con lo justo para `data-lateral`. */
function fakeDocument() {
	/** @type {Map<string, string>} */
	const attrs = new Map();
	return {
		documentElement: {
			setAttribute: (/** @type {string} */ k, /** @type {string} */ v) => void attrs.set(k, v),
			removeAttribute: (/** @type {string} */ k) => void attrs.delete(k)
		},
		attrs
	};
}

const throwing = () => {
	throw new Error('storage bloqueado');
};

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('panel lateral: preferencia de cada admin', () => {
	it('sin nada guardado es «Siempre abierto»', () => {
		expect(DEFAULT_SIDEBAR_MODE).toBe('abierto');
		expect(parseSidebarMode(null)).toBe('abierto');
		expect(parseSidebarMode(undefined)).toBe('abierto');
	});

	it('lo que no es un modo vale el de siempre', () => {
		for (const bad of ['', 'cerrado', 'ICONOS', ' iconos', '{"a":1}', 1, {}, ['iconos']]) {
			expect(parseSidebarMode(bad)).toBe('abierto');
		}
	});

	it('entiende los tres modos, con su nombre en castellano', () => {
		expect(SIDEBAR_MODES).toEqual(['abierto', 'iconos', 'oculto']);
		for (const mode of SIDEBAR_MODES) expect(parseSidebarMode(mode)).toBe(mode);
		expect(SIDEBAR_MODE_LABELS).toEqual({
			abierto: 'Siempre abierto',
			iconos: 'Solo íconos',
			oculto: 'Se oculta'
		});
	});

	it('cada login tiene su clave (y lo raro del login se descarta)', () => {
		expect(sidebarKey('gorrite')).toBe('kv-panel-lateral:gorrite');
		expect(sidebarKey('Otra-Persona')).toBe('kv-panel-lateral:Otra-Persona');
		expect(sidebarKey('a"b</script>')).toBe('kv-panel-lateral:abscript');
		expect(sidebarKey('')).toBe('kv-panel-lateral');
		expect(sidebarKey(null)).toBe('kv-panel-lateral');
	});

	it('guarda y lee la elección de cada admin por separado, y la aplica en <html>', () => {
		const s = memoryStorage();
		const doc = fakeDocument();
		vi.stubGlobal('localStorage', s);
		vi.stubGlobal('document', doc);
		expect(readSidebarMode('ana')).toBe('abierto');
		saveSidebarMode('ana', 'iconos');
		expect(readSidebarMode('ana')).toBe('iconos');
		expect(readSidebarMode('beto')).toBe('abierto');
		expect(doc.attrs.get('data-lateral')).toBe('iconos');
		saveSidebarMode('beto', 'oculto');
		expect(readSidebarMode('beto')).toBe('oculto');
		expect(readSidebarMode('ana')).toBe('iconos');
		// Volver a la de siempre borra la clave y el atributo.
		saveSidebarMode('ana', 'abierto');
		expect(s.m.has('kv-panel-lateral:ana')).toBe(false);
		expect(doc.attrs.has('data-lateral')).toBe(false);
	});

	it('un valor guardado inválido vale el de siempre', () => {
		const s = memoryStorage();
		s.setItem('kv-panel-lateral:ana', 'flotante');
		vi.stubGlobal('localStorage', s);
		expect(readSidebarMode('ana')).toBe('abierto');
	});

	it('sin storage (o si falla) vale el de siempre y guardar no rompe', () => {
		const doc = fakeDocument();
		vi.stubGlobal('document', doc);
		vi.stubGlobal('localStorage', { getItem: throwing, setItem: throwing, removeItem: throwing });
		expect(readSidebarMode('ana')).toBe('abierto');
		expect(() => saveSidebarMode('ana', 'oculto')).not.toThrow();
		// Igual se aplica hasta recargar.
		expect(doc.attrs.get('data-lateral')).toBe('oculto');
		vi.stubGlobal('localStorage', undefined);
		expect(readSidebarMode('ana')).toBe('abierto');
	});

	it('el script del head lee la clave del login y solo marca los modos que cambian algo', () => {
		const script = sidebarHeadScript('ana');
		// La clave va en un atributo; el cuerpo es fijo (la CSP lo permite por su hash).
		expect(script).toContain('data-k="kv-panel-lateral:ana"');
		expect(script).toContain(`>${SIDEBAR_SCRIPT_BODY}</script>`);
		expect(script).toContain('localStorage.getItem(document.currentScript.dataset.k)');
		expect(script).toContain("m==='iconos'||m==='oculto'");
		expect(script).not.toContain("'abierto'");
		expect(script).toContain('catch(e){}');
		// El login no puede cerrar el <script>.
		expect(sidebarHeadScript('x</script><script>alert(1)')).not.toMatch(/<\/script><script>/);
	});
});
