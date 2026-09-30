import { describe, expect, it } from 'vitest';
import { DRAFT_MAX_AGE_MS, clearDraft, draftAge, draftKey, loadDraft, saveDraft } from './draft.js';

/** Storage en memoria, como localStorage. */
function memoryStorage() {
	/** @type {Map<string, string>} */
	const m = new Map();
	return /** @type {Storage} */ (
		/** @type {unknown} */ ({
			getItem: (/** @type {string} */ k) => m.get(k) ?? null,
			setItem: (/** @type {string} */ k, /** @type {string} */ v) => void m.set(k, String(v)),
			removeItem: (/** @type {string} */ k) => void m.delete(k),
			get size() {
				return m.size;
			}
		})
	);
}

/** Storage que tira error en todo (ventana privada, storage bloqueado). */
const brokenStorage = /** @type {Storage} */ (
	/** @type {unknown} */ ({
		getItem() {
			throw new Error('bloqueado');
		},
		setItem() {
			throw new Error('bloqueado');
		},
		removeItem() {
			throw new Error('bloqueado');
		}
	})
);

describe('draftKey', () => {
	it('separa por tipo de objeto e id', () => {
		expect(draftKey('evento', 'fiesta-de-prueba')).toBe('kv-draft:evento:fiesta-de-prueba');
		expect(draftKey('material', 'x')).not.toBe(draftKey('amigues', 'x'));
	});
});

describe('saveDraft / loadDraft', () => {
	it('guarda y recupera lo que hizo la persona', () => {
		const s = memoryStorage();
		const key = draftKey('evento', 'fiesta-de-prueba');
		expect(saveDraft(s, key, { title: 'Nuevo título' }, { base: 'abc', now: 1000 })).toBe(true);
		expect(loadDraft(s, key, { base: 'abc', now: 2000 })).toEqual({
			data: { title: 'Nuevo título' },
			savedAt: 1000,
			stale: false
		});
	});

	it('sin borrador devuelve null', () => {
		expect(loadDraft(memoryStorage(), 'kv-draft:evento:nada')).toBeNull();
	});

	it('marca como viejo el borrador si el archivo cambió desde entonces', () => {
		const s = memoryStorage();
		saveDraft(s, 'k', { a: 1 }, { base: 'sha-viejo', now: 0 });
		expect(loadDraft(s, 'k', { base: 'sha-nuevo', now: 1 })?.stale).toBe(true);
		// Sin versión para comparar no se puede saber: no se marca.
		expect(loadDraft(s, 'k', { base: '', now: 1 })?.stale).toBe(false);
	});

	it('descarta borradores muy viejos o rotos', () => {
		const s = memoryStorage();
		saveDraft(s, 'k', { a: 1 }, { now: 0 });
		expect(loadDraft(s, 'k', { now: DRAFT_MAX_AGE_MS + 1 })).toBeNull();
		expect(s.getItem('k')).toBeNull();

		s.setItem('k', '{no es json');
		expect(loadDraft(s, 'k')).toBeNull();
		expect(s.getItem('k')).toBeNull();

		s.setItem('k', JSON.stringify({ v: 99, savedAt: 0, data: {} }));
		expect(loadDraft(s, 'k', { now: 1 })).toBeNull();
	});

	it('clearDraft borra el borrador', () => {
		const s = memoryStorage();
		saveDraft(s, 'k', { a: 1 });
		clearDraft(s, 'k');
		expect(loadDraft(s, 'k')).toBeNull();
	});

	it('sin storage o con el storage bloqueado no rompe', () => {
		expect(saveDraft(undefined, 'k', {})).toBe(false);
		expect(saveDraft(brokenStorage, 'k', {})).toBe(false);
		expect(loadDraft(brokenStorage, 'k')).toBeNull();
		expect(() => clearDraft(brokenStorage, 'k')).not.toThrow();
		expect(loadDraft(null, 'k')).toBeNull();
	});
});

describe('draftAge', () => {
	const min = 60_000;
	it('dice hace cuánto se guardó', () => {
		expect(draftAge(0, 20_000)).toBe('hace un momento');
		expect(draftAge(0, min)).toBe('hace 1 minuto');
		expect(draftAge(0, 5 * min)).toBe('hace 5 minutos');
		expect(draftAge(0, 60 * min)).toBe('hace 1 hora');
		expect(draftAge(0, 3 * 60 * min)).toBe('hace 3 horas');
		expect(draftAge(0, 24 * 60 * min)).toBe('hace 1 día');
		expect(draftAge(0, 3 * 24 * 60 * min)).toBe('hace 3 días');
	});
	it('un reloj adelantado no da tiempos negativos', () => {
		expect(draftAge(10 * min, 0)).toBe('hace un momento');
	});
});
