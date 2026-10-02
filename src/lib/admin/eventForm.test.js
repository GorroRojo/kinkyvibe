import { describe, expect, it } from 'vitest';
import { changedKeys, draftAction } from './draft.js';
import {
	contentDraftLabels,
	currentSection,
	draftSectionLabels,
	formSections
} from './eventForm.js';

const ids = (/** @type {Array<{id: string}>} */ list) => list.map((s) => s.id);

describe('formSections', () => {
	it('crear un evento: todas las secciones, Entradas con el id de TicketsEditor', () => {
		expect(ids(formSections({ mode: 'nuevo' }))).toEqual([
			'sec-cuando',
			'sec-datos',
			'sec-lugar',
			'sec-direccion',
			'sec-etiquetas',
			'ev-tickets',
			'sec-imagen',
			'sec-texto'
		]);
	});

	// Noche 4: Editar usa la misma «📅 ¿Cuándo es?» que crear (antes Empieza y Termina estaban en
	// Datos), así que el índice de Editar empieza con Fecha y hora, como el de crear.
	it('editar un evento: Fecha y hora primero (como al crear), con imagen y entradas', () => {
		expect(ids(formSections({ mode: 'editar', category: 'calendario', hasImage: true }))).toEqual([
			'sec-cuando',
			'sec-datos',
			'sec-lugar',
			'sec-imagen',
			'sec-etiquetas',
			'edit-tickets',
			'sec-texto'
		]);
	});

	it('editar otra publicación: sin entradas ni imagen', () => {
		expect(ids(formSections({ mode: 'editar', category: 'material' }))).toEqual([
			'sec-datos',
			'sec-etiquetas',
			'sec-texto'
		]);
	});

	it('con el interruptor personas_eventos: Personas después de Datos (y del Lugar)', () => {
		const sections = formSections({
			mode: 'editar',
			category: 'calendario',
			hasImage: true,
			hasPersonas: true
		});
		expect(ids(sections)).toEqual([
			'sec-cuando',
			'sec-datos',
			'sec-lugar',
			'sec-personas',
			'sec-imagen',
			'sec-etiquetas',
			'edit-tickets',
			'sec-texto'
		]);
		expect(ids(formSections({ mode: 'editar', hasPersonas: true, parseError: true }))).toEqual([]);
	});

	it('material y amigues en el panel (ContentEditor): el mismo armazón', () => {
		expect(ids(formSections({ mode: 'contenido' }))).toEqual([
			'sec-datos',
			'sec-imagen',
			'sec-etiquetas',
			'sec-texto',
			'sec-lista'
		]);
		expect(formSections({ mode: 'contenido', parseError: true })).toEqual([]);
	});

	it('si el archivo se edita como texto no hay secciones', () => {
		expect(formSections({ mode: 'editar', parseError: true })).toEqual([]);
	});

	it('cada sección tiene ícono y nombre', () => {
		for (const s of formSections({ mode: 'nuevo' })) {
			expect(s.icon).toBeTruthy();
			expect(s.label).toBeTruthy();
		}
	});
});

describe('draftSectionLabels', () => {
	it('nombra las secciones sin repetir y en orden', () => {
		expect(draftSectionLabels(['values', 'authors', 'tickets', 'freeTags', 'tagRules'])).toEqual([
			'Datos',
			'Entradas',
			'Etiquetas'
		]);
	});
	it('ignora las partes que no conoce', () => {
		expect(draftSectionLabels(['otraCosa', 'body'])).toEqual(['Texto']);
	});
	it('la fecha y hora de Editar es su propia sección', () => {
		expect(draftSectionLabels(['schedule', 'values'])).toEqual(['Fecha y hora', 'Datos']);
	});
});

describe('contentDraftLabels (ContentEditor)', () => {
	const f = { values: { title: 'Guía de prueba' }, tags: [], authors: [], body: '', featured: '' };
	const current = { f, slug: 'guia', slugTouched: false, rawText: '' };
	it('mira adentro del formulario', () => {
		const draft = { ...current, f: { ...f, body: 'texto', tags: ['BDSM'] } };
		expect(contentDraftLabels(draft, current)).toEqual(['Etiquetas', 'Texto']);
	});
	it('la dirección va con Datos; igual a lo que hay, nada', () => {
		expect(contentDraftLabels({ ...current, slug: 'otra', slugTouched: true }, current)).toEqual([
			'Datos'
		]);
		expect(contentDraftLabels(structuredClone(current), current)).toEqual([]);
	});
});

describe('currentSection', () => {
	const tops = [
		{ id: 'a', top: -400 },
		{ id: 'b', top: 80 },
		{ id: 'c', top: 700 }
	];
	it('la última que pasó la línea de lectura', () => {
		expect(currentSection(tops, 120)).toBe('b');
		expect(currentSection(tops, 50)).toBe('a');
	});
	it('abajo de todo, la última aunque no haya llegado a la línea', () => {
		expect(currentSection(tops, 120, true)).toBe('c');
		expect(currentSection([], 120, true)).toBe('');
	});
	it('la primera si ninguna pasó, y vacío sin secciones', () => {
		expect(currentSection([{ id: 'x', top: 300 }], 100)).toBe('x');
		expect(currentSection([], 100)).toBe('');
	});
});

describe('borrador del formulario: decidir y comparar', () => {
	const current = { values: { title: 'Fiesta de prueba' }, body: '' };
	const draft = (/** @type {unknown} */ data, stale = false) => ({ data, savedAt: 0, stale });

	it('recién guardado: se borra el borrador', () => {
		expect(draftAction(draft({ x: 1 }), { current, saved: true })).toBe('clear');
		expect(draftAction(null, { current, saved: true })).toBe('clear');
	});
	it('sin borrador no hay nada que hacer', () => {
		expect(draftAction(null, { current })).toBe('none');
	});
	it('un borrador igual a lo que ya hay se borra', () => {
		expect(draftAction(draft(structuredClone(current)), { current })).toBe('clear');
	});
	it('con otro sha del archivo pregunta siempre (nunca recupera solo)', () => {
		const d = draft({ ...current, body: 'otro' }, true);
		expect(draftAction(d, { current })).toBe('stale');
	});
	// Antes solo el formulario de eventos ofrecía (con `ask`) y los otros editores recuperaban
	// directo ('restore'). gorrite pidió ofrecerlo en todos: ya no existe 'restore'.
	it('todos los editores ofrecen recuperar; ninguno recupera directo', () => {
		const d = draft({ ...current, body: 'otro' });
		expect(draftAction(d, { current })).toBe('offer');
	});

	it('changedKeys: las partes distintas', () => {
		expect(changedKeys(current, { ...current, body: 'otro', tickets: { on: true } })).toEqual([
			'body',
			'tickets'
		]);
		expect(changedKeys(current, structuredClone(current))).toEqual([]);
		expect(changedKeys(null, { a: 1 })).toEqual(['a']);
		// Faltar y valer null es lo mismo (pasa por JSON).
		expect(changedKeys({ a: null }, {})).toEqual([]);
	});
});
