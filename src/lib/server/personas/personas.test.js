/**
 * Personas en eventos (B7) contra un D1 de miniflare: la lista de roles, qué perfiles se
 * muestran (visibles para cualquiera y aprobados; ninguno oculto, "solo con cuenta", borrado o
 * sin revisar aparece, ni su nombre ni su link), lo que lista un perfil, los interruptores y la
 * forma de los edges del futuro. Datos inventados.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import { getEdges, saveObject } from '$lib/server/objects/index.js';
import { logAdminAction } from '$lib/server/admin/audit.js';
import { clearFlagCache, setFlag } from '$lib/server/flags.js';
import { FIXED_ROLES, mergeRoles, personasToEdges } from '$lib/utils/personas.js';
import { addRole, listCustomRoles, listRoles, removeRole } from './roles.js';
import {
	contentForProfilePage,
	editorPersonas,
	personasFileErrors,
	personasForPage,
	pickableProfiles,
	profileHref,
	publicProfilesBySlug,
	resolvePersonas,
	resolveProfileContent
} from './index.js';

vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

/** @type {Awaited<ReturnType<typeof createTestDB>>} */
let t;
beforeAll(async () => {
	t = await createTestDB();
});
afterAll(async () => {
	await t?.dispose();
});
beforeEach(async () => {
	await resetDB(t.db);
	clearFlagCache();
});

const ADMIN_LOGIN = 'admin-de-prueba';
const ACCOUNT = 'cuenta:00000000-0000-4000-8000-000000000001';

/**
 * Un perfil guardado por saveObject (el único camino de escritura de los objetos).
 * @param {string} slug
 * @param {{ kind?: 'persona' | 'grupo', visibility?: 'public' | 'members' | 'hidden', by?: string, deleted?: boolean, reviewed?: boolean }} [o]
 */
async function profile(
	slug,
	{
		kind = 'grupo',
		visibility = 'public',
		by = ADMIN_LOGIN,
		deleted = false,
		reviewed = false
	} = {}
) {
	const title = slug
		.split('-')
		.map((w) => w[0].toUpperCase() + w.slice(1))
		.join(' ');
	let p = await saveObject(
		t.db,
		{ type: 'perfil', slug, title, data: { kind }, visibility },
		{ actor: by }
	);
	if (deleted)
		p = await saveObject(
			t.db,
			{ id: p.id, type: 'perfil', version: p.version, deleted: true },
			{ actor: ADMIN_LOGIN }
		);
	if (reviewed) {
		await logAdminAction(
			t.db,
			{ user: { id: 1, login: ADMIN_LOGIN } },
			{
				action: 'profile.review',
				targetType: 'profile',
				targetId: String(p.id),
				summary: 'Revisó el perfil'
			}
		);
	}
	return p;
}

/** Los perfiles de prueba: uno público por cada caso que NO se tiene que ver. */
async function seedProfiles() {
	await profile('colectivo-de-prueba');
	await profile('persona-de-prueba', { kind: 'persona' });
	await profile('perfil-oculto', { visibility: 'hidden' });
	await profile('perfil-solo-cuentas', { visibility: 'members' });
	await profile('perfil-borrado', { deleted: true });
	await profile('perfil-sin-revisar', { by: ACCOUNT });
	await profile('perfil-revisado', { by: ACCOUNT, reviewed: true });
}

const PERSONAS = [
	{ perfil: 'colectivo-de-prueba', rol: 'Organiza' },
	{ perfil: 'perfil-oculto', rol: 'Organiza' },
	{ perfil: 'persona-de-prueba', rol: 'Facilita' },
	{ perfil: 'perfil-solo-cuentas', rol: 'Facilita' },
	{ perfil: 'perfil-borrado', rol: 'Enseña' },
	{ perfil: 'perfil-sin-revisar', rol: 'Enseña' },
	{ perfil: 'perfil-revisado', rol: 'Fotografía' },
	{ perfil: 'no-existe', rol: 'Diseño' }
];

async function flagsOn() {
	await setFlag(t.db, 'personas_eventos', true, { by: ADMIN_LOGIN });
	await setFlag(t.db, 'cuentas', true, { by: ADMIN_LOGIN });
}

