/**
 * Borrar desde el panel un perfil que vive solo en la base (sin .md): borrado suave del objeto
 * (con su revisión y la fila para deshacer, en la misma tanda), sin GitHub; deshacer lo vuelve
 * atrás. Las relaciones (lugar de un evento, personas con rol, integrantes) quedan, y quienes las
 * leen se saltean el perfil borrado. D1 de miniflare; datos inventados.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import { ANON } from '$lib/server/objects/index.js';
import { saveObject } from '$lib/server/objects/save.js';
import { makeProfile } from '$lib/server/amigues/testing.js';
import { groupMembers } from '$lib/server/amigues/profiles.js';
import { publicVenueForEvent, setEventVenue } from '$lib/server/amigues/venues.js';
import { publicProfilesBySlug, resolvePersonas } from '$lib/server/personas/index.js';
import { listAudit } from './audit.js';
import {
	UndoError,
	dbProfileDeletionPlan,
	dbProfileDependents,
	dbProfileIdOf,
	dbProfilePath,
	deleteBackend,
	deleteDbProfile,
	getDeletion,
	listRecoverable,
	undoDeletion
} from './deletions.js';

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
});

const NOW = Date.parse('2031-03-01T12:00:00-03:00');
const actor = { login: 'admin-de-prueba', name: 'Admin de Prueba', token: 'tok', locals: {} };

/** Un cliente del repo que no se tiene que usar nunca. */
const noRepo = new Proxy(
	{},
	{
		get(_target, key) {
			return () => {
				throw new Error(`no debería tocar el repo (${String(key)})`);
			};
		}
	}
);

/** @param {number} id */
const objectRow = (id) =>
	t.db.prepare('SELECT version, deleted_at FROM objects WHERE id = ?1').bind(id).first();

/** @param {number} id */
const revisions = async (id) =>
	(
		await t.db
			.prepare(
				'SELECT version, deleted_at, source FROM object_revisions WHERE object_id = ?1 ORDER BY id'
			)
			.bind(id)
			.all()
	).results;

/** @param {import('$lib/server/objects/read.js').StoredObject} p */
const target = (p) => ({ id: p.id, version: p.version, title: p.title, urlSlug: p.slug });

describe('deleteBackend', () => {
	it('only amigues profiles without a .md go to the database', () => {
		expect(deleteBackend('amigues', { legacySlug: null })).toBe('objects');
		expect(deleteBackend('amigues', { legacySlug: 'Ficha_Inventada' })).toBe('repo');
		expect(deleteBackend('amigues', null)).toBe('repo');
		expect(deleteBackend('calendario', { legacySlug: null })).toBe('repo');
	});
	it('marks the deletion path so undo never goes to GitHub', () => {
		expect(dbProfilePath(42)).toBe('objeto:perfil:42');
		expect(dbProfileIdOf('objeto:perfil:42')).toBe(42);
		expect(dbProfileIdOf('src/lib/posts/amigues/Ficha.md')).toBeNull();
		expect(dbProfileIdOf('objeto:perfil:0')).toBeNull();
	});
});

describe('deleteDbProfile + undoDeletion', () => {
	it('soft-deletes with a revision and a recoverable row, then undoes it in the database', async () => {
		const p = await makeProfile(t.db, { title: 'Perfil Inventado' });
		const r = await deleteDbProfile(t.db, actor, target(p), { now: NOW });
		expect(r).toMatchObject({ publish: null, commit: null });

		expect(await objectRow(p.id)).toMatchObject({ version: p.version + 1, deleted_at: NOW });
		expect(await revisions(p.id)).toEqual([
			{ version: p.version + 1, deleted_at: NOW, source: 'panel' }
		]);
		const d = await getDeletion(t.db, r.id);
		expect(d).toMatchObject({
			kind: 'amigues',
			slug: p.slug,
			title: 'Perfil Inventado',
			path: `objeto:perfil:${p.id}`,
			status: 'borrado',
			media: [],
			deletedBy: 'admin-de-prueba'
		});
		expect((await listRecoverable(t.db)).map((x) => x.id)).toEqual([r.id]);
		expect((await listAudit(t.db))[0]).toMatchObject({
			action: 'profile.delete',
			targetType: 'profile',
			targetId: String(p.id)
		});

		const undo = await undoDeletion(/** @type {any} */ (noRepo), t.db, actor, r.id, {
			now: NOW + 1
		});
		expect(undo).toMatchObject({ mode: 'restored', publish: null, immediate: true });
		expect(await objectRow(p.id)).toMatchObject({ version: p.version + 2, deleted_at: null });
		expect((await revisions(p.id)).map((x) => x.source)).toEqual(['panel', 'deshacer']);
		expect((await getDeletion(t.db, r.id))?.status).toBe('recuperado');
		expect(await listRecoverable(t.db)).toEqual([]);
		expect((await listAudit(t.db))[0].action).toBe('profile.restore');

		await expect(
			undoDeletion(/** @type {any} */ (noRepo), t.db, actor, r.id, { now: NOW + 2 })
		).rejects.toBeInstanceOf(UndoError);
	});

	it('does not delete over a change saved in the meantime (and leaves no row behind)', async () => {
		const p = await makeProfile(t.db, { title: 'Perfil Inventado' });
		await saveObject(
			t.db,
			{ id: p.id, type: 'perfil', version: p.version, title: 'Otro Nombre Inventado' },
			{ actor: 'otre-admin' }
		);
		await expect(deleteDbProfile(t.db, actor, target(p), { now: NOW })).rejects.toThrow();
		expect((await objectRow(p.id))?.deleted_at).toBeNull();
		expect(await listRecoverable(t.db)).toEqual([]);
	});

	it('closes the deletion if the profile was already restored some other way', async () => {
		const p = await makeProfile(t.db, { title: 'Perfil Inventado' });
		const r = await deleteDbProfile(t.db, actor, target(p), { now: NOW });
		await saveObject(
			t.db,
			{ id: p.id, type: 'perfil', version: p.version + 1, deleted: false },
			{ actor: 'otre-admin' }
		);
		await expect(
			undoDeletion(/** @type {any} */ (noRepo), t.db, actor, r.id, { now: NOW + 1 })
		).rejects.toThrow('ya estaba recuperado');
		expect((await getDeletion(t.db, r.id))?.status).toBe('recuperado');
	});
});

