import { describe, expect, it } from 'vitest';
import { validateFields } from '../fields.js';
import { coreTypes, createRegistry, validateData } from './index.js';

const evento = /** @type {import('./index.js').CoreType} */ (coreTypes.get('evento'));
const lugar = /** @type {import('./index.js').CoreType} */ (coreTypes.get('lugar'));

describe('registro de tipos núcleo', () => {
	it('arranca con evento y lugar; el evento puede apuntar a un lugar', () => {
		expect([...coreTypes.types.keys()]).toEqual(['evento', 'lugar']);
		expect(evento.edges?.lugar).toMatchObject({ to: ['lugar'], max: 1 });
	});

	it('rechaza definiciones incoherentes al armarse', () => {
		const base = { label: 'X', fields: {} };
		expect(() => createRegistry([{ ...base, type: 'Mal Nombre' }])).toThrow(/clave inválida/);
		expect(() =>
			createRegistry([
				{ ...base, type: 'a' },
				{ ...base, type: 'a' }
			])
		).toThrow(/repetido/);
		expect(() =>
			createRegistry([{ ...base, type: 'a', edges: { b: { label: 'B', to: ['no_existe'] } } }])
		).toThrow(/no existe/);
	});
});

describe('evento', () => {
	it('acepta datos como los de los .md y los normaliza', () => {
		const r = validateData(evento, {
			summary: '  Un taller inventado  ',
			status: 'abierto',
			start: '2026-10-02T20:00-03:00',
			end: '2026-10-02T23:00-03:00',
			link: 'https://ejemplo.test/inscripcion',
			link_text: '',
			body: 'Texto\r\nlargo'
		});
		expect(r).toEqual({
			ok: true,
			data: {
				summary: 'Un taller inventado',
				status: 'abierto',
				start: '2026-10-02T20:00-03:00',
				end: '2026-10-02T23:00-03:00',
				link: 'https://ejemplo.test/inscripcion',
				body: 'Texto\nlargo'
			}
		});
	});

	it('marca faltantes, formatos malos, claves desconocidas y fin antes del inicio', () => {
		const r = validateData(evento, { status: 'quizás', start: '2026-10-02 20:00', lugar: 3 });
		expect(r.ok).toBe(false);
		const paths = !r.ok ? r.errors.map((e) => e.path).sort() : [];
		expect(paths).toEqual(['lugar', 'start', 'status']);

		expect(validateData(evento, {})).toMatchObject({ ok: false, errors: [{ path: 'start' }] });
		expect(
			validateData(evento, { start: '2026-10-02T20:00-03:00', end: '2026-10-02T19:00-03:00' })
		).toMatchObject({ ok: false, errors: [{ path: 'end' }] });
		expect(
			validateData(evento, { start: '2026-10-02T20:00-03:00', link: 'javascript:alert(1)' })
		).toMatchObject({
			ok: false,
			errors: [{ path: 'link' }]
		});
	});

	it('el texto para buscar junta resumen y descripción', () => {
		expect(evento.searchText?.({ summary: 'a', body: 'b' })).toBe('a\nb');
	});
});

describe('lugar', () => {
	it('todos los campos son opcionales', () => {
		expect(validateData(lugar, {})).toEqual({ ok: true, data: {} });
		expect(validateData(lugar, { city: 'Ciudad Inventada', map_url: 'no es link' })).toMatchObject({
			ok: false,
			errors: [{ path: 'map_url' }]
		});
	});
});

describe('validateFields', () => {
	it('números, fechas, opciones y listas', () => {
		const fields = /** @type {Record<string, import('../fields.js').FieldDef>} */ ({
			cupo: { kind: 'integer', label: 'Cupo', min: 0 },
			precio: { kind: 'number', label: 'Precio' },
			dia: { kind: 'date', label: 'Día' },
			temas: { kind: 'list', label: 'Temas', options: ['a', 'b'], max: 2 },
			ok: { kind: 'boolean', label: 'Ok' }
		});
		expect(
			validateFields(fields, {
				cupo: '10',
				precio: 1.5,
				dia: '2026-02-28',
				temas: ['a', 'a', ' b '],
				ok: false
			})
		).toEqual({
			ok: true,
			data: { cupo: 10, precio: 1.5, dia: '2026-02-28', temas: ['a', 'b'], ok: false }
		});
		const bad = validateFields(fields, { cupo: -1, dia: '2026-02-30', temas: ['c'], ok: 'sí' });
		expect(bad.ok ? [] : bad.errors.map((e) => e.path).sort()).toEqual([
			'cupo',
			'dia',
			'ok',
			'temas'
		]);
		expect(validateFields(fields, [])).toMatchObject({ ok: false });
	});
});
