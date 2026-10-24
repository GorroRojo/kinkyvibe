/**
 * La migración 0059 escribe `wiki_body_html: 'libre'` en las páginas de la wiki que ya están (texto
 * sin valor), para que se sigan viendo igual ahora que sin valor es la lista corta. Se aplica sobre
 * una base con todas las migraciones anteriores y filas inventadas para comprobar que cambia solo
 * esas etiquetas (vivas o borradas), que respeta un valor ya guardado, que no toca las etiquetas
 * sin texto ni otros tipos de objeto, que sube la versión de a 1 (lo pide el trigger de 0012) y que
 * se puede correr de nuevo sin efecto.
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
		if (f.endsWith('.sql') && f < '0059')
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
	const sql = await readFile(path.join('migrations', '0059_wiki_html_libre_explicito.sql'), 'utf8');
	const statements = unstable_splitSqlQuery(sql).filter((s) => s.trim());
	await t.db.batch(statements.map((s) => t.db.prepare(s)));
}

async function rows() {
	const { results } = await t.db
		.prepare('SELECT type, slug, data, version, updated_at, updated_by FROM objects ORDER BY id')
		.all();
	return results.map((r) => ({ ...r, data: JSON.parse(String(r.data)) }));
}

describe('migración 0059 (HTML libre explícito en las páginas de la wiki que ya están)', () => {
	it('escribe libre solo en las etiquetas con texto y sin valor, y se puede repetir', async () => {
		await t.db.batch([
			t.db.prepare(
				`INSERT INTO object_types (type, origin, created_at) VALUES
				('etiqueta', 'core', ${NOW}), ('evento', 'core', ${NOW})`
			),
			object('etiqueta', 'pagina-vieja', {
				key: 'pagina vieja',
				body: '## Un texto\n\n<div class="x">inventado</div>',
				wiki_title: 'Página vieja'
			}),
			object(
				'etiqueta',
				'pagina-borrada',
				{ key: 'pagina borrada', body: 'Texto.' },
				{ deleted: true }
			),
			object('etiqueta', 'pagina-corta', {
				key: 'pagina corta',
				body: 'Texto.',
				wiki_body_html: 'corta'
			}),
			object('etiqueta', 'pagina-libre', {
				key: 'pagina libre',
				body: 'Texto.',
				wiki_body_html: 'libre'
			}),
			object('etiqueta', 'sin-texto', { key: 'sin texto', wiki_title: 'Solo título' }),
			object('etiqueta', 'etiqueta-sola', { key: 'etiqueta sola', color: 'darkblue' }),
			// Otro tipo con un texto: no se toca (sus textos usan `body_html`).
			object('evento', 'evento-inventado', { body: 'Texto.' })
		]);

		await runMigration();
		const after = await rows();
		/** @param {string} slug */
		const row = (slug) => after.find((r) => /** @type {{ slug?: unknown }} */ (r).slug === slug);
		expect(row('pagina-vieja')).toEqual({
			type: 'etiqueta',
			slug: 'pagina-vieja',
			data: {
				key: 'pagina vieja',
				body: '## Un texto\n\n<div class="x">inventado</div>',
				wiki_title: 'Página vieja',
				wiki_body_html: 'libre'
			},
			version: 2,
			updated_at: NOW,
			updated_by: 'cuenta:inventada'
		});
		expect(row('pagina-borrada')).toMatchObject({
			data: { key: 'pagina borrada', body: 'Texto.', wiki_body_html: 'libre' },
			version: 2
		});
		expect(row('pagina-corta')).toMatchObject({
			data: { key: 'pagina corta', body: 'Texto.', wiki_body_html: 'corta' },
			version: 1
		});
		expect(row('pagina-libre')).toMatchObject({
			data: { key: 'pagina libre', body: 'Texto.', wiki_body_html: 'libre' },
			version: 1
		});
		expect(row('sin-texto')).toEqual(
			expect.objectContaining({ data: { key: 'sin texto', wiki_title: 'Solo título' }, version: 1 })
		);
		expect(row('etiqueta-sola')).toMatchObject({
			data: { key: 'etiqueta sola', color: 'darkblue' },
			version: 1
		});
		expect(row('evento-inventado')).toMatchObject({ data: { body: 'Texto.' }, version: 1 });

		// Correrla de nuevo no cambia nada (ni la versión).
		await runMigration();
		expect(await rows()).toEqual(after);
	});
});
