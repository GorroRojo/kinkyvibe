/**
 * El edge `enlaza` (docs/enlaces.md, «Al guardar»): cuando un nombre lleva a algo público y a algo
 * que no lo es, gana lo público; y un `#etiqueta` del texto enlaza la etiqueta pero no se la suma
 * al objeto. Las reglas puras con candidatos inventados; el guardado contra el D1 de miniflare.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDB, resetDB } from '../db/testing.js';
import { resolveReference } from './enlaces.js';
import { saveObject } from './save.js';

vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

/**
 * @param {Partial<import('./enlaces.js').Candidate> & { id: number, type: string }} c
 * @returns {import('./enlaces.js').Candidate}
 */
const cand = (c) => ({ slug: '', title: '', key: null, legacy: null, public: true, ...c });

/** @param {string} target @returns {import('../../utils/enlaces.js').BodyReference} */
const link = (target) => /** @type {any} */ ({ form: 'enlace', target });

describe('resolveReference: lo público gana', () => {
	it('con el mismo título, gana el público aunque el oculto gane por tipo y por id', () => {
		const hidden = cand({ id: 1, type: 'material', title: 'Noche de cuerdas', public: false });
		const shown = cand({ id: 9, type: 'evento', title: 'Noche de cuerdas' });
		expect(resolveReference(link('noche de cuerdas'), [hidden, shown])).toBe(shown);
		expect(resolveReference(link('noche de cuerdas'), [shown, hidden])).toBe(shown);
	});

	it('gana antes que las otras reglas: una etiqueta oculta no le gana al título público', () => {
		const tag = cand({ id: 1, type: 'etiqueta', title: 'Nudos', key: 'nudos', public: false });
		const post = cand({ id: 2, type: 'material', title: 'Nudos' });
		expect(resolveReference(link('Nudos'), [tag, post])).toBe(post);
	});

	it('entre dos públicos siguen las reglas de siempre (tipo, después id)', () => {
		const a = cand({ id: 5, type: 'evento', title: 'Igual' });
		const b = cand({ id: 7, type: 'material', title: 'Igual' });
		const c = cand({ id: 3, type: 'material', title: 'Igual' });
		expect(resolveReference(link('Igual'), [a, b, c])).toBe(c);
	});

	it('si solo hay algo oculto, apunta ahí igual (no es «falta»)', () => {
		const hidden = cand({ id: 4, type: 'material', title: 'Borrador', public: false });
		expect(resolveReference(link('Borrador'), [hidden])).toBe(hidden);
		expect(resolveReference(link('Otro'), [hidden])).toBeNull();
	});

	it('en las menciones, el perfil público le gana al que no lo es', () => {
		const unapproved = cand({ id: 1, type: 'perfil', slug: 'x', legacy: 'alguien', public: false });
		const approved = cand({ id: 2, type: 'perfil', slug: 'alguien' });
		const mention = /** @type {any} */ ({ form: 'mencion', target: 'alguien' });
		expect(resolveReference(mention, [unapproved, approved])).toBe(approved);
	});
});

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

const ctx = { actor: 'admin-inventade' };

/** @param {any} input */
const save = (input) => saveObject(t.db, input, ctx);

/** Los edges de un objeto, `kind:to_id`, en orden. @param {number} id */
async function edgesOf(id) {
	const { results } = await t.db
		.prepare('SELECT kind, to_id FROM edges WHERE from_id = ?1 ORDER BY kind, position')
		.bind(id)
		.all();
	return results.map((r) => `${r.kind}:${r.to_id}`);
}

describe('guardar: el edge `enlaza`', () => {
	it('con dos objetos del mismo título, el enlace va al público y no al oculto', async () => {
		const hidden = await save({
			type: 'material',
			slug: 'guia-oculta-inventada',
			title: 'Guía inventada',
			visibility: 'hidden',
			data: { body: 'Borrador.' }
		});
		const shown = await save({
			type: 'material',
			slug: 'guia-publica-inventada',
			title: 'Guía inventada',
			data: { body: 'La de verdad.' }
		});
		const from = await save({
			type: 'material',
			slug: 'enlaza-inventado',
			title: 'Enlaza inventado',
			data: { body: 'Leé [[Guía inventada]].' }
		});
		expect(await edgesOf(from.id)).toEqual([`enlaza:${shown.id}`]);

		// Si la pública pasa a oculta, el enlace va al más viejo de los dos (el primero).
		await save({
			id: shown.id,
			version: shown.version,
			type: 'material',
			slug: 'guia-publica-inventada',
			title: 'Guía inventada',
			visibility: 'hidden',
			data: { body: 'La de verdad.' }
		});
		const again = await save({
			id: from.id,
			version: from.version,
			type: 'material',
			slug: 'enlaza-inventado',
			title: 'Enlaza inventado',
			data: { body: 'Leé [[Guía inventada]] otra vez.' }
		});
		expect(await edgesOf(again.id)).toEqual([`enlaza:${hidden.id}`]);
	});

	it('un #etiqueta del texto enlaza la etiqueta pero no se la suma al objeto', async () => {
		const tag = await save({
			type: 'etiqueta',
			title: 'Cuerda Inventada',
			data: { key: 'Cuerda Inventada' }
		});
		const post = await save({
			type: 'material',
			slug: 'con-etiqueta-en-el-texto',
			title: 'Con etiqueta en el texto',
			data: { body: 'Sobre #[[Cuerda Inventada]] y #cuerda-inventada.' }
		});
		expect(await edgesOf(post.id)).toEqual([`enlaza:${tag.id}`]);
		const row = await t.db.prepare('SELECT data FROM objects WHERE id = ?1').bind(post.id).first();
		expect(JSON.parse(String(row?.data)).tags ?? []).toEqual([]);
	});
});
