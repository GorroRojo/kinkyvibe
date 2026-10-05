/**
 * Contenido › Biblioteca (/admin/contenido/biblioteca), con el D1 y el R2 de miniflare: solo
 * admins, filtro por tipo, dónde se usa cada cosa (con enlace), sacar (deja de estar en la lista),
 * deshacer y «Cargar más». Datos y archivos inventados.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'svelte/server';
import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import { ADMINS } from '$lib/server/auth.js';
import { saveObject } from '$lib/server/objects/save.js';
import { fakeMp4, fakePdf, solidPng } from '$lib/server/media/testing.js';
import { storeFile, storeImage } from '$lib/server/media/library.js';
import * as library from '../../../../imagenes/+server.js';
import * as one from '../../../../imagenes/[id]/+server.js';
import { actions, load } from './+page.server.js';
import Page from './+page.svelte';

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

const ORIGIN = 'https://kinkyvibe.ar';
const admin = {
	user: { id: ADMINS[0].id, login: ADMINS[0].login, name: null, avatar_url: '' },
	user_token: 'tok'
};
const notAdmin = {
	user: { id: 999_999_999, login: 'persona-sin-permiso', name: null, avatar_url: '' },
	user_token: 'tok'
};
const anon = { user: undefined, user_token: '' };
const ctx = { actor: 'admin-de-prueba' };

/** @param {any} locals @param {string} [search] */
const loadAs = (locals, search = '') =>
	/** @type {Promise<any>} */ (
		load(
			/** @type {any} */ ({
				locals,
				url: new URL(`/admin/contenido/biblioteca${search}`, ORIGIN),
				platform: t.platform
			})
		)
	);

/** @param {() => unknown} fn */
async function status(fn) {
	try {
		await fn();
		return 200;
	} catch (e) {
		return /** @type {any} */ (e).status;
	}
}

/** Una imagen, un PDF y un video inventados. */
async function seed() {
	const bucket = /** @type {any} */ (t.env.MEDIA);
	const { image } = await storeImage(
		t.db,
		bucket,
		{ bytes: solidPng(6, 6), name: 'cuadrado-violeta.png', alt: 'Cuadrado violeta de prueba' },
		ctx
	);
	const { file: pdf } = await storeFile(
		t.db,
		bucket,
		{ bytes: fakePdf(), title: 'Guía inventada', name: 'guia.pdf' },
		ctx
	);
	const { file: video } = await storeFile(
		t.db,
		bucket,
		{ bytes: fakeMp4(), title: 'Video inventado', name: 'video.mp4' },
		ctx
	);
	return { image, pdf, video };
}

