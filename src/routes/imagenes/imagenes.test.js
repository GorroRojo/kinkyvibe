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
import { fakeMp4, fakeOdt, fakePdf, fakeZip, solidPng } from '$lib/server/media/testing.js';
import { MAX_FILE_BYTES } from '$lib/utils/libraryFiles.js';
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

/** DELETE /imagenes/<id> desde el mismo sitio. @param {any} locals @param {number} id */
const delEv = (locals, id) =>
	ev(locals, {
		method: 'DELETE',
		path: `/imagenes/${id}`,
		params: { id: String(id) },
		headers: { origin: ORIGIN }
	});

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

	it('una cuenta que gestiona un perfil sube y ve solo lo suyo; no borra lo de otra persona', async () => {
		const me = await member('persona-a');
		const res = await library.POST(ev(me, { method: 'POST', form: upload(solidPng(5, 5)) }));
		expect(res.status).toBe(201);
		const { image } = await res.json();
		const other = await (
			await library.POST(ev(admin, { method: 'POST', form: upload(solidPng(6, 6)) }))
		).json();
		const mine = await (await library.GET(ev(me))).json();
		expect(mine.images.map((/** @type {any} */ i) => i.id)).toEqual([image.id]);
		const all = await (await library.GET(ev(admin))).json();
		expect(all.images).toHaveLength(2);
		// Lo que se devuelve nunca dice quién la subió.
		expect(JSON.stringify(mine)).not.toContain('cuenta:');
		// Antes «no borra» nada; ahora (decisión de gorrite) borra lo suyo sin usar (ver «borrar
		// lo propio»), pero la imagen de otra persona sigue dando 404.
		expect(await status(() => one.DELETE(delEv(me, other.image.id)))).toBe(404);
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

describe('borrar lo propio (cuentas del público)', () => {
	/** Sube una imagen como `locals` y devuelve su `PublicImage`. @param {any} locals @param {number} n */
	async function uploaded(locals, n) {
		const res = await library.POST(ev(locals, { method: 'POST', form: upload(solidPng(n, n)) }));
		return (await res.json()).image;
	}
	const alive = async (/** @type {number} */ id) =>
		(await t.db.prepare('SELECT deleted_at FROM objects WHERE id = ?1').bind(id).first())
			?.deleted_at === null;

	it('borra una imagen suya que nada usa: deja de servirse y de aparecer', async () => {
		const me = await member('persona-b');
		const image = await uploaded(me, 7);
		const listed = await (await library.GET(ev(me))).json();
		expect(listed.images[0]).toMatchObject({ id: image.id, usedIn: [] });
		const res = await one.DELETE(delEv(me, image.id));
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ deleted: true });
		expect(await alive(image.id)).toBe(false);
		expect((await (await library.GET(ev(me))).json()).images).toEqual([]);
		const key = image.key;
		expect(
			await status(() => media.GET(ev(anon, { path: `/media/${key}`, params: { key } })))
		).toBe(404);
		// Queda en Actividad del objeto con la cuenta como autora (borrado suave, como el de admins).
		const row = /** @type {any} */ (
			await t.db.prepare('SELECT updated_by FROM objects WHERE id = ?1').bind(image.id).first()
		);
		expect(row.updated_by).toMatch(/^cuenta:/);
		// Ya borrada: 404.
		expect(await status(() => one.DELETE(delEv(me, image.id)))).toBe(404);
	});

	it('una imagen suya que se usa (edge avatar): 409 con dónde, y no se borra', async () => {
		const me = await member('persona-c');
		const image = await uploaded(me, 8);
		const profile = /** @type {any} */ (
			await t.db.prepare("SELECT id, version FROM objects WHERE slug = 'perfil-persona-c'").first()
		);
		await saveObject(
			t.db,
			{ id: profile.id, type: 'perfil', version: profile.version, edges: { avatar: [image.id] } },
			{ actor: 'admin-de-prueba' }
		);
		const listed = await (await library.GET(ev(me))).json();
		expect(listed.images[0].usedIn).toEqual(['perfil «Perfil Inventado»']);
		const res = await one.DELETE(delEv(me, image.id));
		expect(res.status).toBe(409);
		const out = await res.json();
		expect(out.error).toBe(
			'No la podés borrar: se usa en perfil «Perfil Inventado». Primero sacala de ahí.'
		);
		expect(out.usedIn).toEqual(['perfil «Perfil Inventado»']);
		expect(await alive(image.id)).toBe(true);
	});

	it('una imagen suya nombrada en el texto de otro objeto, o usada donde no ve: tampoco', async () => {
		const me = await member('persona-d');
		const image = await uploaded(me, 10);
		await saveObject(
			t.db,
			{
				type: 'evento',
				slug: 'evento-inventado',
				title: 'Evento Inventado',
				visibility: 'hidden',
				data: {
					start: '2031-05-01T20:00:00-03:00',
					body: `Flyer: ![flyer de prueba](/media/${image.key})`
				}
			},
			{ actor: 'admin-de-prueba' }
		);
		const res = await one.DELETE(delEv(me, image.id));
		expect(res.status).toBe(409);
		// Un evento que la cuenta no puede ver: se cuenta, sin decir cuál.
		expect((await res.json()).usedIn).toEqual(['otra publicación']);
		expect(await alive(image.id)).toBe(true);
	});

	it('la imagen de otra cuenta: 404 (no se dice que existe), aunque nada la use', async () => {
		const owner = await member('persona-e');
		const intruder = await member('persona-f');
		const image = await uploaded(owner, 11);
		expect(await status(() => one.DELETE(delEv(intruder, image.id)))).toBe(404);
		expect(await alive(image.id)).toBe(true);
	});

	it('sin sesión o sin perfiles: 404; desde otro sitio: 403', async () => {
		const me = await member('persona-g');
		const image = await uploaded(me, 12);
		const nobody = await member('persona-sin-perfil', false);
		for (const locals of [anon, nobody]) {
			expect(await status(() => one.DELETE(delEv(locals, image.id)))).toBe(404);
		}
		expect(
			await status(() =>
				one.DELETE(
					ev(me, {
						method: 'DELETE',
						path: `/imagenes/${image.id}`,
						params: { id: String(image.id) },
						headers: { origin: 'https://otro.example' }
					})
				)
			)
		).toBe(403);
		expect(await alive(image.id)).toBe(true);
	});

	it('les admins siguen pudiendo sacar una imagen aunque se use', async () => {
		const me = await member('persona-h');
		const image = await uploaded(me, 13);
		const profile = /** @type {any} */ (
			await t.db.prepare("SELECT id, version FROM objects WHERE slug = 'perfil-persona-h'").first()
		);
		await saveObject(
			t.db,
			{ id: profile.id, type: 'perfil', version: profile.version, edges: { avatar: [image.id] } },
			{ actor: 'admin-de-prueba' }
		);
		expect((await one.DELETE(delEv(admin, image.id))).status).toBe(200);
		expect(await alive(image.id)).toBe(false);
	});
});

