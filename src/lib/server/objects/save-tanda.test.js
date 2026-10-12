/**
 * saveObjects (./save.js): varios guardados en una sola tanda, con las mismas reglas y el mismo
 * resultado que saveObject de a uno; si algo no pasa, tira y no escribe nada. D1 de miniflare;
 * objetos inventados.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { countingDB, createTestDB, resetDB } from '../db/testing.js';
import { ObjectError } from './errors.js';
import { saveObject, saveObjects } from './save.js';

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

const ctx = { actor: 'admin-inventade', now: Date.parse('2026-10-01T12:00:00Z') };

/** Los objetos y edges, sin ids (para comparar dos corridas en la misma base). */
async function dump() {
	const { results: objects } = await t.db
		.prepare(
			`SELECT id, type, slug, title, data, search_text, visibility, version, created_at,
				created_by, updated_at, updated_by, deleted_at FROM objects ORDER BY id`
		)
		.all();
	const slugOf = new Map(objects.map((o) => [Number(o.id), `${o.type}/${o.slug}`]));
	const { results: edges } = await t.db
		.prepare('SELECT from_id, kind, to_id, position, data FROM edges ORDER BY from_id, kind, to_id')
		.all();
	return {
		objects: objects.map(({ id: _id, ...o }) => o),
		edges: edges.map(({ from_id, to_id, ...e }) => ({
			...e,
			from: slugOf.get(Number(from_id)),
			to: slugOf.get(Number(to_id))
		}))
	};
}

/** @returns {Promise<number>} */
const count = async () =>
	Number((await t.db.prepare('SELECT count(*) AS n FROM objects').first())?.n ?? 0);

/**
 * Etiquetas inventadas: tres nuevas y, en una segunda vuelta, las tres editadas con relaciones
 * entre ellas.
 * @param {(input: any) => Promise<any>} saveOne
 */
async function scenario(saveOne) {
	const names = ['Cuerda Inventada', 'Nudo Inventado', 'Atadura Inventada'];
	const made = [];
	for (const name of names)
		made.push(await saveOne({ type: 'etiqueta', title: name, data: { key: name } }));
	return made;
}

