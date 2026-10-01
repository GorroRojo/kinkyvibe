import { describe, expect, it } from 'vitest';
import {
	FIXED_ROLES,
	MAX_PERSONAS,
	cleanRole,
	contentByRole,
	findRole,
	groupByRole,
	isProfileSlug,
	mergeRoles,
	parsePersonas,
	personasToEdges,
	validatePersonas
} from './personas.js';

describe('roles', () => {
	it('la lista fija es la acordada, en ese orden', () => {
		expect(FIXED_ROLES).toEqual([
			'Autore',
			'Traductore',
			'Organiza',
			'Produce',
			'Facilita',
			'Monitorea',
			'Enseña',
			'Fotografía',
			'Diseño'
		]);
	});

	it('limpia nombres y rechaza los inválidos', () => {
		expect(cleanRole('  Cuida   la puerta ')).toBe('Cuida la puerta');
		expect(cleanRole('Enseña')).toBe('Enseña');
		expect(cleanRole('x')).toBe('');
		expect(cleanRole('a'.repeat(41))).toBe('');
		expect(cleanRole('<script>')).toBe('');
		expect(cleanRole('https://ejemplo.com')).toBe('');
		expect(cleanRole(42)).toBe('');
	});

	it('suma los del panel sin repetir (sin importar mayúsculas), fijos primero', () => {
		const roles = mergeRoles(['organiza', 'Cuida la puerta', 'cuida la puerta', '']);
		expect(roles.slice(0, FIXED_ROLES.length)).toEqual([...FIXED_ROLES]);
		expect(roles.slice(FIXED_ROLES.length)).toEqual(['Cuida la puerta']);
		expect(findRole(roles, 'ORGANIZA')).toBe('Organiza');
		expect(findRole(roles, 'Inventado')).toBeNull();
	});
});

describe('personas del frontmatter', () => {
	it('direcciones de perfil válidas', () => {
		expect(isProfileSlug('colectivo-de-prueba')).toBe(true);
		expect(isProfileSlug('Gorro_Rojo')).toBe(false);
		expect(isProfileSlug('../admin')).toBe(false);
		expect(isProfileSlug('a'.repeat(101))).toBe(false);
	});

	it('para mostrar: saltea lo inválido y lo repetido, con tope', () => {
		const raw = [
			{ perfil: 'colectivo-de-prueba', rol: 'Organiza' },
			{ perfil: 'colectivo-de-prueba', rol: 'organiza' },
			{ perfil: 'Mal Slug', rol: 'Organiza' },
			{ perfil: 'persona-de-prueba' },
			'texto suelto',
			{ perfil: 'persona-de-prueba', rol: 'Rol que se borró' }
		];
		expect(parsePersonas(raw)).toEqual([
			{ perfil: 'colectivo-de-prueba', rol: 'Organiza' },
			{ perfil: 'persona-de-prueba', rol: 'Rol que se borró' }
		]);
		expect(parsePersonas('Organiza')).toEqual([]);
		const many = Array.from({ length: 50 }, (_, i) => ({ perfil: `p-${i}`, rol: 'Facilita' }));
		expect(parsePersonas(many)).toHaveLength(MAX_PERSONAS);
	});

	it('para guardar: perfil, rol de la lista, sin repetir y con tope', () => {
		const roles = mergeRoles();
		expect(validatePersonas(undefined, roles)).toEqual({ ok: true, personas: [] });
		expect(validatePersonas([{ perfil: 'colectivo-de-prueba', rol: 'organiza' }], roles)).toEqual({
			ok: true,
			personas: [{ perfil: 'colectivo-de-prueba', rol: 'Organiza' }]
		});
		const bad = validatePersonas(
			[
				{ perfil: '', rol: 'Organiza' },
				{ perfil: 'persona-de-prueba', rol: 'Inventado' },
				{ perfil: 'persona-de-prueba', rol: 'Facilita' },
				{ perfil: 'persona-de-prueba', rol: 'Facilita' },
				'suelto'
			],
			roles
		);
		expect(bad.ok).toBe(false);
		expect(!bad.ok && bad.errors).toEqual([
			'Personas, fila 1: elegí un perfil.',
			'Personas, fila 2: «Inventado» no es un rol de la lista.',
			'Personas, fila 4: ese perfil ya tiene el rol Facilita.',
			'Personas, fila 5: tiene que tener perfil y rol.'
		]);
		expect(validatePersonas({ perfil: 'x' }, roles).ok).toBe(false);
		const many = Array.from({ length: MAX_PERSONAS + 1 }, (_, i) => ({
			perfil: `p-${i}`,
			rol: 'Facilita'
		}));
		expect(validatePersonas(many, roles).ok).toBe(false);
	});
});

describe('agrupar por rol', () => {
	it('en el orden de la lista; los desconocidos al final', () => {
		const groups = groupByRole([
			{ rol: 'Facilita', n: 1 },
			{ rol: 'Otro', n: 2 },
			{ rol: 'Organiza', n: 3 },
			{ rol: 'facilita', n: 4 }
		]);
		expect(groups.map((g) => [g.rol, g.items.map((i) => i.n)])).toEqual([
			['Organiza', [3]],
			['Facilita', [1, 4]],
			['Otro', [2]]
		]);
	});

	it('lo que lista un perfil: sus publicaciones por rol', () => {
		const posts = [
			{
				path: '/calendario/taller-de-prueba',
				meta: {
					title: 'Taller de prueba',
					category: 'calendario',
					start: '2026-11-01T19:00-03:00',
					personas: [
						{ perfil: 'colectivo-de-prueba', rol: 'Organiza' },
						{ perfil: 'colectivo-de-prueba', rol: 'Facilita' },
						{ perfil: 'otra-persona', rol: 'Enseña' }
					]
				}
			},
			{
				path: '/material/guia-de-prueba',
				meta: {
					title: 'Guía de prueba',
					category: 'material',
					published_date: '2026-09-01',
					personas: [{ perfil: 'colectivo-de-prueba', rol: 'Autore' }]
				}
			},
			{ path: '/material/sin-personas', meta: { title: 'Sin personas', category: 'material' } }
		];
		const groups = contentByRole(posts, 'colectivo-de-prueba');
		expect(groups.map((g) => [g.rol, g.items.map((i) => i.path)])).toEqual([
			['Autore', ['/material/guia-de-prueba']],
			['Organiza', ['/calendario/taller-de-prueba']],
			['Facilita', ['/calendario/taller-de-prueba']]
		]);
		expect(groups[1].items[0]).toMatchObject({
			title: 'Taller de prueba',
			category: 'calendario',
			date: '2026-11-01T19:00-03:00'
		});
		expect(contentByRole(posts, 'nadie')).toEqual([]);
		expect(contentByRole(posts, 'Mal Slug')).toEqual([]);
	});
});

describe('edges del futuro', () => {
	it('un edge `persona` por perfil, con todos sus roles; sin id, afuera', () => {
		const ids = new Map([
			['colectivo-de-prueba', 7],
			['persona-de-prueba', 9]
		]);
		expect(
			personasToEdges(
				[
					{ perfil: 'colectivo-de-prueba', rol: 'Organiza' },
					{ perfil: 'persona-de-prueba', rol: 'Facilita' },
					{ perfil: 'colectivo-de-prueba', rol: 'Produce' },
					{ perfil: 'sin-objeto', rol: 'Enseña' }
				],
				ids
			)
		).toEqual({
			persona: [
				{ to: 7, data: { roles: ['Organiza', 'Produce'] } },
				{ to: 9, data: { roles: ['Facilita'] } }
			]
		});
	});
});
