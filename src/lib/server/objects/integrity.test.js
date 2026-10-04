/**
 * El chequeo nocturno: la función pura encuentra cada problema; la versión con base no encuentra
 * nada en datos sanos y detecta un índice de búsqueda desincronizado.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createTestDB } from '../db/testing.js';
import {
	KEEP_RUNS,
	STORED_PROBLEMS,
	checkObjectsIntegrity,
	findIntegrityProblems,
	hasObjectsSchema,
	lastIntegrityRun,
	recordIntegrityRun
} from './integrity.js';
import { saveObject } from './save.js';
import { coreTypes, createRegistry } from './types/index.js';

vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

const START = '2026-10-02T20:00-03:00';
const ev = (/** @type {number} */ id, data = JSON.stringify({ start: START })) => ({
	id,
	type: 'evento',
	data,
	visibility: 'public',
	deleted_at: null
});
const place = (/** @type {number} */ id) => ({
	id,
	type: 'lugar',
	data: '{}',
	visibility: 'public',
	deleted_at: null
});
const CORE_ROWS = [
	{ type: 'evento', origin: 'core' },
	{ type: 'lugar', origin: 'core' }
];

/** @param {ReturnType<typeof findIntegrityProblems>} problems */
const codes = (problems) => problems.map((p) => p.code).sort();

describe('findIntegrityProblems (pura)', () => {
	it('datos sanos: sin problemas', () => {
		const problems = findIntegrityProblems({
			types: CORE_ROWS,
			objects: [ev(1), place(2)],
			edges: [{ id: 1, from_id: 1, kind: 'lugar', to_id: 2 }]
		});
		expect(problems).toEqual([]);
	});

	it('tipos inválidos: desconocido, sin registrar, núcleo que ya no existe o disfrazado de panel', () => {
		const problems = findIntegrityProblems({
			types: [
				{ type: 'evento', origin: 'core' },
				{ type: 'lugar', origin: 'panel' },
				{ type: 'nave', origin: 'core' }
			],
			objects: [ev(1), { ...place(2), type: 'nave' }, { ...place(3), type: 'fantasma' }],
			edges: []
		});
		expect(codes(problems)).toEqual([
			'type_not_registered',
			'type_origin_mismatch',
			'type_origin_mismatch',
			'unknown_type',
			'unknown_type'
		]);
		expect(problems.find((p) => p.code === 'type_not_registered')?.objectId).toBe(3);
	});

	it('los objetos de un tipo del panel no son "desconocidos"', () => {
		const problems = findIntegrityProblems({
			types: [...CORE_ROWS, { type: 'receta', origin: 'panel' }],
			objects: [{ ...place(1), type: 'receta' }],
			edges: []
		});
		expect(problems).toEqual([]);
	});

	it('datos que ya no valen (JSON roto, campo que el código ya no tiene) y visibilidad rara', () => {
		const problems = findIntegrityProblems({
			types: CORE_ROWS,
			objects: [
				ev(1, '{roto'),
				ev(2, JSON.stringify({ start: START, viejo: 1 })),
				{ ...place(3), visibility: 'secreto' }
			],
			edges: []
		});
		expect(codes(problems)).toEqual(['invalid_data', 'invalid_data', 'invalid_visibility']);
		expect(problems[1].message).toContain('viejo');
	});

	it('edges colgando (un extremo que no existe)', () => {
		const problems = findIntegrityProblems({
			types: CORE_ROWS,
			objects: [ev(1)],
			edges: [
				{ id: 7, from_id: 1, kind: 'lugar', to_id: 99 },
				{ id: 8, from_id: 98, kind: 'lugar', to_id: 1 }
			]
		});
		expect(problems.map((p) => [p.code, p.edgeId])).toEqual([
			['dangling_edge', 7],
			['dangling_edge', 8]
		]);
	});

	it('edges inválidos: kind que el tipo no tiene, destino de otro tipo, demasiados', () => {
		const problems = findIntegrityProblems({
			types: CORE_ROWS,
			objects: [ev(1), ev(2), place(3), place(4)],
			edges: [
				{ id: 1, from_id: 3, kind: 'lugar', to_id: 4 }, // un lugar no tiene "lugar"
				{ id: 2, from_id: 1, kind: 'lugar', to_id: 2 }, // un evento como lugar
				{ id: 3, from_id: 2, kind: 'lugar', to_id: 3 },
				{ id: 4, from_id: 2, kind: 'lugar', to_id: 4 } // dos lugares (máximo 1)
			]
		});
		expect(codes(problems)).toEqual(['invalid_edge', 'invalid_edge', 'too_many_edges']);
	});

	it('huérfanos: objetos vivos sin un edge obligatorio (los borrados no cuentan)', () => {
		const registry = createRegistry([
			...coreTypes.types.values(),
			{
				type: 'tramo',
				label: 'Tramo',
				fields: {},
				edges: { evento: { label: 'Evento', to: ['evento'], required: true } }
			}
		]);
		const tramo = (/** @type {number} */ id, deleted_at = /** @type {number | null} */ (null)) => ({
			id,
			type: 'tramo',
			data: '{}',
			visibility: 'public',
			deleted_at
		});
		const problems = findIntegrityProblems(
			{
				types: [...CORE_ROWS, { type: 'tramo', origin: 'core' }],
				objects: [ev(1), tramo(2), tramo(3), tramo(4, 123)],
				edges: [{ id: 1, from_id: 2, kind: 'evento', to_id: 1 }]
			},
			registry
		);
		expect(problems.map((p) => [p.code, p.objectId])).toEqual([['orphan', 3]]);
	});
});

