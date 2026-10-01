/**
 * La migración 0023 pasa los perfiles con `kind: 'grupo'` a `proyecto`. Se aplica sobre una base
 * con todas las migraciones anteriores y filas inventadas para comprobar que cambia solo esos
 * perfiles (vivos o borrados), que no toca el resto de sus datos ni otros tipos de objeto, que
 * sube la versión de a 1 (lo pide el trigger de 0012) y que se puede correr de nuevo sin efecto.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { copyFile, mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { unstable_splitSqlQuery } from 'wrangler';
import { applyMigrations, createTestDB } from './testing.js';

/** @type {Awaited<ReturnType<typeof createTestDB>>} */
let t;
/** @type {string} */
let before;

beforeAll(async () => {
	t = await createTestDB({ migrate: false });
	before = await mkdtemp(path.join(os.tmpdir(), 'kv-mig-'));
	for (const f of await readdir('migrations')) {
		if (f.endsWith('.sql') && f < '0023')
			await copyFile(path.join('migrations', f), path.join(before, f));
	}
	await applyMigrations(t.db, before);
});
afterAll(async () => {
	await t?.dispose();
	if (before) await rm(before, { recursive: true, force: true });
});

const NOW = Date.parse('2026-10-01T12:00:00Z');

/**
 * @param {string} type
 * @param {string} slug
 * @param {Record<string, unknown>} data
 * @param {{ deleted?: boolean }} [o]
 */
function object(type, slug, data, { deleted = false } = {}) {
	return t.db
		.prepare(
			`INSERT INTO objects (type, slug, title, data, created_at, created_by, updated_at, updated_by, deleted_at)
			VALUES (?1, ?2, ?3, ?4, ?5, 'cuenta:inventada', ?5, 'cuenta:inventada', ?6)`
		)
		.bind(type, slug, `Título ${slug}`, JSON.stringify(data), NOW, deleted ? NOW : null);
}

async function runMigration() {
	const sql = await readFile(path.join('migrations', '0023_perfil_proyecto.sql'), 'utf8');
	const statements = unstable_splitSqlQuery(sql).filter((s) => s.trim());
	await t.db.batch(statements.map((s) => t.db.prepare(s)));
}

async function rows() {
	const { results } = await t.db
		.prepare('SELECT type, slug, data, version, updated_at, updated_by FROM objects ORDER BY id')
		.all();
	return results.map((r) => ({ ...r, data: JSON.parse(String(r.data)) }));
}

describe('migración 0023 (el tipo de perfil «grupo» pasa a «proyecto»)', () => {
	it('pasa a proyecto solo los perfiles grupo, sin tocar nada más, y se puede repetir', async () => {
		await t.db.batch([
			t.db.prepare(
				`INSERT INTO object_types (type, origin, created_at) VALUES
				('perfil', 'core', ${NOW}), ('evento', 'core', ${NOW})`
			),
			object('perfil', 'proyecto-viejo', {
				kind: 'grupo',
				bio: 'Un proyecto inventado',
				links: ['https://ejemplo.test/a'],
				show_members: true
			}),
			object('perfil', 'proyecto-borrado', { kind: 'grupo' }, { deleted: true }),
			object('perfil', 'persona-inventada', { kind: 'persona', pronouns: 'elle' }),
			object('perfil', 'proyecto-nuevo', { kind: 'proyecto' }),
			// Otro tipo con un campo que casualmente se llama igual: no se toca.
			object('evento', 'evento-inventado', { kind: 'grupo' })
		]);

		await runMigration();
		const after = await rows();
		expect(after).toEqual([
			{
				type: 'perfil',
				slug: 'proyecto-viejo',
				data: {
					kind: 'proyecto',
					bio: 'Un proyecto inventado',
					links: ['https://ejemplo.test/a'],
					show_members: true
				},
				version: 2,
				updated_at: NOW,
				updated_by: 'cuenta:inventada'
			},
			{
				type: 'perfil',
				slug: 'proyecto-borrado',
				data: { kind: 'proyecto' },
				version: 2,
				updated_at: NOW,
				updated_by: 'cuenta:inventada'
			},
			{
				type: 'perfil',
				slug: 'persona-inventada',
				data: { kind: 'persona', pronouns: 'elle' },
				version: 1,
				updated_at: NOW,
				updated_by: 'cuenta:inventada'
			},
			{
				type: 'perfil',
				slug: 'proyecto-nuevo',
				data: { kind: 'proyecto' },
				version: 1,
				updated_at: NOW,
				updated_by: 'cuenta:inventada'
			},
			{
				type: 'evento',
				slug: 'evento-inventado',
				data: { kind: 'grupo' },
				version: 1,
				updated_at: NOW,
				updated_by: 'cuenta:inventada'
			}
		]);

		// Correrla de nuevo no cambia nada (ni la versión).
		await runMigration();
		expect(await rows()).toEqual(after);
	});
});
