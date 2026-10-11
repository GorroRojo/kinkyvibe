/**
 * El edge `adjunto` (material → archivo de la biblioteca) sigue al texto: cada guardado lo
 * recalcula a partir de los enlaces `/media/file/<hash>.<ext>` (docs/imagenes.md). Contra el D1 y
 * el R2 de miniflare, con archivos inventados.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDB, resetDB } from '../db/testing.js';
import { deleteImage, imageUsage, storeFile } from '../media/library.js';
import { fakeMp4, fakePdf } from '../media/testing.js';
import { ObjectError } from './errors.js';
import { saveObject } from './save.js';

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

const ADMIN = /** @type {const} */ ({ role: 'admin', id: 'admin-inventade' });
const ctx = { actor: 'admin-inventade' };
const bucket = () => /** @type {import('@cloudflare/workers-types').R2Bucket} */ (t.env.MEDIA);

/** @param {Uint8Array} bytes @param {string} title */
async function file(bytes, title) {
	return (await storeFile(t.db, bucket(), { bytes, title }, ctx)).file;
}

/** Los `to_id` de los edges `adjunto` de un objeto, en orden. @param {number} id */
async function adjuntos(id) {
	const { results } = await t.db
		.prepare("SELECT to_id FROM edges WHERE from_id = ?1 AND kind = 'adjunto' ORDER BY position")
		.bind(id)
		.all();
	return results.map((r) => Number(r.to_id));
}

/**
 * @param {string} body
 * @param {{ id: number, version: number } | null} [prev]
 * @param {Record<string, unknown>} [extra]
 */
function saveMaterial(body, prev = null, extra = {}) {
	return saveObject(
		t.db,
		{
			...(prev ? { id: prev.id, version: prev.version } : { slug: 'guia-inventada' }),
			type: 'material',
			title: 'Guía inventada',
			data: { body, ...extra }
		},
		ctx
	);
}

/**
 * @param {() => Promise<unknown>} fn
 * @returns {Promise<any>}
 */
async function caught(fn) {
	try {
		await fn();
	} catch (e) {
		return e;
	}
	throw new Error('se esperaba un error');
}

describe('edge `adjunto` del material', () => {
	it('enlazar un archivo en el texto crea el edge; sacarlo del texto lo saca', async () => {
		const pdf = await file(fakePdf(), 'Guía de prueba');
		const video = await file(fakeMp4(), 'Video de prueba');
		let m = await saveMaterial(`Intro sin enlaces.`);
		expect(await adjuntos(m.id)).toEqual([]);

		m = await saveMaterial(`[Video](${video.url})\n\n[Bajar el PDF](${pdf.url})`, m);
		expect(await adjuntos(m.id)).toEqual([video.id, pdf.id]);

		m = await saveMaterial(`Solo el [PDF](${pdf.url}).`, m);
		expect(await adjuntos(m.id)).toEqual([pdf.id]);

		m = await saveMaterial(`Ya sin archivos.`, m);
		expect(await adjuntos(m.id)).toEqual([]);
	});

	it('dos enlaces al mismo archivo son un solo edge; también cuenta el `link` del material', async () => {
		const pdf = await file(fakePdf(), 'Guía de prueba');
		const m = await saveMaterial(`[Leer](${pdf.url}) o [bajar](https://kinkyvibe.ar${pdf.url})`);
		expect(await adjuntos(m.id)).toEqual([pdf.id]);

		const other = await file(fakePdf(400), 'Otra guía');
		const m2 = await saveMaterial('Sin enlaces en el texto.', m, { link: other.url });
		expect(await adjuntos(m2.id)).toEqual([other.id]);
	});

	it('un enlace a un hash que no es de ningún archivo no crea edge (y el guardado anda)', async () => {
		const pdf = await file(fakePdf(), 'Guía de prueba');
		const m = await saveMaterial(
			`[Perdido](/media/file/${'0'.repeat(64)}.pdf) y [este](${pdf.url.replace('.pdf', '.odt')})`
		);
		expect(await adjuntos(m.id)).toEqual([]);
	});

	it('un archivo borrado: el edge queda hasta el próximo guardado, que lo saca', async () => {
		const pdf = await file(fakePdf(), 'Guía de prueba');
		let m = await saveMaterial(`[PDF](${pdf.url})`);
		expect(await deleteImage(t.db, pdf.id, ctx)).toBe(true);
		expect(await adjuntos(m.id)).toEqual([pdf.id]);
		m = await saveMaterial(`[PDF](${pdf.url}) y algo más`, m);
		expect(await adjuntos(m.id)).toEqual([]);
	});

	it('nadie manda `adjunto` a mano, y solo el material lo tiene', async () => {
		const pdf = await file(fakePdf(), 'Guía de prueba');
		const manual = await caught(() =>
			saveObject(
				t.db,
				{
					type: 'material',
					slug: 'otra-guia',
					title: 'Otra guía',
					data: {},
					edges: { adjunto: [pdf.id] }
				},
				ctx
			)
		);
		expect(manual).toBeInstanceOf(ObjectError);
		expect(manual.errors).toEqual([expect.objectContaining({ path: 'edges.adjunto' })]);

		const evento = await caught(() =>
			saveObject(
				t.db,
				{
					type: 'evento',
					title: 'Taller inventado',
					data: { start: '2026-10-02T20:00-03:00' },
					edges: { adjunto: [pdf.id] }
				},
				ctx
			)
		);
		expect(evento).toBeInstanceOf(ObjectError);
		expect(evento.errors).toEqual([expect.objectContaining({ path: 'edges.adjunto' })]);

		// Un evento que enlaza el archivo en su texto no tiene edge (se cuenta como uso por el texto).
		const e = await saveObject(
			t.db,
			{
				type: 'evento',
				title: 'Taller inventado',
				data: { start: '2026-10-02T20:00-03:00', body: `[PDF](${pdf.url})` }
			},
			ctx
		);
		expect(await adjuntos(e.id)).toEqual([]);
	});

	it('«dónde se usa» lo dice una vez por material (edge y texto)', async () => {
		const pdf = await file(fakePdf(), 'Guía de prueba');
		await saveMaterial(`[PDF](${pdf.url}) y otra vez [acá](${pdf.url})`);
		expect((await imageUsage(t.db, [pdf.id], ADMIN)).get(pdf.id)).toEqual([
			'material «Guía inventada»'
		]);
	});
});
