/**
 * Tipo núcleo `etiqueta`: campos, reglas y relaciones; y en una base de prueba, que el nombre en
 * los posts (`key`) sea único entre las etiquetas vivas (índice de la migración 0029).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import { saveObject } from '../save.js';
import { coreTypes, validateData } from './index.js';
import { COLOR, IMAGE_KEY, TAG_TYPE } from './etiqueta.js';

vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

const etiqueta = /** @type {import('./index.js').CoreType} */ (coreTypes.get(TAG_TYPE));

describe('etiqueta: datos', () => {
	it('solo el nombre en los posts es obligatorio; acepta los campos de hoy y la wiki', () => {
		expect(validateData(etiqueta, {})).toMatchObject({ ok: false });
		const r = validateData(etiqueta, {
			key: '  Rancheadita Kinky ',
			icon: '🧺',
			color: 'var(--3-dark)',
			description: 'Una serie [[inventada]].',
			image: 'rancheadita-kinky-miniatura.webp',
			body: 'Texto\r\nde la wiki',
			wiki_title: 'Rancheaditas',
			wiki_summary: 'Resumen',
			wiki_authors: ['Alguien Inventade', '']
		});
		expect(r).toEqual({
			ok: true,
			data: {
				key: 'Rancheadita Kinky',
				icon: '🧺',
				color: 'var(--3-dark)',
				description: 'Una serie [[inventada]].',
				image: 'rancheadita-kinky-miniatura.webp',
				body: 'Texto\nde la wiki',
				wiki_title: 'Rancheaditas',
				wiki_summary: 'Resumen',
				wiki_authors: ['Alguien Inventade']
			}
		});
	});

	it('colores, imágenes y nombres que no corresponden', () => {
		for (const ok of ['darkblue', '#ff4444', '#abc', 'var(--1)', 'var(--3-dark)']) {
			expect(COLOR.test(ok), ok).toBe(true);
		}
		for (const bad of ['red;background:url(x)', 'var(--1));', '#12', 'rgb(1,2,3)', '']) {
			expect(COLOR.test(bad), bad).toBe(false);
		}
		expect(IMAGE_KEY.test('picantearla-miniatura.webp')).toBe(true);
		expect(IMAGE_KEY.test('Serie_2.png')).toBe(true);
		for (const bad of ['../secreto.webp', 'https://otro.sitio/x.webp', 'a/b.webp', 'x.svg']) {
			expect(IMAGE_KEY.test(bad), bad).toBe(false);
		}
		const r = validateData(etiqueta, {
			key: 'mal [[nombre]]',
			color: 'red;x',
			image: 'https://otro.sitio/x.webp',
			otra: 'clave'
		});
		expect(r.ok).toBe(false);
		const paths = r.ok ? [] : r.errors.map((e) => e.path).sort();
		expect(paths).toEqual(['otra']);
		const r2 = validateData(etiqueta, {
			key: 'mal [[nombre]]',
			color: 'red;x',
			image: 'https://otro.sitio/x.webp'
		});
		expect(r2.ok ? [] : r2.errors.map((e) => e.path).sort()).toEqual(['color', 'image', 'key']);
		expect(validateData(etiqueta, { key: 'dos\nlíneas' }).ok).toBe(false);
	});

	it('relaciones: madres (varias), relacionadas y un solo «alias de», siempre hacia etiquetas', () => {
		expect(etiqueta.edges?.hijo_de).toMatchObject({ to: [TAG_TYPE] });
		expect(etiqueta.edges?.hijo_de?.max).toBeUndefined();
		expect(etiqueta.edges?.relacionada_con).toMatchObject({ to: [TAG_TYPE] });
		expect(etiqueta.edges?.alias_de).toMatchObject({ to: [TAG_TYPE], max: 1 });
	});

	it('el texto para buscar junta el nombre, la descripción y la wiki (no el cuerpo entero)', () => {
		expect(
			etiqueta.searchText?.({ key: 'bondage', description: 'Atar', body: 'largo', wiki_title: 'B' })
		).toBe('bondage\nAtar\nB');
	});
});

describe('etiqueta: en la base', () => {
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
	const ctx = { actor: 'admin-de-prueba' };

	it('guarda madres, relacionadas y alias como edges', async () => {
		const madre = await saveObject(
			t.db,
			{ type: TAG_TYPE, title: 'madre', data: { key: 'madre' } },
			ctx
		);
		const otra = await saveObject(
			t.db,
			{ type: TAG_TYPE, title: 'otra', data: { key: 'otra' } },
			ctx
		);
		const hija = await saveObject(
			t.db,
			{
				type: TAG_TYPE,
				title: 'Hija Linda',
				data: { key: 'hija' },
				edges: { hijo_de: [{ to: madre.id, data: { orden: 3 } }], relacionada_con: [otra.id] }
			},
			ctx
		);
		const alias = await saveObject(
			t.db,
			{ type: TAG_TYPE, title: 'hijita', data: { key: 'hijita' }, edges: { alias_de: [hija.id] } },
			ctx
		);
		const { results } = await t.db
			.prepare('SELECT from_id, kind, to_id, data FROM edges ORDER BY kind, from_id')
			.all();
		expect(results).toEqual([
			{ from_id: alias.id, kind: 'alias_de', to_id: hija.id, data: null },
			{ from_id: hija.id, kind: 'hijo_de', to_id: madre.id, data: '{"orden":3}' },
			{ from_id: hija.id, kind: 'relacionada_con', to_id: otra.id, data: null }
		]);
		await expect(
			saveObject(
				t.db,
				{
					type: TAG_TYPE,
					title: 'x',
					data: { key: 'x' },
					edges: { alias_de: [madre.id, otra.id] }
				},
				ctx
			)
		).rejects.toMatchObject({ code: 'invalid' });
	});

	it('el nombre en los posts es único entre las vivas (distingue mayúsculas); una borrada lo libera', async () => {
		const a = await saveObject(
			t.db,
			{ type: TAG_TYPE, title: 'dominatrix', slug: 'dominatrix', data: { key: 'dominatrix' } },
			ctx
		);
		// Otra con distinta dirección pero el mismo nombre: no.
		await expect(
			saveObject(
				t.db,
				{ type: TAG_TYPE, title: 'otra', slug: 'dominatrix-2', data: { key: 'dominatrix' } },
				ctx
			)
		).rejects.toThrow(/UNIQUE/);
		// Solo cambia la mayúscula: es otra etiqueta (hoy «Dominatrix» es alias de «dominatrix»).
		await saveObject(
			t.db,
			{ type: TAG_TYPE, title: 'Dominatrix', slug: 'dominatrix-3', data: { key: 'Dominatrix' } },
			ctx
		);
		await saveObject(t.db, { id: a.id, type: TAG_TYPE, version: a.version, deleted: true }, ctx);
		const b = await saveObject(
			t.db,
			{ type: TAG_TYPE, title: 'dominatrix', slug: 'dominatrix-4', data: { key: 'dominatrix' } },
			ctx
		);
		expect(b.data.key).toBe('dominatrix');
	});
});
