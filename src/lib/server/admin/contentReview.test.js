/**
 * «Para revisar» → arreglos de contenido (contentReview.js): qué encuentra la consulta, cómo
 * quedan las filas y los dos arreglos que se hacen desde el Inicio (la descripción de una foto y
 * achicar una portada). D1 de miniflare; perfiles, eventos, material e imágenes inventados.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import { runQuery } from '$lib/server/db/batch.js';
import { saveObject } from '$lib/server/objects/save.js';
import { getObject } from '$lib/server/objects/index.js';
import { makeEvent, makeProfile } from '$lib/server/amigues/testing.js';
import {
	HEAVY_COVER_BYTES,
	contentReviewQuery,
	contentReviewRows,
	heavyCoversRow,
	legacyCoverURL,
	mediaKeyOf,
	missingAltRow,
	saveProfileImageAlt,
	setHeavyOk,
	swapCover,
	videosRow
} from './contentReview.js';

vi.mock('$env/dynamic/private', () => ({ env: {} }));
vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

const ADMIN = /** @type {const} */ ({ role: 'admin', id: 'panel' });
const actor = 'admin-de-prueba';
/** @param {string} c */
const hash = (c) => c.repeat(64);

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
 * Una imagen de la biblioteca (solo la fila: R2 no hace falta acá).
 * @param {string} c un carácter hex para el hash
 * @param {number} size
 * @param {string} [alt]
 */
async function image(c, size, alt = 'Una imagen inventada') {
	const saved = await saveObject(
		t.db,
		{
			type: 'imagen',
			slug: hash(c),
			title: `imagen-${c}.webp`,
			data: { key: `img/${hash(c)}.webp`, mime: 'image/webp', size, width: 2000, height: 1500, alt }
		},
		{ actor }
	);
	return /** @type {number} */ (saved.id);
}

/** @param {number} id @param {Record<string, any>} input */
async function edit(id, input) {
	const o = /** @type {any} */ (await getObject(t.db, { id }, ADMIN));
	return saveObject(t.db, { id, type: o.type, version: o.version, ...input }, { actor });
}

const read = () => runQuery(t.db, contentReviewQuery());

describe('la consulta y las filas', () => {
	it('sin nada para arreglar, ninguna fila', async () => {
		await makeProfile(t.db, { title: 'Perfil Sin Fotos', data: { body: 'Solo texto.' } });
		const facts = await read();
		expect(facts).toMatchObject({ heavy: [], covers: [], videos: [] });
		expect(contentReviewRows(facts)).toEqual([]);
	});

	it('fotos sin descripción, una portada pesada y un video sin transcripción: 3 filas', async () => {
		await makeProfile(t.db, {
			title: 'Perfil Inventado',
			slug: 'perfil-inventado',
			data: {
				body: `<img alt="" src="/media/img/${hash('a')}.webp">\n\n<img alt="Ya descripta" src="/media/img/${hash('b')}.webp">\n\n![](/media/img/${hash('c')}.webp)`
			}
		});
		const heavy = await image('d', HEAVY_COVER_BYTES + 1000);
		const light = await image('e', 50_000);
		const fiesta = /** @type {number} */ (
			await makeEvent(t.db, 'fiesta-inventada', { title: 'Fiesta Inventada' })
		);
		await edit(fiesta, { edges: { portada: [heavy] } });
		const otra = /** @type {number} */ (
			await makeEvent(t.db, 'otra-fiesta', { title: 'Otra Fiesta' })
		);
		await edit(otra, { edges: { portada: [light] } });
		await saveObject(
			t.db,
			{
				type: 'material',
				slug: 'material-con-video',
				title: 'Material Con Video',
				data: { body: `Antes.\n\n<video src="/media/file/${hash('f')}.mp4" controls></video>` }
			},
			{ actor }
		);
		await saveObject(
			t.db,
			{
				type: 'material',
				slug: 'material-transcripto',
				title: 'Material Transcripto',
				data: { body: '<video src="x"></video>', transcript: 'Texto de prueba.' }
			},
			{ actor }
		);

		const rows = /** @type {any[]} */ (contentReviewRows(await read()));
		expect(rows.map((r) => [r.id, r.title])).toEqual([
			['group-content-alt', '2 fotos sin descripción'],
			['group-content-covers', '1 portada pesada'],
			['group-content-videos', '1 video sin transcripción']
		]);
		expect(rows[0].text).toMatch(/^En 1 perfil\./);
		expect(rows[0].items.map((/** @type {any} */ i) => i.altFix)).toEqual([
			{
				profileId: expect.any(Number),
				index: 0,
				src: `/media/img/${hash('a')}.webp`,
				thumb: `/media/img/${hash('a')}.webp`
			},
			{
				profileId: expect.any(Number),
				index: 2,
				src: `/media/img/${hash('c')}.webp`,
				thumb: `/media/img/${hash('c')}.webp`
			}
		]);
		expect(rows[0].items[0].href).toBe('/admin/comunidad/perfiles/perfil-inventado');
		expect(rows[1].items[0]).toMatchObject({
			name: `Fiesta Inventada · ${Math.round((HEAVY_COVER_BYTES + 1000) / 1024)} KB`,
			shrink: { ownerId: fiesta, imageId: heavy, url: `/media/img/${hash('d')}.webp` }
		});
		expect(rows[2].items[0].href).toBe('/admin/contenido/material/material-con-video#sec-video');
	});
});