describe('checkObjectsIntegrity (con base)', () => {
	/** @type {Awaited<ReturnType<typeof createTestDB>>} */
	let t;
	beforeAll(async () => {
		t = await createTestDB();
	});
	afterAll(async () => {
		await t?.dispose();
	});

	it('una base sana no tiene problemas', async () => {
		expect(await hasObjectsSchema(t.db)).toBe(true);
		const ctx = { actor: 'admin-inventade' };
		const lugar = await saveObject(t.db, { type: 'lugar', title: 'Salón Inventado' }, ctx);
		await saveObject(
			t.db,
			{
				type: 'evento',
				title: 'Evento Inventado',
				data: { start: START },
				edges: { lugar: [lugar.id] }
			},
			ctx
		);
		expect(await checkObjectsIntegrity(t.db)).toEqual([]);
	});

	it('detecta el índice de búsqueda desincronizado', async () => {
		await t.db
			.prepare("INSERT INTO objects_fts (rowid, title, search_text) VALUES (777, 'fantasma', '')")
			.run();
		const problems = await checkObjectsIntegrity(t.db);
		expect(codes(problems)).toEqual(['fts_out_of_sync']);
		// Se arregla con 'rebuild'.
		await t.db.prepare("INSERT INTO objects_fts (objects_fts) VALUES ('rebuild')").run();
		expect(await checkObjectsIntegrity(t.db)).toEqual([]);
	});

	it('detecta datos que el código de hoy ya no acepta', async () => {
		// Simula un cambio de código: el registro de hoy no conoce `summary` de evento.
		const evento = /** @type {import('./types/index.js').CoreType} */ (coreTypes.get('evento'));
		const lugar = /** @type {import('./types/index.js').CoreType} */ (coreTypes.get('lugar'));
		// El evento tiene edges `persona` hacia perfiles: el registro tiene que conocer ese tipo.
		const perfil = /** @type {import('./types/index.js').CoreType} */ (coreTypes.get('perfil'));
		// Y edges `etiqueta` hacia etiquetas (migración 0042).
		const etiqueta = /** @type {import('./types/index.js').CoreType} */ (coreTypes.get('etiqueta'));
		const fields = { ...evento.fields };
		delete fields.summary;
		// `imagen`: evento y perfil pueden apuntar a una imagen (docs/imagenes.md).
		const imagen = /** @type {import('./types/index.js').CoreType} */ (coreTypes.get('imagen'));
		const registry = createRegistry([{ ...evento, fields }, lugar, perfil, imagen, etiqueta]);
		const ctx = { actor: 'admin-inventade' };
		await saveObject(
			t.db,
			{ type: 'evento', title: 'Con resumen', data: { start: START, summary: 'hola' } },
			ctx
		);
		expect(codes(await checkObjectsIntegrity(t.db, { registry }))).toEqual(['invalid_data']);
	});
});

describe('integrity_runs: el resultado queda guardado para el panel', () => {
	/** @type {Awaited<ReturnType<typeof createTestDB>>} */
	let t;
	beforeAll(async () => {
		t = await createTestDB();
	});
	afterAll(async () => {
		await t?.dispose();
	});

	it('sin corridas: null', async () => {
		expect(await lastIntegrityRun(t.db)).toBeNull();
	});

	it('guarda código, ids, tipo y slug (no el mensaje) y devuelve la última', async () => {
		const ctx = { actor: 'admin-inventade' };
		const lugar = await saveObject(t.db, { type: 'lugar', title: 'Salón Inventado' }, ctx);
		const problems = findIntegrityProblems({
			types: CORE_ROWS,
			objects: [{ ...place(lugar.id), slug: lugar.slug, visibility: 'secreto' }],
			edges: [{ id: 9, from_id: lugar.id, kind: 'lugar', to_id: 999 }]
		});
		expect(problems.find((p) => p.code === 'invalid_visibility')?.slug).toBe('salon-inventado');

		await recordIntegrityRun(t.db, [], 1000);
		await recordIntegrityRun(t.db, problems, 2000);
		expect(await lastIntegrityRun(t.db)).toEqual({
			ranAt: 2000,
			count: 2,
			problems: [
				{ code: 'invalid_visibility', objectId: lugar.id, slug: 'salon-inventado' },
				{ code: 'dangling_edge', edgeId: 9 }
			]
		});
	});

	it(`guarda como mucho ${STORED_PROBLEMS} problemas (el total aparte) y las últimas ${KEEP_RUNS} corridas`, async () => {
		const many = Array.from({ length: STORED_PROBLEMS + 7 }, (_, i) => ({
			code: /** @type {const} */ ('orphan'),
			message: 'x',
			objectId: i + 1
		}));
		for (let i = 0; i < KEEP_RUNS + 5; i++) await recordIntegrityRun(t.db, many, 10_000 + i);
		const last = await lastIntegrityRun(t.db);
		expect(last?.count).toBe(STORED_PROBLEMS + 7);
		expect(last?.problems.length).toBe(STORED_PROBLEMS);
		expect(last?.ranAt).toBe(10_000 + KEEP_RUNS + 4);
		expect(await t.db.prepare('SELECT count(*) AS n FROM integrity_runs').first()).toEqual({
			n: KEEP_RUNS
		});
	});

	it('sin la migración 0012 devuelve null en vez de tirar error', async () => {
		const bare = await createTestDB({ migrate: false });
		try {
			expect(await lastIntegrityRun(bare.db)).toBeNull();
			expect(await hasObjectsSchema(bare.db)).toBe(false);
		} finally {
			await bare.dispose();
		}
	});
});
