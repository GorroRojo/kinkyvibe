/**
 * Editor de etiquetas contra la base: las mismas operaciones que el editor del archivo dan el
 * mismo árbol, se conserva lo que el archivo no tiene (texto de la wiki), renombrar mantiene el
 * objeto y deja alias, y solo se escribe lo que cambió.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import { applyTagOps } from '$lib/utils/tagConfig.js';
import { saveObject } from '../objects/save.js';
import { TAG_TYPE } from '../objects/types/etiqueta.js';
import { importTags } from './importer.js';
import { applyDbTagPlan, dbPreviewOf, planDbTagEdit } from './editor.js';
import { recordsToRawTags, tagsToRecords } from './model.js';
import { loadTagRecords } from './read.js';

vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

const ACTOR = 'admin-de-prueba';
const ADMIN = /** @type {const} */ ({ role: 'admin', id: ACTOR });

/** Un árbol chico e inventado. */
const RAW = [
	{ id: 'root', children: ['evento recurrente', 'prácticas', 'Etiqueta Oculta'] },
	{ id: 'evento recurrente', children: ['Serie Uno', 'Serie Dos', 'Serie Tres'] },
	{ id: 'Serie Uno', icon: '🎬', image: 'serie-uno.webp' },
	{ id: 'prácticas', children: ['ataduras', 'cuerdas'] },
	{ id: 'ataduras', aka: ['atar'], related: ['cuerdas'], description: 'Atar con [[cuerdas]].' },
	{ id: 'cuerdas', visible_name: 'Cuerdas' }
];
const WIKI = [
	{ name: 'ataduras', raw: '---\nwiki: ataduras\ntitle: Ataduras\n---\nTexto largo de la wiki.\n' }
];

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
	await importTags(
		t.db,
		{ rawTags: JSON.parse(JSON.stringify(RAW)), wikiFiles: WIKI },
		{ actor: ACTOR }
	);
	// Una etiqueta oculta, que el editor no tiene que borrar.
	const hidden = (await loadTagRecords(t.db)).find((r) => r.key === 'Etiqueta Oculta');
	if (hidden) {
		await saveObject(
			t.db,
			{ id: hidden.id, type: TAG_TYPE, version: hidden.version, visibility: 'hidden' },
			{ actor: ACTOR }
		);
	}
});

const stored = () => loadTagRecords(t.db, ADMIN);

/**
 * El árbol como lo arma el archivo: por etiqueta, sus datos, hijas en orden, relacionadas y
 * alias (sin ids ni números de orden).
 *
 * @param {import('./model.js').TagRecord[]} records
 */
function shape(records) {
	const raw = recordsToRawTags(records);
	return Object.fromEntries(
		raw.map((e) => [e.id, Object.fromEntries(Object.entries(e).filter(([k]) => k !== 'id'))])
	);
}

/**
 * Aplica `ops` con el editor de la base y devuelve lo esperado según el editor del archivo.
 *
 * @param {import('$lib/utils/tagConfig.js').TagOp[]} ops
 */
async function run(ops) {
	const current = await stored();
	const expected = tagsToRecords(
		applyTagOps(
			recordsToRawTags(current).map((value) => ({ value })),
			ops
		).map((e) => e.value)
	).records;
	const plan = planDbTagEdit(current, ops);
	const result = await applyDbTagPlan(t.db, plan, { actor: ACTOR });
	return { plan, result, expected };
}

