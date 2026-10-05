import { describe, expect, it } from 'vitest';
import { validateFields } from '../fields.js';
import { coreTypes, createRegistry, validateData } from './index.js';
import {
	LEGACY_PROJECT_KIND,
	PROFILE_KINDS,
	VENUE_PRIVACY,
	normalizeProfileKind,
	profileKindOf
} from './perfil.js';
import { VENUE_PRIVACY_LEVELS } from '$lib/utils/venues.js';

const evento = /** @type {import('./index.js').CoreType} */ (coreTypes.get('evento'));
const lugar = /** @type {import('./index.js').CoreType} */ (coreTypes.get('lugar'));
const perfil = /** @type {import('./index.js').CoreType} */ (coreTypes.get('perfil'));

describe('registro de tipos núcleo', () => {
	it('tiene evento, lugar, perfil, etiqueta, material, imagen y archivo; el evento puede apuntar a un lugar (o a un perfil de lugar), a perfiles y a su portada', () => {
		expect([...coreTypes.types.keys()]).toEqual([
			'evento',
			'lugar',
			'perfil',
			'etiqueta',
			'material',
			'imagen',
			'archivo'
		]);
		expect(evento.edges?.lugar).toMatchObject({ to: ['lugar', 'perfil'], max: 1 });
		expect(evento.edges?.persona).toMatchObject({ to: ['perfil'] });
		expect(evento.edges?.portada).toMatchObject({ to: ['imagen'], max: 1 });
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
		}); // Un mail de inscripción (mailto:) vale; sin dirección, no.
		expect(
			validateData(evento, { start: '2026-10-02T20:00-03:00', link: 'mailto:hola@ejemplo.test' })
		).toMatchObject({ ok: true });
		expect(
			validateData(evento, { start: '2026-10-02T20:00-03:00', link: 'mailto:' })
		).toMatchObject({ ok: false, errors: [{ path: 'link' }] });
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
		// «Sólo dirección» (address) es un nivel válido, y los del tipo son los mismos que los de
		// src/lib/utils/venues.js.
		expect(validateData(perfil, { kind: 'lugar', venue_privacy: 'address' }).ok).toBe(true);
		expect([...VENUE_PRIVACY]).toEqual([...VENUE_PRIVACY_LEVELS]);
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
		expect(PROFILE_KINDS).toEqual(['persona', 'proyecto', 'lugar']);
		expect(LEGACY_PROJECT_KIND).toBe('grupo');
		expect(normalizeProfileKind('grupo')).toBe('proyecto');
		expect(normalizeProfileKind('proyecto')).toBe('proyecto');
		expect(normalizeProfileKind('persona')).toBe('persona');
		expect(normalizeProfileKind('lugar')).toBe('lugar');
		for (const v of ['Grupo', 'Lugar', '', null, undefined, 1]) {
			expect(normalizeProfileKind(v)).toBeNull();
		}
		expect(profileKindOf({ kind: 'grupo' })).toBe('proyecto');
		expect(profileKindOf({ kind: 'proyecto' })).toBe('proyecto');
		expect(profileKindOf({ kind: 'persona' })).toBe('persona');
		expect(profileKindOf({ kind: 'lugar' })).toBe('lugar');
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

describe('imagen', () => {
	const imagen = /** @type {import('./index.js').CoreType} */ (coreTypes.get('imagen'));
	const key = `img/${'a'.repeat(64)}.webp`;
	it('una clave de R2 por contenido, su tipo y su peso', () => {
		expect(
			validateData(imagen, { key, mime: 'image/webp', size: 1200, width: 10, height: 5 })
		).toMatchObject({
			ok: true
		});
		expect(validateData(imagen, { key: '../otra.png', mime: 'image/webp', size: 1 })).toMatchObject(
			{
				ok: false,
				errors: [{ path: 'key' }]
			}
		);
		expect(validateData(imagen, { key, mime: 'image/svg+xml', size: 1 })).toMatchObject({
			ok: false
		});
		expect(validateData(imagen, { key, mime: 'image/png' })).toMatchObject({ ok: false });
	});
	it('los usos son edges hacia la imagen, de a una', () => {
		for (const [type, kind] of [
			['evento', 'portada'],
			['material', 'portada'],
			['etiqueta', 'imagen'],
			['perfil', 'avatar']
		]) {
			expect(coreTypes.get(type)?.edges?.[kind]).toMatchObject({ to: ['imagen'], max: 1 });
		}
	});
});

describe('archivo (documentos y video de la biblioteca)', () => {
	const archivo = /** @type {import('./index.js').CoreType} */ (coreTypes.get('archivo'));
	const key = `file/${'b'.repeat(64)}.pdf`;
	it('una clave de R2 por contenido (`file/…`), su tipo y su peso', () => {
		expect(validateData(archivo, { key, mime: 'application/pdf', size: 1200 })).toMatchObject({
			ok: true
		});
		expect(
			validateData(archivo, { key: `img/${'b'.repeat(64)}.webp`, mime: 'application/pdf', size: 1 })
		).toMatchObject({ ok: false, errors: [{ path: 'key' }] });
		expect(validateData(archivo, { key, mime: 'text/html', size: 1 })).toMatchObject({ ok: false });
		expect(validateData(archivo, { key, mime: 'image/svg+xml', size: 1 })).toMatchObject({
			ok: false
		});
		expect(validateData(archivo, { key, mime: 'application/pdf' })).toMatchObject({ ok: false });
	});
	it('ningún uso de imagen (portada, avatar, imagen de serie) puede apuntar a un archivo', () => {
		for (const def of coreTypes.types.values()) {
			for (const edge of Object.values(def.edges ?? {})) {
				if (edge.to.includes('imagen')) expect(edge.to).not.toContain('archivo');
			}
		}
	});
});
