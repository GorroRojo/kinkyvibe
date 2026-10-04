/**
 * Personas en eventos (B7) contra un D1 de miniflare: la lista de roles, qué perfiles se
 * muestran (personas y proyectos visibles para cualquiera y aprobados para /amigues; ninguno
 * oculto, "solo con cuenta", borrado, sin aprobar o lugar aparece, ni su nombre ni su link), lo
 * que lista un perfil, las páginas y la forma de los edges del futuro. Datos inventados.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import { getEdges, saveObject } from '$lib/server/objects/index.js';
import { logAdminAction } from '$lib/server/admin/audit.js';
import { approveProfile } from '$lib/server/amigues/approvals.js';
import { clearFlagCache } from '$lib/server/flags.js';
import { FIXED_ROLES, mergeRoles, personasToEdges } from '$lib/utils/personas.js';
import { addRole, listCustomRoles, listRoles, removeRole } from './roles.js';
import {
	contentForProfilePage,
	editorPersonas,
	personasFileErrors,
	personasForPage,
	pickableProfiles,
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
 * Un perfil guardado por saveObject (el único camino de escritura de los objetos). Como en el
 * sitio, los que carga une admin nacen aprobados para /amigues y los de una cuenta no
 * (`approved` lo cambia).
 * @param {string} slug
 * @param {{ kind?: 'persona' | 'proyecto' | 'lugar', visibility?: 'public' | 'members' | 'hidden', by?: string, deleted?: boolean, reviewed?: boolean, approved?: boolean }} [o]
 */
