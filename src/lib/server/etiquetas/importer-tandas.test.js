/**
 * La importación de etiquetas escribe de a tandas (`saveObjects`): muchas menos consultas que de a
 * una, y la base queda EXACTAMENTE igual que importando de a una (`chunk: 1`, el camino de
 * siempre). Si una tanda no entra (una etiqueta inválida), se hace de a una y cada etiqueta
 * informa lo mismo que antes. D1 de miniflare; la semilla de etiquetas y de la wiki.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { seedRawsByPath } from '$lib/server/semilla/testing.js';
import { countingDB, createTestDB, resetDB } from '$lib/server/db/testing.js';
import seedTagList from '$lib/server/semilla/etiquetas.json';
import { importTags } from './importer.js';

vi.setConfig({ testTimeout: 300_000, hookTimeout: 60_000 });

const wikiRaw = /** @type {Record<string, string>} */ (seedRawsByPath('wiki'));
const wikiFiles = Object.entries(wikiRaw).map(([p, raw]) => ({
	name: p.slice(p.lastIndexOf('/') + 1, -3),
	raw
}));
/** @returns {Record<string, unknown>[]} */
const fresh = () => JSON.parse(JSON.stringify(seedTagList));
const ACTOR = 'admin-de-prueba';
const NOW = Date.parse('2026-10-01T12:00:00Z');

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

/**
 * Lo que escribió la importación, tal cual, con cada id cambiado por la dirección de su objeto
 * (`resetDB` no reinicia los ids: dos corridas en la misma base dan ids distintos).
 */
async function dump() {
	/** @param {string} sql @returns {Promise<Record<string, any>[]>} */
	const all = async (sql) => (await t.db.prepare(sql).all()).results;
	const objects = await all(
		`SELECT id, type, slug, title, data, search_text, visibility, version, created_at,
			created_by, updated_at, updated_by, deleted_at FROM objects ORDER BY id`
	);
	const slugOf = new Map(objects.map((o) => [Number(o.id), String(o.slug)]));
	const ref = (/** @type {unknown} */ id) => slugOf.get(Number(id)) ?? `?${id}`;
	return {
		slugOf,
		objects: objects.map(({ id, ...o }) => ({ ...o, ref: ref(id) })),
		edges: (
			await all(
				'SELECT from_id, kind, to_id, position, data, created_at, created_by FROM edges ORDER BY from_id, kind, to_id'
			)
		).map(({ from_id, to_id, ...e }) => ({ ...e, from: ref(from_id), to: ref(to_id) })),
		sources: (await all('SELECT * FROM tag_sources ORDER BY tag_id')).map(({ tag_id, ...r }) => ({
			...r,
			tag: ref(tag_id)
		})),
		types: await all('SELECT type, origin FROM object_types ORDER BY type')
	};
}

/**
 * Los resultados con la dirección de cada etiqueta en vez de su id.
 * @param {import('./importer.js').TagImportResult[]} results
 * @param {Map<number, string>} slugOf
 */
const byRef = (results, slugOf) =>
	results.map(({ id, ...r }) => ({ ...r, ref: id === null ? null : slugOf.get(id) }));

/** La base sin el mapa de ids. @param {Awaited<ReturnType<typeof dump>>} d */
const tables = ({ slugOf: _slugOf, ...d }) => d;

/**
 * @param {Record<string, unknown>[]} rawTags
 * @param {{ chunk?: number, budget?: number }} [opts]
 */
async function run(rawTags, opts = {}) {
	const counted = countingDB(t.db);
	const t0 = performance.now();
	const out = await importTags(
		counted.db,
		{ rawTags, wikiFiles },
		{ actor: ACTOR, now: NOW, ...opts }
	);
	return { ...out, queries: counted.log.length, ms: performance.now() - t0 };
}

describe('importar etiquetas de a tandas', () => {
	it('la base queda igual que de a una, con muchas menos consultas', async () => {
		const one = await run(fresh(), { chunk: 1 });
		const oneByOne = await dump();
		await resetDB(t.db);
		const batched = await run(fresh());
		const inBatches = await dump();

		expect(byRef(batched.results, inBatches.slugOf)).toEqual(byRef(one.results, oneByOne.slugOf));
		expect(batched.warnings).toEqual(one.warnings);
		expect(tables(inBatches)).toEqual(tables(oneByOne));
		expect(inBatches.objects.length).toBeGreaterThan(100);
		expect(batched.results.every((r) => r.action === 'created')).toBe(true);

		console.log(
			`importTags: ${inBatches.objects.length} etiquetas; de a una ${one.queries} consultas (${one.ms.toFixed(0)} ms), de a tandas ${batched.queries} (${batched.ms.toFixed(0)} ms)`
		);
		// De a una: 2 consultas por etiqueta al crearla y 4 al completarla (antes, siempre así).
		expect(one.queries).toBeGreaterThan(inBatches.objects.length * 5);
		// De a tandas: unas pocas por tanda de 25.
		expect(batched.queries).toBeLessThan(one.queries / 10);
	});

	it('con `budget` (el panel, por tandas) llega a lo mismo', async () => {
		await run(fresh(), { chunk: 1 });
		const oneByOne = await dump();
		await resetDB(t.db);
		let guard = 0;
		for (;;) {
			const r = await run(fresh(), { budget: 60 });
			if (!r.pending || ++guard > 50) break;
		}
		const inBatches = await dump();
		// El orden de los guardados depende de las corridas: se compara lo que importa.
		/** @param {Awaited<ReturnType<typeof dump>>} d */
		const shape = (d) => ({
			objects: d.objects
				.map((/** @type {any} */ o) => ({ slug: o.slug, title: o.title, data: o.data }))
				.sort((a, b) => String(a.slug).localeCompare(String(b.slug))),
			edges: d.edges
				.map((/** @type {any} */ e) => `${e.from} ${e.kind} ${e.to} ${e.position}`)
				.sort()
		});
		expect(shape(inBatches)).toEqual(shape(oneByOne));
	});

	it('una etiqueta inválida en una tanda: las demás entran y esa informa el error de siempre', async () => {
		// Un nombre de más de 200 letras no entra como título de una etiqueta.
		const bad = 'x'.repeat(250);
		const withBad = () => [...fresh().slice(0, 10), { id: bad }, ...fresh().slice(10, 30)];
		const one = await run(withBad(), { chunk: 1 });
		const oneByOne = await dump();
		await resetDB(t.db);
		const batched = await run(withBad());
		const inBatches = await dump();
		expect(byRef(batched.results, inBatches.slugOf)).toEqual(byRef(one.results, oneByOne.slugOf));
		expect(batched.results.find((r) => r.key === bad)).toMatchObject({ action: 'error' });
		expect(batched.results.filter((r) => r.action === 'error')).toHaveLength(1);
		expect(tables(inBatches)).toEqual(tables(oneByOne));
	});

	it('la segunda vez no cambia nada (y casi no consulta)', async () => {
		await run(fresh());
		const before = await dump();
		const again = await run(fresh());
		expect(again.results.every((r) => r.action === 'unchanged')).toBe(true);
		expect(tables(await dump())).toEqual(tables(before));
		expect(again.queries).toBe(2);
	});
});