describe('roles', () => {
	it('fijos + los del panel; no se repiten y los fijos no se sacan', async () => {
		expect(await listRoles(t.db)).toEqual([...FIXED_ROLES]);
		expect(await listRoles(null)).toEqual([...FIXED_ROLES]);
		expect(await addRole(t.db, ' Cuida  la puerta ', { by: ADMIN_LOGIN, now: 1 })).toEqual({
			ok: true,
			name: 'Cuida la puerta'
		});
		expect(await addRole(t.db, 'cuida la puerta', { by: ADMIN_LOGIN })).toMatchObject({
			ok: false,
			status: 409
		});
		expect(await addRole(t.db, 'organiza', { by: ADMIN_LOGIN })).toMatchObject({
			ok: false,
			status: 409
		});
		expect(await addRole(t.db, '<b>', { by: ADMIN_LOGIN })).toMatchObject({
			ok: false,
			status: 400
		});
		expect(await listRoles(t.db)).toEqual([...FIXED_ROLES, 'Cuida la puerta']);
		expect((await listCustomRoles(t.db))[0]).toMatchObject({
			createdBy: ADMIN_LOGIN,
			createdAt: 1
		});
		expect(await removeRole(t.db, 'Organiza')).toMatchObject({ ok: false, status: 400 });
		expect(await removeRole(t.db, 'No está')).toMatchObject({ ok: false, status: 404 });
		expect(await removeRole(t.db, 'cuida la puerta')).toEqual({
			ok: true,
			name: 'cuida la puerta'
		});
		expect(await listRoles(t.db)).toEqual([...FIXED_ROLES]);
	});
});

describe('visibilidad: un perfil que no es público no aparece', () => {
	it('solo visibles para cualquiera y aprobados', async () => {
		await seedProfiles();
		const found = await publicProfilesBySlug(
			t.db,
			PERSONAS.map((p) => p.perfil)
		);
		expect([...found.keys()].sort()).toEqual([
			'colectivo-de-prueba',
			'perfil-revisado',
			'persona-de-prueba'
		]);
		expect((await pickableProfiles(t.db)).map((p) => p.slug)).toEqual([
			'colectivo-de-prueba',
			'perfil-revisado',
			'persona-de-prueba'
		]);
	});

	it('la página del evento no lleva nombre ni link de los demás', async () => {
		await seedProfiles();
		const groups = await resolvePersonas(t.db, PERSONAS, mergeRoles());
		expect(groups).toEqual([
			{
				rol: 'Organiza',
				items: [
					{
						slug: 'colectivo-de-prueba',
						title: 'Colectivo De Prueba',
						kind: 'grupo',
						href: profileHref('colectivo-de-prueba')
					}
				]
			},
			{
				rol: 'Facilita',
				items: [
					{
						slug: 'persona-de-prueba',
						title: 'Persona De Prueba',
						kind: 'persona',
						href: '/amigues/persona-de-prueba'
					}
				]
			},
			{
				rol: 'Fotografía',
				items: [
					{
						slug: 'perfil-revisado',
						title: 'Perfil Revisado',
						kind: 'grupo',
						href: '/amigues/perfil-revisado'
					}
				]
			}
		]);
		const text = JSON.stringify(groups);
		for (const hidden of [
			'oculto',
			'solo-cuentas',
			'Solo Cuentas',
			'borrado',
			'sin-revisar',
			'Sin Revisar',
			'Enseña',
			'Diseño'
		]) {
			expect(text).not.toContain(hidden);
		}
	});

	it('la página de un perfil no público no lista nada', async () => {
		await seedProfiles();
		const posts = [
			{
				path: '/calendario/taller-de-prueba',
				meta: { title: 'Taller', category: 'calendario', personas: PERSONAS }
			}
		];
		const ok = await resolveProfileContent(t.db, 'colectivo-de-prueba', posts, mergeRoles());
		expect(ok?.groups.map((g) => g.rol)).toEqual(['Organiza']);
		for (const slug of [
			'perfil-oculto',
			'perfil-solo-cuentas',
			'perfil-borrado',
			'perfil-sin-revisar',
			'no-existe'
		]) {
			expect(await resolveProfileContent(t.db, slug, posts, mergeRoles())).toBeNull();
		}
	});
});

