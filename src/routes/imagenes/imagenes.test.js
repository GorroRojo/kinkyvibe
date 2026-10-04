/**
 * /imagenes (subir y buscar), /imagenes/<id> (sacar de la biblioteca) y /media/<clave> (servir),
 * con el D1 y el R2 de miniflare. Quién puede: admins y cuentas que gestionan un perfil; el resto,
 * 404. Datos e imágenes inventados.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import { ADMINS } from '$lib/server/auth.js';
import { upsertVerifiedAccount } from '$lib/server/cuentas/accounts.js';
import { saveObject } from '$lib/server/objects/save.js';
import { solidPng } from '$lib/server/media/testing.js';
import * as library from './+server.js';
import * as one from './[id]/+server.js';
import * as media from '../media/[...key]/+server.js';

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
const anon = { user: undefined, user_token: '' };

/** Una cuenta del público; con `manages`, gestiona un perfil inventado. */
async function member(name = 'persona-prueba', manages = true) {
	const a = await upsertVerifiedAccount(t.db, `${name}@example.com`);
	if (manages) {
		const p = await saveObject(
			t.db,
			{
				type: 'perfil',
				slug: `perfil-${name}`,
				title: 'Perfil Inventado',
				data: { kind: 'persona' }
			},
			{ actor: `cuenta:${a.id}` }
		);
		// Tabla de apoyo (no es objects/edges): quién gestiona el perfil.
		await t.db
			.prepare(
				"INSERT INTO profile_managers (profile_id, account_id, role, created_at) VALUES (?1, ?2, 'owner', 1)"
			)
			.bind(p.id, a.id)
			.run();
	}
	return { user: undefined, user_token: '', member: { id: a.id, email: a.email } };
}

/**
 * @param {any} locals
 * @param {{ method?: string, path?: string, form?: FormData, headers?: Record<string, string>, params?: Record<string, string> }} [o]
 */
function ev(locals, { method = 'GET', path = '/imagenes', form, headers = {}, params = {} } = {}) {
	const url = new URL(path, ORIGIN);
	return /** @type {any} */ ({
		url,
		params,
		locals,
		platform: t.platform,
		request: new Request(url, { method, body: form, headers })
	});
}

/** @param {() => unknown} fn */
async function status(fn) {
	try {
		const r = /** @type {Response} */ (await fn());
		return r.status;
	} catch (e) {
		return /** @type {any} */ (e).status;
	}
}

/** @param {Uint8Array} bytes @param {Record<string, string>} [fields] */
function upload(bytes, fields = { alt: 'Cuadrado de color de prueba' }) {
	const form = new FormData();
	form.set('file', new File([bytes], 'prueba.png', { type: 'image/png' }));
	for (const [k, v] of Object.entries(fields)) form.set(k, v);
	return form;
}

describe('permisos', () => {
	it('sin sesión, o una cuenta que no gestiona perfiles: 404 en todo', async () => {
		const nobody = await member('sin-perfil', false);
		for (const locals of [anon, nobody]) {
			expect(await status(() => library.GET(ev(locals)))).toBe(404);
			expect(
				await status(() =>
					library.POST(ev(locals, { method: 'POST', form: upload(solidPng(4, 4)) }))
				)
			).toBe(404);
		}
		expect(
			(await t.db.prepare("SELECT COUNT(*) AS n FROM objects WHERE type = 'imagen'").first())?.n
		).toBe(0);
	});

	it('una cuenta que gestiona un perfil sube y ve solo lo suyo; no borra', async () => {
		const me = await member('persona-a');
		const res = await library.POST(ev(me, { method: 'POST', form: upload(solidPng(5, 5)) }));
		expect(res.status).toBe(201);
		const { image } = await res.json();
		await library.POST(ev(admin, { method: 'POST', form: upload(solidPng(6, 6)) }));
		const mine = await (await library.GET(ev(me))).json();
		expect(mine.images.map((/** @type {any} */ i) => i.id)).toEqual([image.id]);
		const all = await (await library.GET(ev(admin))).json();
		expect(all.images).toHaveLength(2);
		// Lo que se devuelve nunca dice quién la subió.
		expect(JSON.stringify(mine)).not.toContain('cuenta:');
		expect(
			await status(() =>
				one.DELETE(
					ev(me, {
						method: 'DELETE',
						path: `/imagenes/${image.id}`,
						params: { id: String(image.id) },
						headers: { origin: ORIGIN }
					})
				)
			)
		).toBe(404);
		// «De este perfil»: solo un perfil que gestiona; otro tipo, nada.
		const ctx = await (await library.GET(ev(me, { path: '/imagenes?para=evento:algo' }))).json();
		expect(ctx.images).toEqual([]);
	});
});

describe('subir', () => {
	it('pide texto alternativo y revisa el archivo', async () => {
		const noAlt = await library.POST(
			ev(admin, { method: 'POST', form: upload(solidPng(4, 4), { alt: '  ' }) })
		);
		expect(noAlt.status).toBe(400);
		expect((await noAlt.json()).error).toMatch(/texto alternativo/);
		const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>');
		const bad = await library.POST(ev(admin, { method: 'POST', form: upload(svg) }));
		expect(bad.status).toBe(415);
	});

	it('sube, se sirve con caché para siempre y, al sacarla, deja de servirse', async () => {
		const res = await library.POST(ev(admin, { method: 'POST', form: upload(solidPng(9, 9)) }));
		const { image } = await res.json();
		expect(image).toMatchObject({
			width: 9,
			height: 9,
			mime: 'image/png',
			alt: 'Cuadrado de color de prueba'
		});
		// Subir el mismo archivo de nuevo: la misma imagen (200, no 201).
		const again = await library.POST(ev(admin, { method: 'POST', form: upload(solidPng(9, 9)) }));
		expect(again.status).toBe(200);
		expect((await again.json()).image.id).toBe(image.id);

		const key = image.key;
		const served = await media.GET(ev(anon, { path: `/media/${key}`, params: { key } }));
		expect(served.status).toBe(200);
		expect(served.headers.get('content-type')).toBe('image/png');
		expect(served.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
		expect(new Uint8Array(await served.arrayBuffer())).toEqual(solidPng(9, 9));
		const etag = served.headers.get('etag') ?? '';
		const cached = await media.GET(
			ev(anon, { path: `/media/${key}`, params: { key }, headers: { 'if-none-match': etag } })
		);
		expect(cached.status).toBe(304);

		// Sacarla: solo desde el mismo sitio.
		const del = (/** @type {Record<string, string>} */ headers) =>
			one.DELETE(
				ev(admin, {
					method: 'DELETE',
					path: `/imagenes/${image.id}`,
					params: { id: String(image.id) },
					headers
				})
			);
		expect(await status(() => del({ origin: 'https://otro.example' }))).toBe(403);
		expect((await del({ origin: ORIGIN })).status).toBe(200);
		expect(
			await status(() => media.GET(ev(anon, { path: `/media/${key}`, params: { key } })))
		).toBe(404);
		// El archivo queda en R2 (barato; se puede deshacer subiéndola de nuevo).
		expect(await /** @type {any} */ (t.env.MEDIA).head(key)).not.toBeNull();
	});

	it('/media/<clave> rechaza claves que no son de la biblioteca', async () => {
		for (const key of ['img/../../wrangler.toml', 'backups/d1.sql.gz', 'img/abc.png']) {
			expect(
				await status(() => media.GET(ev(anon, { path: `/media/${key}`, params: { key } })))
			).toBe(404);
		}
	});
});
