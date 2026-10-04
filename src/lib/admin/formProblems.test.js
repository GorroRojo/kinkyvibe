import { afterEach, describe, expect, it } from 'vitest';
import { markInvalid, problemFields, scheduleField } from './formProblems.js';

describe('scheduleField', () => {
	it('cada texto de horario va a su campo', () => {
		expect(scheduleField('Falta la fecha de inicio.')).toBe('ev-start-date');
		expect(scheduleField('Falta la hora de inicio.')).toBe('ev-start-time');
		expect(scheduleField('Falta la fecha de fin.')).toBe('ev-end-date');
		expect(scheduleField('Falta la hora de fin.')).toBe('ev-end-time');
		expect(scheduleField('Falta la hora de fin.', 'edit')).toBe('edit-end-time');
	});
});

describe('problemFields', () => {
	it('sin repetir y en orden', () => {
		expect(
			problemFields([
				{ text: 'a', field: 'ev-title' },
				{ text: 'b', field: 'ev-tags' },
				{ text: 'c', field: 'ev-title' }
			])
		).toEqual(['ev-title', 'ev-tags']);
	});
});

describe('markInvalid', () => {
	/** Un document mínimo (las pruebas corren sin navegador). */
	function fakeDocument() {
		/** @type {Record<string, Map<string, string>>} */
		const attrs = { a: new Map(), b: new Map() };
		const el = (/** @type {string} */ id) =>
			attrs[id] && {
				setAttribute: (/** @type {string} */ k, /** @type {string} */ v) => attrs[id].set(k, v),
				removeAttribute: (/** @type {string} */ k) => attrs[id].delete(k)
			};
		return { attrs, document: { getElementById: el } };
	}
	afterEach(() => {
		markInvalid([]);
		// @ts-ignore
		delete globalThis.document;
	});
	it('marca los campos con problema y desmarca los que se arreglaron', () => {
		const { attrs, document } = fakeDocument();
		// @ts-ignore
		globalThis.document = document;
		markInvalid(['a', 'b']);
		expect(attrs.a.get('aria-invalid')).toBe('true');
		markInvalid(['b']);
		expect(attrs.a.has('aria-invalid')).toBe(false);
		expect(attrs.b.get('aria-invalid')).toBe('true');
	});
});