describe('interruptores', () => {
	const meta = { title: 'Taller de prueba', personas: PERSONAS };
	const posts = async () => [
		{ path: '/calendario/taller-de-prueba', meta: { ...meta, category: 'calendario' } }
	];

	it('apagados: nada cambia (null en las páginas, sin sección en el editor)', async () => {
		await seedProfiles();
		expect(await personasForPage(t.platform, meta)).toBeNull();
		expect(await contentForProfilePage(t.platform, 'colectivo-de-prueba', posts)).toBeNull();
		expect(await editorPersonas(t.platform)).toBeNull();
		// Solo personas_eventos, sin el de perfiles: tampoco se muestran perfiles.
		await setFlag(t.db, 'personas_eventos', true, { by: ADMIN_LOGIN });
		expect(await personasForPage(t.platform, meta)).toBeNull();
		expect(await contentForProfilePage(t.platform, 'colectivo-de-prueba', posts)).toBeNull();
	});

	it('prendidos: las personas públicas y lo que lista cada perfil', async () => {
		await seedProfiles();
		await flagsOn();
		const groups = await personasForPage(t.platform, meta);
		expect(groups?.map((g) => g.items.map((i) => i.slug))).toEqual([
			['colectivo-de-prueba'],
			['persona-de-prueba'],
			['perfil-revisado']
		]);
		expect(await personasForPage(t.platform, { title: 'Sin personas' })).toBeNull();
		expect(await contentForProfilePage(t.platform, 'colectivo-de-prueba', posts)).toEqual([
			{
				rol: 'Organiza',
				items: [
					{
						rol: 'Organiza',
						title: 'Taller de prueba',
						path: '/calendario/taller-de-prueba',
						category: 'calendario',
						date: null
					}
				]
			}
		]);
		expect(await contentForProfilePage(t.platform, 'perfil-oculto', posts)).toBeNull();
		const editor = await editorPersonas(t.platform);
		expect(editor?.roles).toEqual([...FIXED_ROLES]);
		expect(editor?.profiles.map((p) => p.slug)).not.toContain('perfil-oculto');
	});
});

describe('validar al guardar', () => {
	it('los problemas de `personas:` de un archivo', () => {
		const roles = mergeRoles();
		const md = (/** @type {string} */ fm) => `---\ntitle: Prueba\n${fm}---\nTexto\n`;
		expect(personasFileErrors(md(''), roles)).toEqual([]);
		expect(
			personasFileErrors(
				md('personas:\n  - perfil: colectivo-de-prueba\n    rol: Organiza\n'),
				roles
			)
		).toEqual([]);
		expect(
			personasFileErrors(
				md('personas:\n  - perfil: colectivo-de-prueba\n    rol: Inventado\n'),
				roles
			)
		).toEqual(['Personas, fila 1: «Inventado» no es un rol de la lista.']);
		expect(personasFileErrors('---\n: : roto\n---\n', roles)).toEqual([]);
	});
});

describe('edges del futuro', () => {
	it('personasToEdges arma edges que saveObject acepta para un evento', async () => {
		const colectivo = await profile('colectivo-de-prueba');
		const persona = await profile('persona-de-prueba', { kind: 'persona' });
		const ids = new Map([
			[colectivo.slug, colectivo.id],
			[persona.slug, persona.id]
		]);
		const evento = await saveObject(
			t.db,
			{
				type: 'evento',
				title: 'Taller de prueba',
				data: { start: '2026-11-01T19:00-03:00' },
				edges: personasToEdges(
					[
						{ perfil: 'colectivo-de-prueba', rol: 'Organiza' },
						{ perfil: 'colectivo-de-prueba', rol: 'Produce' },
						{ perfil: 'persona-de-prueba', rol: 'Facilita' }
					],
					ids
				)
			},
			{ actor: ADMIN_LOGIN }
		);
		const edges = await getEdges(t.db, evento.id, { role: 'anon' }, { kind: 'persona' });
		expect(edges.map((e) => [e.object.slug, e.data])).toEqual([
			['colectivo-de-prueba', { roles: ['Organiza', 'Produce'] }],
			['persona-de-prueba', { roles: ['Facilita'] }]
		]);
	});
});