describe('las filas, puras', () => {
	it('«Fotos sin descripción» muestra a lo sumo `shown` y dice cuántas más', () => {
		const body = Array.from({ length: 5 }, () => '<img alt="" src="/media/img/x.webp">').join('\n');
		const row = /** @type {any} */ (
			missingAltRow([{ id: 1, slug: 'p', title: 'P', body, legacySlug: null }], { shown: 3 })
		);
		expect(row.title).toBe('5 fotos sin descripción');
		expect(row.items.map((/** @type {any} */ i) => i.name)).toEqual([
			'P · foto 1',
			'P · foto 2',
			'P · foto 3',
			'y 2 fotos más'
		]);
	});

	it('una imagen importada con mdsvex (`src={foto}`) se ve con su copia de la biblioteca', () => {
		const body =
			'<script>\n  import foto from \'./media/Inventade/1.webp\';\n</script>\n\n<img alt="" src={foto} />';
		const row = /** @type {any} */ (
			missingAltRow([
				{ id: 1, slug: 'Inventade', title: 'Inventade', body, legacySlug: 'Inventade' }
			])
		);
		// Esa carpeta no existe en el mapa fijo: sin miniatura, pero la foto cuenta igual.
		expect(row.items[0].altFix).toMatchObject({ src: '{foto}', thumb: '' });
	});

	it('«Portadas pesadas»: el edge manda sobre la portada vieja del repo del mismo objeto', () => {
		const heavy = [
			{
				id: 9,
				key: `img/${hash('a')}.webp`,
				size: 400_000,
				title: 't',
				alt: '',
				mime: 'image/webp'
			}
		];
		const row = /** @type {any} */ (
			heavyCoversRow(heavy, [
				{ id: 1, type: 'evento', slug: 'uno', title: 'Uno', key: `img/${hash('a')}.webp` },
				{ id: 1, type: 'evento', slug: 'uno', title: 'Uno', imageId: 5 },
				{ id: 2, type: 'material', slug: 'dos', title: 'Dos', key: `img/${hash('a')}.webp` }
			])
		);
		expect(row.items.map((/** @type {any} */ i) => [i.id, i.href])).toEqual([
			['cover-2', '/admin/contenido/material/dos']
		]);
	});

	it('sin videos, sin fila; con uno, lleva a la sección «Video» del editor', () => {
		expect(videosRow([])).toBeNull();
		expect(/** @type {any} */ (videosRow([{ id: 1, slug: 's', title: 'S' }])).items[0].action).toBe(
			'Escribir la transcripción'
		);
	});

	it('mediaKeyOf y legacyCoverURL', () => {
		expect(mediaKeyOf(`https://kinkyvibe.ar/media/img/${hash('a')}.webp`)).toBe(
			`img/${hash('a')}.webp`
		);
		expect(mediaKeyOf('/media/file/x.pdf')).toBeNull();
		expect(legacyCoverURL('material', 's', '')).toBeUndefined();
		expect(legacyCoverURL('material', 's', `/media/img/${hash('a')}.webp`)).toBe(
			`/media/img/${hash('a')}.webp`
		);
	});
});