describe('relations pointing to a deleted profile', () => {
	it('stay in the database, readers skip them, and they are back after undo', async () => {
		const venue = await makeProfile(t.db, { title: 'Lugar Inventado', kind: 'lugar' });
		const first = await makeProfile(t.db, { title: 'Persona Inventada' });
		const project = await makeProfile(t.db, {
			title: 'Proyecto Inventado',
			kind: 'proyecto',
			data: { show_members: true }
		});
		const persona = await saveObject(
			t.db,
			{
				id: first.id,
				type: 'perfil',
				version: first.version,
				edges: { es_integrante_de: [project.id] }
			},
			{ actor: 'admin-de-prueba' }
		);
		expect(
			await setEventVenue(t.db, {
				eventSlug: 'fiesta-inventada',
				venueId: venue.id,
				privacy: null,
				by: 'admin-de-prueba'
			})
		).toEqual({ ok: true });
		const metas = [
			{
				category: 'calendario',
				meta: { personas: [{ perfil: persona.slug, rol: 'Organiza' }] }
			},
			{ category: 'calendario', meta: { personas: [{ nombre: 'Nombre Libre', rol: 'Organiza' }] } }
		];
		const roles = ['Organiza'];

		// Antes de borrar: todo se ve.
		expect((await publicVenueForEvent(t.db, 'fiesta-inventada', ANON))?.level).not.toBe('hidden');
		expect((await resolvePersonas(t.db, metas[0].meta.personas, roles))[0].items).toHaveLength(1);
		const fresh = /** @type {any} */ (
			await t.db.prepare('SELECT * FROM objects WHERE id = ?1').bind(project.id).first()
		);
		const projectObj = { ...project, data: JSON.parse(fresh.data) };
		expect(await groupMembers(t.db, projectObj, ANON)).toEqual([
			{ slug: persona.slug, title: 'Persona Inventada' }
		]);

		// Lo que avisa el plan.
		const personaDeps = await dbProfileDependents(t.db, persona, metas);
		expect(personaDeps).toMatchObject({ personaOf: 1, memberOf: 1, venueOf: 0, managers: 0 });
		const venueDeps = await dbProfileDependents(t.db, venue, metas);
		expect(venueDeps).toMatchObject({ venueOf: 1, personaOf: 0 });
		const plan = dbProfileDeletionPlan({ slug: venue.slug, dependents: venueDeps });
		expect(plan).toMatchObject({ blockers: [], needsTyping: true });
		expect(plan.warnings[0]).toContain('Es el lugar de 1 evento');
		expect(
			dbProfileDeletionPlan({
				slug: 'nadie',
				dependents: { personaOf: 0, venueOf: 0, members: 0, memberOf: 0, managers: 0 }
			}).needsTyping
		).toBe(false);

		// Borrar el lugar y la persona.
		const dv = await deleteDbProfile(t.db, actor, target(venue), { now: NOW });
		const dp = await deleteDbProfile(t.db, actor, target(persona), { now: NOW });

		// Las relaciones quedan en la base…
		expect((await t.db.prepare('SELECT venue_id FROM event_venues').all()).results).toEqual([
			{ venue_id: venue.id }
		]);
		expect(
			(
				await t.db
					.prepare('SELECT from_id, to_id FROM edges WHERE kind = ?1')
					.bind('es_integrante_de')
					.all()
			).results
		).toEqual([{ from_id: persona.id, to_id: project.id }]);
		// …pero quienes leen se saltean el perfil borrado.
		expect(await publicVenueForEvent(t.db, 'fiesta-inventada', ANON)).toBeNull();
		expect(
			await publicVenueForEvent(t.db, 'fiesta-inventada', { role: 'admin', id: 'admin-de-prueba' })
		).toBeNull();
		expect(await resolvePersonas(t.db, metas[0].meta.personas, roles)).toEqual([]);
		expect((await publicProfilesBySlug(t.db, [persona.slug])).size).toBe(0);
		expect(await groupMembers(t.db, projectObj, ANON)).toEqual([]);
		expect(await groupMembers(t.db, projectObj, { role: 'admin', id: 'admin-de-prueba' })).toEqual(
			[]
		);

		// Deshacer: vuelve todo, sin volver a cargar nada.
		await undoDeletion(/** @type {any} */ (noRepo), t.db, actor, dv.id, { now: NOW + 1 });
		await undoDeletion(/** @type {any} */ (noRepo), t.db, actor, dp.id, { now: NOW + 1 });
		expect((await publicVenueForEvent(t.db, 'fiesta-inventada', ANON))?.level).not.toBe('hidden');
		expect((await resolvePersonas(t.db, metas[0].meta.personas, roles))[0].items).toHaveLength(1);
		expect(await groupMembers(t.db, projectObj, ANON)).toHaveLength(1);
	});
});
