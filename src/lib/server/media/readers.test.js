/**
 * Lo que muestra el sitio: mientras un evento no tiene su imagen en la biblioteca, se sigue viendo
 * la del repo (`featured`); con el edge `portada` (guardado desde el editor, en el mismo guardado
 * del texto), la de /media/…. D1 y R2 de miniflare; datos inventados.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import { seedPosts } from '$lib/server/contenido/testing.js';
import { storeImage } from './library.js';
import { solidPng } from './testing.js';

vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

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
	// Una imagen compartida que SÍ está en el repo (src/lib/assets), para ver el respaldo.
	await seedPosts(t.db, [
		{
			category: 'calendario',
			postID: 'cabaret-inventado-2031-06',
			title: 'Cabaret Inventado',
			start: '2031-06-10T22:00-03:00',
			featured: 'cabaret-astral-miniatura.webp'
		}
	]);
});
afterEach(() => {
	vi.resetModules();
});

const SLUG = 'cabaret-inventado-2031-06';
const PATH = `src/lib/posts/calendario/${SLUG}.md`;

async function modules() {
	vi.resetModules();
	const repo = await import('$lib/server/contenido/repo.js');
	repo.setContentDB(t.db);
	return {
		repo,
		posts: await import('$lib/server/contenido/posts.js'),
		eventos: await import('$lib/server/eventos/index.js')
	};
}

/** Un cliente del repo de mentira: nada fuera de la base. */
const base = {
	commitFiles: async () => {
		throw new Error('no debería ir al repo');
	}
};

describe('imagen de un evento', () => {
	it('sin edge, la del repo; con el edge del editor, la de la biblioteca (y al sacarla, vuelve)', async () => {
		const m = await modules();
		const before = await m.posts.siteEvent(t.platform, SLUG);
		expect(String(before?.meta.featured)).toContain('cabaret-astral-miniatura');
		expect(String(before?.meta.featured)).not.toMatch(/^\/media\//);

		const { image } = await storeImage(
			t.db,
			t.env.MEDIA,
			{ bytes: solidPng(8, 8), name: 'nueva.png', alt: 'Cuadrado violeta de prueba' },
			{ actor: 'admin-prueba' }
		);
		const client = m.repo.withContentDb(/** @type {any} */ (base));
		const file = await client.readFile('t', PATH);
		await client.commitFiles('t', {
			files: [{ path: PATH, content: file.raw }],
			message: 'prueba',
			unchanged: [{ path: PATH, sha: file.sha }],
			actor: 'admin-prueba',
			edges: { [PATH]: { portada: [image.id] } }
		});
		const edge = await t.db.prepare("SELECT to_id FROM edges WHERE kind = 'portada'").first();
		expect(edge?.to_id).toBe(image.id);

		const after = await m.posts.siteEvent(t.platform, SLUG);
		expect(after?.meta.featured).toBe(image.url);
		const listed = (await m.posts.sitePosts(t.platform)).find((p) => p.meta.postID === SLUG);
		expect(listed?.meta.featured).toBe(image.url);
		const panel = (await m.eventos.listEvents()).find((e) => e.slug === SLUG);
		expect(panel?.thumb).toBe(image.url);

		// Un edge hacia algo que no es una imagen no se guarda (lo frena saveObject).
		const file2 = await client.readFile('t', PATH);
		const bad = await client
			.commitFiles('t', {
				files: [{ path: PATH, content: file2.raw }],
				message: 'prueba',
				actor: 'admin-prueba',
				edges: { [PATH]: { portada: [Number(edge?.to_id) + 999] } }
			})
			.catch((/** @type {any} */ e) => e);
		expect(bad).toBeInstanceOf(Error);

		const file3 = await client.readFile('t', PATH);
		await client.commitFiles('t', {
			files: [{ path: PATH, content: file3.raw }],
			message: 'prueba',
			actor: 'admin-prueba',
			edges: { [PATH]: { portada: [] } }
		});
		const removed = await m.posts.siteEvent(t.platform, SLUG);
		expect(String(removed?.meta.featured)).toContain('cabaret-astral-miniatura');
	});
});