describe('planDbTagEdit + applyDbTagPlan', () => {
	it('editar datos: solo se escribe esa etiqueta y se conserva su texto de la wiki', async () => {
		const { plan, result, expected } = await run([
			{ type: 'update', id: 'ataduras', set: { icon: '🪢', description: 'Nueva definición.' } }
		]);
		expect(result.errors).toEqual([]);
		expect(plan.writes.map((w) => w.key)).toEqual(['ataduras']);
		const after = await stored();
		expect(shape(after)).toEqual(shape(expected));
		const ataduras = after.find((r) => r.key === 'ataduras');
		expect(ataduras?.data).toMatchObject({
			icon: '🪢',
			description: 'Nueva definición.',
			body: 'Texto largo de la wiki.',
			wiki_title: 'Ataduras'
		});
		// La oculta sigue ahí.
		expect(after.some((r) => r.key === 'Etiqueta Oculta')).toBe(true);
	});

	it('renombrar sin alias (lo de siempre): el mismo objeto (y su texto), el nombre viejo deja de existir', async () => {
		const before = /** @type {any} */ ((await stored()).find((r) => r.key === 'ataduras'));
		const { result, expected } = await run([
			{ type: 'rename', from: 'ataduras', to: 'Bondage', keepAlias: false }
		]);
		expect(result.errors).toEqual([]);
		const after = await stored();
		expect(shape(after)).toEqual(shape(expected));
		const renamed = after.find((r) => r.key === 'Bondage');
		expect(renamed?.id).toBe(before.id);
		expect(renamed?.data.body).toBe('Texto largo de la wiki.');
		expect(after.some((r) => r.key === 'ataduras')).toBe(false);
		expect(after.find((r) => r.key === 'atar')?.aliasOf).toBe('Bondage');
	});

	it('renombrar dejando el alias: el mismo objeto (y su texto) y el nombre viejo como alias', async () => {
		const before = /** @type {any} */ ((await stored()).find((r) => r.key === 'ataduras'));
		const { result, expected, plan } = await run([
			{ type: 'rename', from: 'ataduras', to: 'Bondage', keepAlias: true }
		]);
		expect(result.errors).toEqual([]);
		const after = await stored();
		expect(shape(after)).toEqual(shape(expected));
		const renamed = after.find((r) => r.key === 'Bondage');
		expect(renamed?.id).toBe(before.id);
		expect(renamed?.data.body).toBe('Texto largo de la wiki.');
		expect(after.find((r) => r.key === 'ataduras')?.aliasOf).toBe('Bondage');
		expect(after.find((r) => r.key === 'atar')?.aliasOf).toBe('Bondage');
		// Las relacionadas de otras no cambian por el nombre: no se reescriben.
		expect(plan.writes.map((w) => w.key).sort()).toEqual(['Bondage', 'ataduras']);
	});

	it('mover y crear hijas: el orden queda como en el archivo', async () => {
		const { result, expected } = await run([
			{ type: 'move', id: 'Serie Tres', from: 'evento recurrente', to: 'prácticas' },
			{ type: 'create', id: 'Serie Cuatro', parent: 'evento recurrente', icon: '🎭' },
			{ type: 'move', id: 'Serie Uno', from: 'evento recurrente', to: 'evento recurrente' }
		]);
		expect(result.errors).toEqual([]);
		const after = await stored();
		expect(shape(after)).toEqual(shape(expected));
		expect(shape(after)['evento recurrente'].children).toEqual([
			'Serie Uno',
			'Serie Dos',
			'Serie Cuatro'
		]);
		expect(shape(after)['prácticas'].children).toEqual(['ataduras', 'cuerdas', 'Serie Tres']);
	});

	it('fusionar: la de origen pasa a alias, sus hijas y alias van a la otra', async () => {
		const { result, expected, plan } = await run([
			{ type: 'merge', from: 'ataduras', into: 'cuerdas' }
		]);
		expect(result.errors).toEqual([]);
		expect(plan.warnings.join(' ')).toMatch(/texto de la wiki/);
		const after = await stored();
		expect(shape(after)).toEqual(shape(expected));
		expect(after.find((r) => r.key === 'ataduras')?.aliasOf).toBe('cuerdas');
	});

	it('sacar un alias lo borra (suave)', async () => {
		const { result, expected, plan } = await run([
			{ type: 'removeAlias', id: 'ataduras', alias: 'atar' }
		]);
		expect(result.errors).toEqual([]);
		expect(plan.deletes.map((d) => d.key)).toEqual(['atar']);
		expect(shape(await stored())).toEqual(shape(expected));
	});

	it('una operación imposible tira un error para la persona y no escribe nada', async () => {
		const current = await stored();
		expect(() =>
			planDbTagEdit(current, [{ type: 'create', id: 'cuerdas', parent: 'prácticas' }])
		).toThrow(/Ya existe/);
		expect(() => planDbTagEdit(current, [])).toThrow(/No hay cambios/);
	});

	it('etiquetas del sistema: no se renombran ni se fusionan (con la base tampoco)', async () => {
		const current = await stored();
		expect(() =>
			planDbTagEdit(current, [{ type: 'rename', from: 'evento recurrente', to: 'Series' }])
		).toThrow(/etiqueta del sistema/);
		expect(() =>
			planDbTagEdit(current, [
				{ type: 'rename', from: 'evento recurrente', to: 'Series', keepAlias: false }
			])
		).toThrow(/no se puede renombrar/);
		expect(() =>
			planDbTagEdit(current, [{ type: 'merge', from: 'evento recurrente', into: 'prácticas' }])
		).toThrow(/no se puede fusionar/);
		// Lo demás sí: el nombre visible, y fusionar OTRA etiqueta adentro de la del sistema.
		expect(() =>
			planDbTagEdit(current, [
				{ type: 'update', id: 'evento recurrente', set: { visible_name: 'Series' } },
				{ type: 'merge', from: 'cuerdas', into: 'evento recurrente' }
			])
		).not.toThrow();
	});

	it('si alguien guardó mientras tanto, avisa y no pisa', async () => {
		const current = await stored();
		const plan = planDbTagEdit(current, [{ type: 'update', id: 'cuerdas', set: { icon: '🧵' } }]);
		const cuerdas = /** @type {any} */ (current.find((r) => r.key === 'cuerdas'));
		await saveObject(
			t.db,
			{ id: cuerdas.id, type: TAG_TYPE, version: cuerdas.version, title: 'Cuerdas!' },
			{ actor: ACTOR }
		);
		const result = await applyDbTagPlan(t.db, plan, { actor: ACTOR });
		expect(result.errors.join(' ')).toMatch(/recargá/);
		expect((await stored()).find((r) => r.key === 'cuerdas')?.title).toBe('Cuerdas!');
	});

	it('vista previa: un bloque por etiqueta que cambia', async () => {
		const plan = planDbTagEdit(await stored(), [
			{ type: 'update', id: 'Serie Uno', set: { icon: '🎞️' } }
		]);
		const preview = dbPreviewOf(plan);
		expect(preview.total).toBe(1);
		expect(preview.files[0].path).toBe('«Serie Uno» (cambia)');
		const lines = preview.files[0].hunks.flatMap((h) => h.lines);
		expect(lines).toContainEqual({ t: '-', s: 'ícono: 🎬' });
		expect(lines).toContainEqual({ t: '+', s: 'ícono: 🎞️' });
	});
});