describe('/admin/contenido/biblioteca', () => {
	it('sin sesión va al login; una cuenta que no es admin, 403; y no puede recuperar', async () => {
		await seed();
		expect(await status(() => loadAs(anon))).toBe(303);
		expect(await status(() => loadAs(notAdmin))).toBe(403);
		const form = new FormData();
		form.set('id', '1');
		expect(
			await status(() =>
				actions.recuperar(
					/** @type {any} */ ({
						locals: notAdmin,
						url: new URL('/admin/contenido/biblioteca', ORIGIN),
						platform: t.platform,
						request: new Request(ORIGIN, { method: 'POST', body: form })
					})
				)
			)
		).toBe(403);
	});

	it('trae todo, o filtrado por tipo y por texto', async () => {
		await seed();
		const kinds = async (/** @type {string} */ search) =>
			(await loadAs(admin, search)).items.map((/** @type {any} */ i) => i.kind).sort();
		expect(await kinds('')).toEqual(['documento', 'imagen', 'video']);
		expect(await kinds('?tipo=imagen')).toEqual(['imagen']);
		expect(await kinds('?tipo=documento')).toEqual(['documento']);
		expect(await kinds('?tipo=video')).toEqual(['video']);
		expect(await kinds('?q=invent')).toEqual(['documento', 'video']);
		// Un tipo raro es «Todo».
		const odd = await loadAs(admin, '?tipo=otra-cosa');
		expect(odd.kind).toBe('todo');
		expect(odd.items).toHaveLength(3);
	});

	it('dice dónde se usa cada cosa, con enlace al panel, y la página lo muestra', async () => {
		const { image, pdf } = await seed();
		await saveObject(
			t.db,
			{
				type: 'perfil',
				slug: 'perfil-inventado',
				title: 'Perfil Inventado',
				data: { kind: 'persona' },
				edges: { avatar: [image.id] }
			},
			ctx
		);
		await saveObject(
			t.db,
			{
				type: 'material',
				slug: 'material-inventado',
				title: 'Material Inventado',
				data: { body: `Leé [la guía](${pdf.url}).` }
			},
			ctx
		);
		const data = await loadAs(admin);
		const byId = new Map(data.items.map((/** @type {any} */ i) => [i.id, i]));
		expect(byId.get(image.id).usedIn).toEqual(['perfil «Perfil Inventado»']);
		expect(byId.get(image.id).uses).toMatchObject([
			{ type: 'perfil', slug: 'perfil-inventado', title: 'Perfil Inventado' }
		]);
		expect(byId.get(pdf.id).usedIn).toEqual(['material «Material Inventado»']);

		const body = render(Page, { props: { data } }).body;
		expect(body).toContain(
			`href="/admin/comunidad/cuentas/perfiles/${byId.get(image.id).uses[0].id}"`
		);
		expect(body).toContain('perfil «Perfil Inventado»');
		expect(body).toContain('href="/admin/contenido/material/material-inventado"');
		expect(body).toContain('No se usa en ningún lado.');
		// Miniatura de la imagen; el PDF y el video, con su tipo y peso.
		expect(body).toContain(`src="${image.url}"`);
		expect(body).toContain('Cuadrado violeta de prueba');
		expect(body).toContain('PDF · 1 KB');
		expect(body).toContain('Video MP4 · 1 KB');
		expect(body).toContain(`href="${pdf.url}"`);
	});

	it('sacar algo: deja de estar en la lista; deshacer lo vuelve', async () => {
		const { image, pdf } = await seed();
		const res = await one.DELETE(
			/** @type {any} */ ({
				locals: admin,
				platform: t.platform,
				params: { id: String(pdf.id) },
				url: new URL(`/imagenes/${pdf.id}`, ORIGIN),
				request: new Request(`${ORIGIN}/imagenes/${pdf.id}`, {
					method: 'DELETE',
					headers: { origin: ORIGIN }
				})
			})
		);
		expect(res.status).toBe(200);
		const ids = async () => (await loadAs(admin)).items.map((/** @type {any} */ i) => i.id);
		expect(await ids()).not.toContain(pdf.id);
		expect(await ids()).toContain(image.id);

		const form = new FormData();
		form.set('id', String(pdf.id));
		const out = await actions.recuperar(
			/** @type {any} */ ({
				locals: admin,
				url: new URL('/admin/contenido/biblioteca', ORIGIN),
				platform: t.platform,
				request: new Request(ORIGIN, { method: 'POST', body: form })
			})
		);
		expect(out).toEqual({ restored: pdf.id });
		expect(await ids()).toContain(pdf.id);
	});

	it('«Cargar más»: de a páginas, sin repetir ni saltear', async () => {
		const bucket = /** @type {any} */ (t.env.MEDIA);
		for (let n = 1; n <= 50; n++) {
			await storeImage(
				t.db,
				bucket,
				{ bytes: solidPng(n, 1), name: `img-${n}.png`, alt: `Imagen inventada ${n}` },
				{ ...ctx, now: 1_000_000 + n }
			);
		}
		const first = await loadAs(admin);
		expect(first.items).toHaveLength(48);
		expect(first.more).toBe(true);
		const next = await (
			await library.GET(
				/** @type {any} */ ({
					locals: admin,
					platform: t.platform,
					url: new URL('/imagenes?q=&tipo=todo&desde=48', ORIGIN)
				})
			)
		).json();
		expect(next.more).toBe(false);
		expect(next.images).toHaveLength(2);
		const all = [...first.items, ...next.images].map((/** @type {any} */ i) => i.id);
		expect(new Set(all).size).toBe(50);
	});

	it('vacío y sin resultados: el estado vacío en castellano', async () => {
		const empty = render(Page, { props: { data: await loadAs(admin) } }).body;
		expect(empty).toContain('Todavía no hay nada en la biblioteca.');
		const none = render(Page, {
			props: { data: { q: 'nada', kind: 'todo', items: [], more: false, error: '' } }
		}).body;
		expect(none).toContain('No encontramos nada');
		const broken = render(Page, {
			props: {
				data: {
					q: '',
					kind: 'todo',
					items: [],
					more: false,
					error: 'No pudimos leer la biblioteca.'
				}
			}
		}).body;
		expect(broken).toContain('No pudimos leer la biblioteca.');
	});
});
