import { afterEach, describe, expect, it } from 'vitest';
import { focusField, markInvalid, problemFields, scheduleField } from './formProblems.js';

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

describe('focusField', () => {
	/*
	 * Un DOM mínimo (las pruebas corren sin navegador): un input dentro de un <details> cerrado
	 * dentro de un fieldset. Lo justo para lo que usa focusField.
	 */
	class FakeElement {
		/** @param {string} tag @param {FakeElement | null} parent */
		constructor(tag, parent = null) {
			this.tag = tag;
			this.parentElement = parent;
			/** @type {Map<string, string>} */
			this.attrs = new Map();
			/** @type {FakeElement[]} */
			this.children = [];
			parent?.children.push(this);
			this.focused = false;
			this.scrolled = false;
		}
		get offsetParent() {
			// oculto si algún <details> de arriba está cerrado
			for (let p = this.parentElement; p; p = p.parentElement)
				if (p.tag === 'details' && !p.attrs.has('open')) return null;
			return {};
		}
		/** @param {string} sel */
		matches(sel) {
			return sel.split(',').some((s) => s.trim().startsWith(this.tag));
		}
		/** @param {string} tag */
		closest(tag) {
			/** @type {FakeElement | null} */
			let p = /** @type {FakeElement} */ (this);
			for (; p; p = p.parentElement) if (p.tag === tag) return p;
			return null;
		}
		/** @param {string} sel @returns {FakeElement[]} */
		querySelectorAll(sel) {
			return this.children.flatMap((c) => [
				...(c.matches(sel) ? [c] : []),
				...c.querySelectorAll(sel)
			]);
		}
		/** @param {string} k */
		hasAttribute(k) {
			return this.attrs.has(k);
		}
		/** @param {string} k @param {string} v */
		setAttribute(k, v) {
			this.attrs.set(k, v);
		}
		scrollIntoView() {
			this.scrolled = true;
		}
		focus() {
			this.focused = true;
		}
	}
	/** @param {Record<string, FakeElement>} byId */
	function install(byId) {
		// @ts-ignore
		globalThis.HTMLElement = FakeElement;
		// @ts-ignore
		globalThis.document = { getElementById: (/** @type {string} */ id) => byId[id] ?? null };
	}
	afterEach(() => {
		// @ts-ignore
		delete globalThis.document;
		// @ts-ignore
		delete globalThis.HTMLElement;
	});

	it('va al campo y le pone el foco', () => {
		const input = new FakeElement('input');
		install({ 'title-input': input });
		expect(focusField('title-input')).toBe(true);
		expect(input.scrolled).toBe(true);
		expect(input.focused).toBe(true);
	});

	it('un fieldset: el foco va a su primer control visible', () => {
		const fieldset = new FakeElement('fieldset');
		const first = new FakeElement('input', fieldset);
		install({ 'edit-tickets': fieldset });
		expect(focusField('edit-tickets')).toBe(true);
		expect(first.focused).toBe(true);
	});

	it('dentro de un <details> cerrado (contacto de un perfil): lo abre y enfoca el campo', () => {
		const details = new FakeElement('details');
		const input = new FakeElement('input', details);
		install({ 'email-input': input });
		expect(focusField('email-input')).toBe(true);
		expect(details.attrs.has('open')).toBe(true);
		expect(input.focused).toBe(true);
	});

	it('sin el campo (o sin id), no hace nada y avisa', () => {
		install({});
		expect(focusField('no-existe')).toBe(false);
		expect(focusField('')).toBe(false);
	});
});
