/**
 * Las etiquetas y sus relaciones se leen en una sola tanda (./read.js, `loadTagRecords`): una ida
 * y vuelta a la base en vez de dos en fila (cada pedido sin el árbol recordado la hace). Lo mismo
 * que leer las dos consultas por separado. D1 de miniflare; la semilla de etiquetas (pública).
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { countingDB, createTestDB } from '$lib/server/db/testing.js';
import { loadSeed } from '$lib/server/semilla/index.js';
import etiquetas from '$lib/server/semilla/etiquetas.json';
import { loadTagRecords, readTagRecords, tagRecordsStatements } from './read.js';

vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 });

/** @type {Awaited<ReturnType<typeof createTestDB>>} */
let t;
beforeAll(async () => {
	t = await createTestDB();
	const r = await loadSeed(
		t.db,
		{ etiquetas, wiki: [], amigues: [], calendario: [], material: [] },
		{ actor: 'prueba' }
	);
	expect(r.errors).toEqual([]);
});
afterAll(async () => {
	await t?.dispose();
});

describe('loadTagRecords', () => {
	it('una sola tanda, con lo mismo que las dos consultas por separado', async () => {
		const counted = countingDB(t.db);
		const records = await loadTagRecords(counted.db);
		expect(counted.queries).toBe(1);
		expect(counted.waves).toBe(1);
		const [objects, relations] = tagRecordsStatements(t.db);
		const apart = readTagRecords((await objects.all()).results, (await relations.all()).results);
		expect(records).toEqual(apart);
		expect(records.length).toBeGreaterThan(100);
		expect(records.some((r) => r.parents?.length)).toBe(true);
	});
});