/** Un documento o video para subir. @param {Uint8Array} bytes @param {string} fileName @param {string} [name] */
function uploadDoc(bytes, fileName, name = 'Guía inventada de prueba') {
	const form = new FormData();
	form.set('file', new File([bytes], fileName));
	if (name !== undefined) form.set('name', name);
	return form;
}

/** GET /media/<clave> como cualquiera. @param {string} key @param {Record<string, string>} [headers] */
const serve = (key, headers = {}) =>
	media.GET(ev(anon, { path: `/media/${key}`, params: { key }, headers }));

describe('documentos y video (biblioteca)', () => {
	const count = async () =>
		(await t.db.prepare("SELECT COUNT(*) AS n FROM objects WHERE type = 'archivo'").first())?.n;

	it('les admins suben un PDF: objeto `archivo` con su nombre, y el mismo archivo es el mismo', async () => {
		const res = await library.POST(
			ev(admin, { method: 'POST', form: uploadDoc(fakePdf(), 'g.pdf') })
		);
		expect(res.status).toBe(201);
		const { file, image } = await res.json();
		expect(image).toBeUndefined();
		expect(file).toMatchObject({
			kind: 'documento',
			mime: 'application/pdf',
			title: 'Guía inventada de prueba',
			typeLabel: 'PDF'
		});
		expect(file.url).toMatch(/^\/media\/file\/[0-9a-f]{64}\.pdf$/);
		const again = await library.POST(
			ev(admin, { method: 'POST', form: uploadDoc(fakePdf(), 'otro.pdf', 'Otro nombre') })
		);
		expect(again.status).toBe(200);
		expect((await again.json()).file.id).toBe(file.id);
		expect(await count()).toBe(1);
	});

	it('una cuenta del público no sube documentos ni video (415), aunque gestione un perfil', async () => {
		const me = await member('persona-docs');
		for (const [bytes, name] of /** @type {const} */ ([
			[fakePdf(), 'g.pdf'],
			[fakeMp4(), 'v.mp4'],
			[fakeOdt(), 'd.odt']
		])) {
			const res = await library.POST(ev(me, { method: 'POST', form: uploadDoc(bytes, name) }));
			expect(res.status).toBe(415);
			expect((await res.json()).error).toMatch(/solo imágenes/);
		}
		expect(await count()).toBe(0);
		// Y su búsqueda sigue trayendo solo sus imágenes, aunque pida `tipo`.
		await library.POST(ev(admin, { method: 'POST', form: uploadDoc(fakePdf(), 'g.pdf') }));
		const mine = await (await library.GET(ev(me, { path: '/imagenes?tipo=documento' }))).json();
		expect(mine.images).toEqual([]);
	});

	it('rechaza lo que no es imagen ni documento aceptado (HTML, zip cualquiera) y lo que es muy grande', async () => {
		const html = new TextEncoder().encode('<!doctype html><script>alert(1)</script>');
		for (const [bytes, name] of /** @type {const} */ ([
			[html, 'x.pdf'],
			[fakeZip('[Content_Types].xml', '<Types/>'), 'x.odt']
		])) {
			const res = await library.POST(ev(admin, { method: 'POST', form: uploadDoc(bytes, name) }));
			expect(res.status).toBe(415);
		}
		// Un pedido que dice pesar más que el máximo: 413 con explicación, sin leerlo.
		const big = await library.POST(
			ev(admin, {
				method: 'POST',
				form: uploadDoc(fakePdf(), 'g.pdf'),
				headers: { 'content-length': String(MAX_FILE_BYTES + 1024 * 1024) }
			})
		);
		expect(big.status).toBe(413);
		expect((await big.json()).error).toMatch(/El máximo es 25 MB/);
		expect(await count()).toBe(0);
	});

	it('PDF: se sirve inline con nombre seguro, nosniff y caché para siempre; ODT se descarga', async () => {
		const pdf = (
			await (
				await library.POST(ev(admin, { method: 'POST', form: uploadDoc(fakePdf(), 'g.pdf') }))
			).json()
		).file;
		const r = await serve(pdf.key);
		expect(r.status).toBe(200);
		expect(r.headers.get('content-type')).toBe('application/pdf');
		expect(r.headers.get('x-content-type-options')).toBe('nosniff');
		expect(r.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
		expect(r.headers.get('accept-ranges')).toBe('bytes');
		expect(r.headers.get('content-disposition')).toBe(
			`inline; filename="Guia inventada de prueba.pdf"; filename*=UTF-8''Gu%C3%ADa%20inventada%20de%20prueba.pdf`
		);
		expect(new Uint8Array(await r.arrayBuffer())).toEqual(fakePdf());

		const odt = (
			await (
				await library.POST(
					ev(admin, { method: 'POST', form: uploadDoc(fakeOdt(), 'd.odt', 'Ficha médica') })
				)
			).json()
		).file;
		const o = await serve(odt.key);
		expect(o.headers.get('content-type')).toBe('application/vnd.oasis.opendocument.text');
		expect(o.headers.get('content-disposition')).toMatch(
			/^attachment; filename="Ficha medica\.odt"/
		);
		expect(o.headers.get('content-security-policy')).toMatch(/sandbox/);
		// Las imágenes siguen igual (sin Content-Disposition) y también dicen nosniff.
		const img = (
			await (await library.POST(ev(admin, { method: 'POST', form: upload(solidPng(4, 4)) }))).json()
		).image;
		const i = await serve(img.key);
		expect(i.headers.get('content-disposition')).toBeNull();
		expect(i.headers.get('x-content-type-options')).toBe('nosniff');
	});

	it('video: pedidos por partes (206, límites, 416) y 404 al sacarlo', async () => {
		const bytes = fakeMp4('mp42', 1000);
		const video = (
			await (
				await library.POST(
					ev(admin, { method: 'POST', form: uploadDoc(bytes, 'v.mp4', 'Video de prueba') })
				)
			).json()
		).file;
		expect(video).toMatchObject({ kind: 'video', mime: 'video/mp4' });
		const whole = await serve(video.key);
		expect(whole.status).toBe(200);
		expect(whole.headers.get('content-length')).toBe('1000');
		expect(whole.headers.get('content-disposition')).toMatch(/^inline; /);

		const part = await serve(video.key, { range: 'bytes=100-199' });
		expect(part.status).toBe(206);
		expect(part.headers.get('content-range')).toBe('bytes 100-199/1000');
		expect(part.headers.get('content-length')).toBe('100');
		expect(new Uint8Array(await part.arrayBuffer())).toEqual(bytes.slice(100, 200));

		const tail = await serve(video.key, { range: 'bytes=-10' });
		expect(tail.status).toBe(206);
		expect(tail.headers.get('content-range')).toBe('bytes 990-999/1000');
		expect(new Uint8Array(await tail.arrayBuffer())).toEqual(bytes.slice(990));

		const clipped = await serve(video.key, { range: 'bytes=950-5000' });
		expect(clipped.status).toBe(206);
		expect(clipped.headers.get('content-range')).toBe('bytes 950-999/1000');
		expect((await clipped.arrayBuffer()).byteLength).toBe(50);

		const outside = await serve(video.key, { range: 'bytes=1000-' });
		expect(outside.status).toBe(416);
		expect(outside.headers.get('content-range')).toBe('bytes */1000');

		// Varios rangos: se ignora y se manda todo.
		expect((await serve(video.key, { range: 'bytes=0-1,5-9' })).status).toBe(200);

		expect((await one.DELETE(delEv(admin, video.id))).status).toBe(200);
		expect(await status(() => serve(video.key))).toBe(404);
		expect(await status(() => serve(video.key, { range: 'bytes=0-9' }))).toBe(404);
	});

	it('/media/file/… rechaza claves raras', async () => {
		for (const key of ['file/../../x.pdf', `file/${'a'.repeat(64)}.html`, 'file/abc.pdf']) {
			expect(await status(() => serve(key))).toBe(404);
		}
		// Una clave bien formada que no existe.
		expect(await status(() => serve(`file/${'c'.repeat(64)}.pdf`))).toBe(404);
	});

	it('buscar con filtro por tipo (solo admins): todo, imágenes, documentos, videos', async () => {
		await library.POST(ev(admin, { method: 'POST', form: upload(solidPng(5, 5)) }));
		await library.POST(ev(admin, { method: 'POST', form: uploadDoc(fakePdf(), 'g.pdf') }));
		await library.POST(
			ev(admin, { method: 'POST', form: uploadDoc(fakeMp4(), 'v.mp4', 'Video inventado') })
		);
		const kinds = async (/** @type {string} */ q) =>
			(await (await library.GET(ev(admin, { path: `/imagenes?${q}` }))).json()).images
				.map((/** @type {any} */ i) => i.kind)
				.sort();
		expect(await kinds('tipo=todo')).toEqual(['documento', 'imagen', 'video']);
		expect(await kinds('tipo=imagen')).toEqual(['imagen']);
		expect(await kinds('tipo=documento')).toEqual(['documento']);
		expect(await kinds('tipo=video')).toEqual(['video']);
		expect(await kinds('q=invent&tipo=todo')).toEqual(['documento', 'video']);
		// Sin `tipo` (el selector de imágenes): solo imágenes, como siempre.
		const plain = await (await library.GET(ev(admin))).json();
		expect(plain.images).toHaveLength(1);
		expect(plain.images[0].kind).toBeUndefined();
	});
});
