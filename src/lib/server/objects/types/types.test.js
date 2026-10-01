import { describe, expect, it } from 'vitest';
import { validateFields } from '../fields.js';
import { coreTypes, createRegistry, validateData } from './index.js';

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
				kind: 'grupo',
				bio: 'Somos un grupo inventado',
				pronouns: ' elles ',
				links: ['https://ejemplo.test/a', '', 'https://ejemplo.test/a', 'http://ejemplo.test/b'],
				show_members: false
			})
		).toEqual({
			ok: true,
			data: {
				kind: 'grupo',
				bio: 'Somos un grupo inventado',
				pronouns: 'elles',
				links: ['https://ejemplo.test/a', 'http://ejemplo.test/b'],
				show_members: false
			}
		});
	});

	it('lugar: sus campos solo valen para lugares; la ubicación va completa (noche 3)', () => {
		const venue = {
			kind: 'lugar',
			address: 'Calle Inventada 1',
			area: 'Barrio Inventado',
			lat: -34.6,
			lng: -58.4,
			venue_privacy: 'area'
		};
		expect(validateData(perfil, venue)).toMatchObject({ ok: true });
		const asPersona = validateData(perfil, { ...venue, kind: 'persona' });
		expect(asPersona.ok ? [] : asPersona.errors.map((e) => e.path).sort()).toEqual([
			'address',
			'area',
			'lat',
			'lng',
			'venue_privacy'
		]);
		const half = validateData(perfil, { kind: 'lugar', lat: -34.6 });
		expect(half.ok ? [] : half.errors.map((e) => e.path)).toEqual(['lat']);
		expect(validateData(perfil, { kind: 'lugar', venue_privacy: 'secreta' }).ok).toBe(false);
		expect(validateData(perfil, { kind: 'persona', pronouns_url: 'javascript:alert(1)' }).ok).toBe(
			false
		);
	});

	it('rechaza tipos inventados, links que no son web, imágenes de afuera y claves desconocidas', () => {
		const paths = (/** @type {Record<string, unknown>} */ data) => {
			const r = validateData(perfil, data);
			return r.ok ? [] : r.errors.map((e) => e.path).sort();
		};
		// Desde la noche 3 (bloque A) `lugar` es un tipo de perfil y `email` un campo (de las fichas
		// de amigues importadas): la prueba usa otro tipo y otra clave inventados.
		expect(paths({ kind: 'cualquiera' })).toEqual(['kind']);
		expect(paths({ kind: 'persona', display_name: 'X', manager_email: 'x@example.com' })).toEqual([
			'display_name',
			'manager_email'
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

	it('"mostrar integrantes" es solo para grupos', () => {
		expect(validateData(perfil, { kind: 'persona', show_members: false })).toMatchObject({
			ok: false,
			errors: [{ path: 'show_members' }]
		});
		expect(validateData(perfil, { kind: 'grupo', show_members: true })).toMatchObject({ ok: true });
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