async function profile(
	slug,
	{
		kind = 'proyecto',
		visibility = 'public',
		by = ADMIN_LOGIN,
		deleted = false,
		reviewed = false,
		approved = by === ADMIN_LOGIN
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
	if (approved) await approveProfile(t.db, p.id, ADMIN_LOGIN, { now: 1 });
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

/** Dirección vieja (ficha .md importada) del colectivo de prueba. */
const LEGACY_SLUG = 'Colectivo_de_Prueba';

/** Los perfiles de prueba: uno público por cada caso que NO se tiene que ver. */
async function seedProfiles() {
	const colectivo = await profile('colectivo-de-prueba');
	// Importado de una ficha .md: su página es /amigues/<dirección vieja> (migración 0017).
	await t.db
		.prepare(
			`INSERT INTO profile_sources (profile_id, legacy_slug, source_hash, imported_version,
			suggested_kind, imported_at, updated_at) VALUES (?1, ?2, ?3, 1, 'proyecto', 1, 1)`
		)
		.bind(colectivo.id, LEGACY_SLUG, 'a'.repeat(64))
		.run();
	await profile('persona-de-prueba', { kind: 'persona' });
	await profile('perfil-oculto', { visibility: 'hidden' });
	await profile('perfil-solo-cuentas', { visibility: 'members' });
	await profile('perfil-borrado', { deleted: true });
	await profile('perfil-sin-revisar', { by: ACCOUNT });
	// Revisado («Para revisar») pero no aprobado para /amigues: tampoco aparece.
	await profile('perfil-revisado-sin-aprobar', { by: ACCOUNT, reviewed: true });
	await profile('perfil-admin-sin-aprobar', { approved: false });
	await profile('perfil-revisado', { by: ACCOUNT, reviewed: true, approved: true });
	// Un lugar público y aprobado: va en «Sucede en», no como persona con rol.
	await profile('lugar-de-prueba', { kind: 'lugar' });
	// Una fila que quedó con el tipo viejo `grupo` (antes de 0023) se lee como proyecto.
	await t.db
		.prepare(
			`UPDATE objects SET data = json_set(data, '$.kind', 'grupo'), version = version + 1
			WHERE type = 'perfil' AND slug = 'perfil-revisado'`
		)
		.run();
}

const PERSONAS = [
	{ perfil: 'colectivo-de-prueba', rol: 'Organiza' },
	{ perfil: 'perfil-oculto', rol: 'Organiza' },
	{ perfil: 'persona-de-prueba', rol: 'Facilita' },
	{ perfil: 'perfil-solo-cuentas', rol: 'Facilita' },
	{ perfil: 'perfil-borrado', rol: 'Enseña' },
	{ perfil: 'perfil-sin-revisar', rol: 'Enseña' },
	{ perfil: 'perfil-revisado-sin-aprobar', rol: 'Enseña' },
	{ perfil: 'perfil-admin-sin-aprobar', rol: 'Enseña' },
	{ perfil: 'perfil-revisado', rol: 'Fotografía' },
	{ perfil: 'lugar-de-prueba', rol: 'Diseño' },
	{ perfil: 'no-existe', rol: 'Diseño' }
];

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
						kind: 'proyecto',
						href: '/amigues/Colectivo_de_Prueba'
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
						kind: 'proyecto',
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
			'sin-aprobar',
			'lugar',
			'Enseña',
			'Diseño'
		]) {
			expect(text).not.toContain(hidden);
		}
	});

	// «Personas en una sola sección»: un nombre libre (sin perfil) se muestra como texto, sin
	// link; los perfiles siguen las mismas reglas de siempre.
	it('un nombre libre va como texto (sin link) junto a los perfiles públicos', async () => {
		await seedProfiles();
		const groups = await resolvePersonas(
			t.db,
			[
				{ perfil: 'colectivo-de-prueba', rol: 'Organiza' },
				{ nombre: 'Persona Sin Perfil', rol: 'Organiza' },
				{ perfil: 'oculto', rol: 'Organiza' },
				{ nombre: 'Fotógrafe Inventade', rol: 'Fotografía' }
			],
			mergeRoles()
		);
		expect(groups).toEqual([
			{
				rol: 'Organiza',
				items: [
					{
						slug: 'colectivo-de-prueba',
						title: 'Colectivo De Prueba',
						kind: 'proyecto',
						href: '/amigues/Colectivo_de_Prueba'
					},
					{ slug: '', title: 'Persona Sin Perfil', kind: 'persona', href: '' }
				]
			},
			{
				rol: 'Fotografía',
				items: [{ slug: '', title: 'Fotógrafe Inventade', kind: 'persona', href: '' }]
			}
		]);
		// Solo nombres: no hace falta consultar perfiles.
		expect(
			await resolvePersonas(t.db, [{ nombre: 'Solo Nombre', rol: 'Facilita' }], mergeRoles())
		).toEqual([
			{ rol: 'Facilita', items: [{ slug: '', title: 'Solo Nombre', kind: 'persona', href: '' }] }
		]);
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
			'perfil-revisado-sin-aprobar',
			'perfil-admin-sin-aprobar',
			'lugar-de-prueba',
			'no-existe'
		]) {
			expect(await resolveProfileContent(t.db, slug, posts, mergeRoles())).toBeNull();
		}
	});
});

// Los interruptores `personas_eventos` y `perfiles_publicos` quedaron prendidos para siempre: se
// fue el test «apagados: nada cambia».
describe('las páginas', () => {
	const meta = { title: 'Taller de prueba', personas: PERSONAS };
	const posts = async () => [
		{ path: '/calendario/taller-de-prueba', meta: { ...meta, category: 'calendario' } }
	];

	it('sin base, nada (null en las páginas, sin sección en el editor)', async () => {
		expect(await personasForPage(undefined, meta)).toBeNull();
		expect(await contentForProfilePage(undefined, 'colectivo-de-prueba', posts)).toBeNull();
		expect(await editorPersonas(undefined)).toBeNull();
	});

	it('las personas públicas y lo que lista cada perfil', async () => {
		await seedProfiles();
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
		expect(editor?.profiles.map((p) => p.slug)).not.toContain('lugar-de-prueba');
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
