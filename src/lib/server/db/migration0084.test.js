/**
 * La migración 0084 reconstruye `signup_fields` para que las preguntas de inscripción acepten los
 * tipos de los formularios (y suma `settings`). Se aplica sobre una base con datos hasta 0083 para
 * comprobar que no pierde preguntas ni lo que eligió cada evento (`event_signup_general`, con `ON
 * DELETE CASCADE` hacia `signup_fields`, que el `DROP TABLE` borraría sin la copia), que conserva
 * los ids y que una pregunta nueva no reusa el id de una borrada del todo.
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
		if (f.endsWith('.sql') && f < '0084')
			await copyFile(path.join('migrations', f), path.join(before, f));
	}
	await applyMigrations(t.db, before);
});
afterAll(async () => {
	await t?.dispose();
	if (before) await rm(before, { recursive: true, force: true });
});

const NOW = Date.parse('2026-11-01T12:00:00Z');

/** @param {string | null} slug @param {string} label @param {string} kind @param {string} [extra] */
const field = (slug, label, kind, extra = '') =>
	t.db
		.prepare(
			`INSERT INTO signup_fields (event_slug, label, kind, options, created_at, updated_at,
				updated_by${extra ? ', per_ticket, ticket_types, short_label, deleted_at' : ''})
			VALUES (?1, ?2, ?3, '[]', ${NOW}, ${NOW}, 'prueba'${extra ? `, ${extra}` : ''})`
		)
		.bind(slug, label, kind);

describe('migración 0084 (todos los tipos en las preguntas de inscripción)', () => {
	it('conserva preguntas, ids y lo que eligió cada evento, y acepta los tipos nuevos', async () => {
		await t.db.batch([
			field(null, '¿Primera vez?', 'choice'),
			field('fiesta', '¿Algo más?', 'text', `1, '["vip"]', 'Algo', NULL`),
			field('fiesta', 'Borrada', 'checkbox', `0, '[]', NULL, ${NOW}`),
			field('fiesta', 'Borrada del todo', 'text')
		]);
		// Una pregunta borrada del todo (antes de los borrados suaves): su id no vuelve.
		await t.db.prepare("DELETE FROM signup_fields WHERE label = 'Borrada del todo'").run();
		await t.db
			.prepare(
				`INSERT INTO event_signup_general (event_slug, field_id, position, ticket_types)
				VALUES ('fiesta', 1, 0, '["general"]')`
			)
			.run();
		await expect(field('fiesta', 'Fecha', 'date').run()).rejects.toThrow(/CHECK/);

		const sql = await readFile(
			path.join('migrations', '0084_preguntas_todos_los_tipos.sql'),
			'utf8'
		);
		const statements = unstable_splitSqlQuery(sql).filter((s) => s.trim());
		await t.db.batch(statements.map((s) => t.db.prepare(s)));

		const rows = (
			await t.db
				.prepare(
					`SELECT id, event_slug, label, kind, per_ticket, ticket_types, short_label, deleted_at,
						settings FROM signup_fields ORDER BY id`
				)
				.all()
		).results;
		expect(rows).toEqual([
			{
				id: 1,
				event_slug: null,
				label: '¿Primera vez?',
				kind: 'choice',
				per_ticket: 0,
				ticket_types: '[]',
				short_label: null,
				deleted_at: null,
				settings: '{}'
			},
			{
				id: 2,
				event_slug: 'fiesta',
				label: '¿Algo más?',
				kind: 'text',
				per_ticket: 1,
				ticket_types: '["vip"]',
				short_label: 'Algo',
				deleted_at: null,
				settings: '{}'
			},
			{
				id: 3,
				event_slug: 'fiesta',
				label: 'Borrada',
				kind: 'checkbox',
				per_ticket: 0,
				ticket_types: '[]',
				short_label: null,
				deleted_at: NOW,
				settings: '{}'
			}
		]);
		expect((await t.db.prepare('SELECT * FROM event_signup_general').all()).results).toEqual([
			{ event_slug: 'fiesta', field_id: 1, position: 0, ticket_types: '["general"]' }
		]);
		expect(
			(await t.db.prepare('PRAGMA foreign_key_check').all()).results,
			'sin foreign keys rotas'
		).toEqual([]);
		const tables = (
			await t.db.prepare("SELECT name FROM sqlite_master WHERE name LIKE 'kv_bak_%'").all()
		).results;
		expect(tables).toEqual([]);
		const idx = (await t.db.prepare("PRAGMA index_list('signup_fields')").all()).results.map(
			(r) => r.name
		);
		expect(idx).toContain('signup_fields_event');

		// Los tipos nuevos entran; una pregunta nueva sigue después del id más alto que se dio (4).
		const created = await field('fiesta', 'Fecha', 'date').run();
		expect(created.meta.last_row_id).toBe(5);
		await expect(
			t.db.prepare("UPDATE signup_fields SET settings = 'roto' WHERE id = 5").run()
		).rejects.toThrow(/CHECK/);
		// Y borrar la pregunta general sigue borrando lo que eligió cada evento.
		await t.db.prepare('DELETE FROM signup_fields WHERE id = 1').run();
		expect((await t.db.prepare('SELECT * FROM event_signup_general').all()).results).toEqual([]);
	});
});