describe('saveProfileImageAlt', () => {
	it('escribe la descripción de esa foto, con su versión en el historial; dos veces, no', async () => {
		const body = `Hola.\n\n<img alt="" src="/media/img/${hash('a')}.webp">`;
		const p = await makeProfile(t.db, { title: 'Perfil Inventado', data: { body } });
		const id = /** @type {number} */ (p.id);
		const input = {
			profileId: id,
			index: 0,
			src: `/media/img/${hash('a')}.webp`,
			alt: 'Texto de prueba'
		};
		expect(await saveProfileImageAlt(t.db, input, { actor })).toEqual({
			ok: true,
			title: 'Perfil Inventado',
			id
		});
		const after = /** @type {any} */ (await getObject(t.db, { id }, ADMIN));
		expect(after.data.body).toBe(
			`Hola.\n\n<img alt="Texto de prueba" src="/media/img/${hash('a')}.webp">`
		);
		expect(after.data.kind).toBe('persona');
		const revisions = await t.db
			.prepare('SELECT version, source FROM object_revisions WHERE object_id = ?1')
			.bind(id)
			.all();
		expect(revisions.results).toContainEqual({ version: after.version, source: 'panel' });
		// Ya tiene descripción: no pisa nada.
		expect(await saveProfileImageAlt(t.db, { ...input, alt: 'Otra' }, { actor })).toMatchObject({
			ok: false,
			status: 409
		});
	});

	it('si la foto cambió (otra src) o el perfil no existe, no guarda', async () => {
		const p = await makeProfile(t.db, {
			title: 'Perfil Inventado',
			data: { body: `<img alt="" src="/media/img/${hash('a')}.webp">` }
		});
		const id = /** @type {number} */ (p.id);
		expect(
			await saveProfileImageAlt(
				t.db,
				{ profileId: id, index: 0, src: '/media/img/otra.webp', alt: 'x' },
				{ actor }
			)
		).toMatchObject({ ok: false, status: 409 });
		expect(
			await saveProfileImageAlt(t.db, { profileId: 99999, index: 0, src: '', alt: 'x' }, { actor })
		).toMatchObject({ ok: false, status: 404 });
	});
});

describe('swapCover', () => {
	it('cambia la portada por la copia achicada; la original queda en la biblioteca', async () => {
		const heavy = await image('a', 900_000);
		const small = await image('b', 200_000);
		const ev = /** @type {number} */ (
			await makeEvent(t.db, 'fiesta-inventada', { data: { featured: '2' } })
		);
		await edit(ev, { edges: { portada: [heavy] } });
		const r = await swapCover(
			t.db,
			{ ownerId: ev, oldImageId: heavy, newImageId: small },
			{ actor }
		);
		expect(r).toMatchObject({ ok: true, before: 900_000, after: 200_000 });
		const edge = await t.db
			.prepare(`SELECT to_id FROM edges WHERE from_id = ?1 AND kind = 'portada'`)
			.bind(ev)
			.all();
		expect(edge.results).toEqual([{ to_id: small }]);
		const owner = /** @type {any} */ (await getObject(t.db, { id: ev }, ADMIN));
		expect(owner.data.featured).toBeUndefined();
		expect(await getObject(t.db, { id: heavy }, ADMIN)).toMatchObject({ id: heavy });
		const revisions = await t.db
			.prepare(
				`SELECT COUNT(*) AS n FROM object_revisions WHERE object_id = ?1 AND source = 'panel'`
			)
			.bind(ev)
			.first();
		expect(revisions?.n).toBe(1);
	});

	it('no toca nada si la portada ya es otra o si la copia no pesa menos', async () => {
		const heavy = await image('a', 900_000);
		const other = await image('c', 800_000);
		const bigger = await image('d', 950_000);
		const ev = /** @type {number} */ (await makeEvent(t.db, 'fiesta-inventada'));
		await edit(ev, { edges: { portada: [other] } });
		expect(
			await swapCover(t.db, { ownerId: ev, oldImageId: heavy, newImageId: other }, { actor })
		).toMatchObject({ ok: false, status: 409 });
		expect(
			await swapCover(t.db, { ownerId: ev, oldImageId: other, newImageId: bigger }, { actor })
		).toMatchObject({ ok: false, status: 400 });
	});
});