describe('saveObjects', () => {
	it('crea y edita igual que saveObject de a uno, en pocas consultas', async () => {
		// De a uno.
		const one = await scenario((input) => saveObject(t.db, input, ctx));
		for (const [i, o] of one.entries()) {
			await saveObject(
				t.db,
				{
					id: o.id,
					type: 'etiqueta',
					version: o.version,
					title: o.title,
					data: { key: o.data.key, description: `Texto ${i}` },
					edges: { relacionada_con: one.filter((x) => x.id !== o.id).map((x) => x.id) }
				},
				ctx
			);
		}
		const oneByOne = await dump();
		await resetDB(t.db);

		// En tandas.
		const counted = countingDB(t.db);
		const created = await saveObjects(
			counted.db,
			['Cuerda Inventada', 'Nudo Inventado', 'Atadura Inventada'].map((name) => ({
				input: { type: 'etiqueta', title: name, data: { key: name } }
			})),
			ctx
		);
		expect(created.map((o) => o.title)).toEqual([
			'Cuerda Inventada',
			'Nudo Inventado',
			'Atadura Inventada'
		]);
		const edited = await saveObjects(
			counted.db,
			created.map((o, i) => ({
				input: {
					id: o.id,
					type: 'etiqueta',
					version: o.version,
					title: o.title,
					data: { key: o.data.key, description: `Texto ${i}` },
					edges: { relacionada_con: created.filter((x) => x.id !== o.id).map((x) => x.id) }
				}
			})),
			ctx
		);
		expect(edited.map((o) => o.version)).toEqual([2, 2, 2]);
		expect(await dump()).toEqual(oneByOne);
		// Crear: la tanda y releer (2). Editar: leer, destinos, tanda y releer (4).
		expect(counted.log.length).toBe(6);
	});

	it('las tablas de apoyo (`also`) de cada uno van en la misma tanda', async () => {
		const [a, b] = await saveObjects(
			t.db,
			['Uno Inventado', 'Dos Inventado'].map((name) => ({
				input: { type: 'etiqueta', title: name, data: { key: name } },
				also: (/** @type {any} */ self) => [
					t.db
						.prepare(
							`INSERT INTO tag_sources (tag_id, source_key, source_hash, imported_version,
								imported_at, updated_at)
							SELECT id, ?3, ?4, 1, 0, 0 FROM objects WHERE type = ?1 AND slug = ?2`
						)
						.bind(self.type, self.slug, name, '0'.repeat(64))
				]
			})),
			ctx
		);
		const { results } = await t.db
			.prepare('SELECT tag_id, source_key FROM tag_sources ORDER BY tag_id')
			.all();
		expect(results).toEqual([
			{ tag_id: a.id, source_key: 'Uno Inventado' },
			{ tag_id: b.id, source_key: 'Dos Inventado' }
		]);
	});

	it('si uno no es válido, tira y no escribe ninguno', async () => {
		await expect(
			saveObjects(
				t.db,
				[
					{ input: { type: 'etiqueta', title: 'Bien Inventada', data: { key: 'Bien Inventada' } } },
					{ input: { type: 'etiqueta', title: '', data: { key: 'x' } } }
				],
				ctx
			)
		).rejects.toBeInstanceOf(ObjectError);
		expect(await count()).toBe(0);
	});

	it('si la tanda falla (dirección repetida), no escribe ninguno', async () => {
		await expect(
			saveObjects(
				t.db,
				[
					{ input: { type: 'etiqueta', title: 'Repetida', slug: 'repetida', data: { key: 'A' } } },
					{ input: { type: 'etiqueta', title: 'Repetida', slug: 'repetida', data: { key: 'B' } } }
				],
				ctx
			)
		).rejects.toThrow();
		expect(await count()).toBe(0);
	});

	it('un conflicto de versión aborta toda la tanda', async () => {
		const [a, b] = await scenario((input) => saveObject(t.db, input, ctx));
		await expect(
			saveObjects(
				t.db,
				[
					{ input: { id: a.id, type: 'etiqueta', version: a.version, title: 'Cambiada A' } },
					{ input: { id: b.id, type: 'etiqueta', version: b.version + 5, title: 'Cambiada B' } }
				],
				ctx
			)
		).rejects.toThrow();
		const row = await t.db
			.prepare('SELECT title, version FROM objects WHERE id = ?1')
			.bind(a.id)
			.first();
		expect(row).toEqual({ title: a.title, version: a.version });
	});

	it('un destino que no existe es el mismo error que de a uno', async () => {
		const [a] = await scenario((input) => saveObject(t.db, input, ctx));
		const input = {
			id: a.id,
			type: 'etiqueta',
			version: a.version,
			edges: { relacionada_con: [999_999] }
		};
		const single = await saveObject(t.db, input, ctx).catch((e) => e);
		const batch = await saveObjects(t.db, [{ input }], ctx).catch((e) => e);
		expect(batch).toBeInstanceOf(ObjectError);
		expect(batch.code).toBe(single.code);
		expect(batch.errors).toEqual(single.errors);
	});

	it('no acepta el mismo objeto dos veces ni borrar en una tanda', async () => {
		const [a] = await scenario((input) => saveObject(t.db, input, ctx));
		const edit = { id: a.id, type: 'etiqueta', version: a.version };
		await expect(saveObjects(t.db, [{ input: edit }, { input: edit }], ctx)).rejects.toThrow(
			'dos veces'
		);
		await expect(saveObjects(t.db, [{ input: { ...edit, deleted: true } }], ctx)).rejects.toThrow(
			'de a uno'
		);
		expect(await saveObjects(t.db, [], ctx)).toEqual([]);
	});
});
