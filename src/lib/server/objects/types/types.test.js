import { describe, expect, it } from 'vitest';
import { validateFields } from '../fields.js';
import { coreTypes, createRegistry, validateData } from './index.js';
import {
	LEGACY_PROJECT_KIND,
	PROFILE_KINDS,
	normalizeProfileKind,
	profileKindOf
} from './perfil.js';

const evento = /** @type {import('./index.js').CoreType} */ (coreTypes.get('evento'));
const lugar = /** @type {import('./index.js').CoreType} */ (coreTypes.get('lugar'));
const perfil = /** @type {import('./index.js').CoreType} */ (coreTypes.get('perfil'));

describe('registro de tipos núcleo', () => {
	it('tiene evento, lugar y perfil; el evento puede apuntar a un lugar', () => {
		expect([...coreTypes.types.keys()]).toEqual(['evento', 'lugar', 'perfil']);
		expect(evento.edges?.lugar).toMatchObject({ to: ['lugar'], max: 1 });
		expect(perfil.edges?.es_integrante_de).toMatchObject({ to: ['perfil'] });
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

describe('perfil', () => {
	it('solo el tipo es obligatorio; normaliza y saca vacíos', () => {
		expect(validateData(perfil, {})).toMatchObject({ ok: false, errors: [{ path: 'kind' }] });
		expect(
			validateData(perfil, {
				kind: 'proyecto',
				bio: 'Somos un proyecto inventado',
				pronouns: ' elles ',
				links: ['https://ejemplo.test/a', '', 'https://ejemplo.test/a', 'http://ejemplo.test/b'],
				show_members: false
			})
		).toEqual({
			ok: true,
			data: {
				kind: 'proyecto',
				bio: 'Somos un proyecto inventado',
				pronouns: 'elles',
				links: ['https://ejemplo.test/a', 'http://ejemplo.test/b'],
				show_members: false
			}
		});
	});

	it('rechaza tipos inventados, links que no son web, imágenes de afuera y claves desconocidas', () => {
		const paths = (/** @type {Record<string, unknown>} */ data) => {
			const r = validateData(perfil, data);
			return r.ok ? [] : r.errors.map((e) => e.path).sort();
		};
		expect(paths({ kind: 'lugar' })).toEqual(['kind']);
		expect(paths({ kind: 'persona', display_name: 'X', email: 'x@example.com' })).toEqual([
			'display_name',
			'email'
		]);
		expect(paths({ kind: 'persona', links: ['javascript:alert(1)'] })).toEqual(['links']);
		expect(paths({ kind: 'persona', links: ['https://usuario:clave@ejemplo.test'] })).toEqual([
			'links'
		]);
		expect(
			paths({ kind: 'persona', links: Array.from({ length: 9 }, (_, i) => `https://e.test/${i}`) })
		).toEqual(['links']);
		expect(paths({ kind: 'persona', avatar: 'https://otro-sitio.test/foto.jpg' })).toEqual([
			'avatar'
		]);
		expect(paths({ kind: 'persona', avatar: 'perfiles/foto-inventada.webp' })).toEqual([]);
		expect(paths({ kind: 'persona', pronouns: 'x'.repeat(41) })).toEqual(['pronouns']);
		expect(paths({ kind: 'persona', bio: 'x'.repeat(1001) })).toEqual(['bio']);
	});

	it('"mostrar integrantes" es solo para proyectos', () => {
		expect(validateData(perfil, { kind: 'persona', show_members: false })).toMatchObject({
			ok: false,
			errors: [{ path: 'show_members' }]
		});
		expect(validateData(perfil, { kind: 'proyecto', show_members: true })).toMatchObject({
			ok: true
		});
	});

	it('el valor viejo «grupo» se lee como «proyecto» (y nada más se normaliza)', () => {
		expect(PROFILE_KINDS).toEqual(['persona', 'proyecto']);
		expect(LEGACY_PROJECT_KIND).toBe('grupo');
		expect(normalizeProfileKind('grupo')).toBe('proyecto');
		expect(normalizeProfileKind('proyecto')).toBe('proyecto');
		expect(normalizeProfileKind('persona')).toBe('persona');
		for (const v of ['Grupo', 'lugar', '', null, undefined, 1]) {
			expect(normalizeProfileKind(v)).toBeNull();
		}
		expect(profileKindOf({ kind: 'grupo' })).toBe('proyecto');
		expect(profileKindOf({ kind: 'proyecto' })).toBe('proyecto');
		expect(profileKindOf({ kind: 'persona' })).toBe('persona');
		// Lo que no se reconoce sigue contando como persona, como antes del cambio.
		expect(profileKindOf({})).toBe('persona');
		expect(profileKindOf(null)).toBe('persona');
	});

	it('una fila vieja con «grupo» valida y se guarda como «proyecto»; nunca queda «grupo»', () => {
		expect(validateData(perfil, { kind: 'grupo', show_members: true })).toEqual({
			ok: true,
			data: { kind: 'proyecto', show_members: true }
		});
		// No muta lo que recibe.
		const legacy = { kind: 'grupo' };
		validateData(perfil, legacy);
		expect(legacy).toEqual({ kind: 'grupo' });
		// Otros valores siguen sin pasar.
		expect(validateData(perfil, { kind: 'Grupo' })).toMatchObject({
			ok: false,
			errors: [{ path: 'kind' }]
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