describe('swapCover: solo si la copia pesa bastante menos', () => {
	it('rechaza una copia casi igual (381 KB → 380,6 KB) o un 11 % más liviana arriba de 300 KB', async () => {
		const heavy = await image('a', 390_144);
		const same = await image('b', 389_734);
		const ev = /** @type {number} */ (await makeEvent(t.db, 'fiesta-inventada'));
		await edit(ev, { edges: { portada: [heavy] } });
		const r = await swapCover(
			t.db,
			{ ownerId: ev, oldImageId: heavy, newImageId: same },
			{ actor }
		);
		expect(r).toMatchObject({ ok: false, status: 400 });
		expect(/** @type {any} */ (r).message).toContain('380,6 KB');
		const big = await image('c', 900_000);
		const bit = await image('d', 800_000);
		const ev2 = /** @type {number} */ (await makeEvent(t.db, 'otra-fiesta'));
		await edit(ev2, { edges: { portada: [big] } });
		expect(
			await swapCover(t.db, { ownerId: ev2, oldImageId: big, newImageId: bit }, { actor })
		).toMatchObject({ ok: false, status: 400 });
		// la portada no cambió
		const edge = await t.db
			.prepare(`SELECT to_id FROM edges WHERE from_id = ?1 AND kind = 'portada'`)
			.bind(ev)
			.first();
		expect(edge?.to_id).toBe(heavy);
	});

	it('acepta una copia un 15 % más liviana aunque siga arriba de 300 KB', async () => {
		const big = await image('a', 900_000);
		const lighter = await image('b', 760_000);
		const ev = /** @type {number} */ (await makeEvent(t.db, 'fiesta-inventada'));
		await edit(ev, { edges: { portada: [big] } });
		expect(
			await swapCover(t.db, { ownerId: ev, oldImageId: big, newImageId: lighter }, { actor })
		).toMatchObject({ ok: true, before: 900_000, after: 760_000 });
	});
});

describe('setHeavyOk («Dejarla así»)', () => {
	it('saca la portada de la lista (con su versión en el historial) y «Deshacer» la vuelve', async () => {
		const heavy = await image('a', HEAVY_COVER_BYTES + 5000);
		const ev = /** @type {number} */ (
			await makeEvent(t.db, 'fiesta-inventada', { title: 'Fiesta Inventada' })
		);
		await edit(ev, { edges: { portada: [heavy] } });
		const covers = async () =>
			contentReviewRows(await read()).filter((r) => r.id === 'group-content-covers');
		expect(await covers()).toHaveLength(1);

		const now = Date.parse('2026-11-05T12:00:00Z');
		expect(await setHeavyOk(t.db, { imageId: heavy, ok: true }, { actor, now })).toMatchObject({
			ok: true,
			id: heavy
		});
		expect(await covers()).toEqual([]);
		const o = /** @type {any} */ (await getObject(t.db, { id: heavy }, ADMIN));
		expect(o.data.heavy_ok).toEqual({ by: actor, at: '2026-11-05T12:00:00.000Z' });
		// el resto de la imagen, igual
		expect(o.data).toMatchObject({ size: HEAVY_COVER_BYTES + 5000, alt: 'Una imagen inventada' });
		const revisions = await t.db
			.prepare(
				`SELECT COUNT(*) AS n FROM object_revisions WHERE object_id = ?1 AND source = 'panel'`
			)
			.bind(heavy)
			.first();
		expect(revisions?.n).toBe(1);

		expect(await setHeavyOk(t.db, { imageId: heavy, ok: false }, { actor })).toMatchObject({
			ok: true
		});
		expect(await covers()).toHaveLength(1);
		const back = /** @type {any} */ (await getObject(t.db, { id: heavy }, ADMIN));
		expect(back.data.heavy_ok).toBeUndefined();
	});

	it('una portada nueva (otra imagen) se revisa de nuevo', async () => {
		const accepted = await image('a', HEAVY_COVER_BYTES + 5000);
		const other = await image('b', HEAVY_COVER_BYTES + 9000);
		const ev = /** @type {number} */ (await makeEvent(t.db, 'fiesta-inventada'));
		await edit(ev, { edges: { portada: [accepted] } });
		await setHeavyOk(t.db, { imageId: accepted, ok: true }, { actor });
		await edit(ev, { edges: { portada: [other] } });
		const rows = /** @type {any[]} */ (contentReviewRows(await read()));
		expect(rows.find((r) => r.id === 'group-content-covers')?.items[0].shrink.imageId).toBe(other);
	});

	it('si la imagen ya no está, no hace nada', async () => {
		expect(await setHeavyOk(t.db, { imageId: 99999, ok: true }, { actor })).toMatchObject({
			ok: false,
			status: 404
		});
	});
});
