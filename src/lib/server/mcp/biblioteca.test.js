/**
 * Subir a la biblioteca desde el conector de Claude (./biblioteca.js), de punta a punta con datos
 * inventados en el D1 y el R2 de miniflare y las herramientas de verdad (por `handleMessage`):
 *
 * - una PNG sube con sus copias chicas, `buscar` con `tipo: imagen` la encuentra, `vista_previa` y
 *   `aplicar` la ponen de portada de un evento y la página del evento la muestra;
 * - los mismos bytes dos veces son una imagen; un tipo que miente con la extensión, una imagen de
 *   más de 2000 px o un `contenido` muy grande se rechazan con un mensaje claro; el tope por día;
 * - en dos pasos (`pedir_subida`, el PUT y `confirmar_subida`), también un video;
 * - nunca se baja nada de una dirección, y sin permiso de cambiar no se sube nada.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import { fixtureFiles } from '$lib/server/contenido/testing.js';
import { runImport } from '$lib/server/contenido/importer.js';
import { ADMINS } from '$lib/server/auth';
import { fakeMp4, fakePdf, fakeWebp, solidPng } from '$lib/server/media/testing.js';
import { uploadCountAllowed, UPLOAD_CAPS } from '$lib/server/media/uploadCap.js';
import { copySize } from '$lib/utils/mediaCopies.js';
import { toBase64 } from '$lib/utils/base64.js';

vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 });

const EVENT = 'fiesta-inventada-2031-01';
const [admin] = ADMINS;
const LLAVE = { id: 7, name: 'Asistente de prueba' };

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
	await runImport(
		t.db,
		'calendario',
		fixtureFiles('calendario').filter((f) => f.legacySlug === EVENT),
		{ actor: 'importacion', now: Date.now() }
	);
});
afterEach(() => {
	vi.resetModules();
});

const bucket = () => /** @type {import('@cloudflare/workers-types').R2Bucket} */ (t.env.MEDIA);

/** @param {string} key @param {boolean} on */
const setFlag = (key, on) =>
	t.db
		.prepare(
			`INSERT INTO feature_flags (key, enabled, updated_at, updated_by) VALUES (?1, ?2, 0, 'test')
			ON CONFLICT (key) DO UPDATE SET enabled = excluded.enabled`
		)
		.bind(key, on ? 1 : 0)
		.run();

/**
 * Los módulos con la base registrada (como hooks.server.js), los interruptores y una llamada a
 * una herramienta como la haría una rutina con su llave.
 * @param {{ canEdit?: boolean }} [opts]
 */
async function setup({ canEdit = true } = {}) {
	vi.resetModules();
	const repo = await import('$lib/server/contenido/repo.js');
	repo.setContentDB(t.db);
	await setFlag('conector_claude', true);
	await setFlag('conector_claude_edicion', true);
	(await import('$lib/server/flags.js')).clearFlagCache();
	const rpc = await import('./rpc.js');
	const fetchSpy = vi.fn(async () => new Response('no'));
	const platform = /** @type {App.Platform} */ (
		/** @type {unknown} */ ({ env: { DB: t.db, MEDIA: bucket() } })
	);
	const ctx = {
		db: t.db,
		user: { id: admin.id, login: admin.login },
		canEdit,
		via: /** @type {const} */ ('llave'),
		llave: LLAVE,
		fetch: /** @type {typeof fetch} */ (/** @type {unknown} */ (fetchSpy)),
		now: Date.now(),
		platform,
		origin: 'https://ejemplo.test'
	};
	let n = 0;
	/** @param {string} name @param {Record<string, unknown>} args */
	const call = async (name, args) => {
		const r = /** @type {any} */ (
			await rpc.handleMessage(
				{ jsonrpc: '2.0', id: ++n, method: 'tools/call', params: { name, arguments: args } },
				{ ...ctx, now: Date.now() }
			)
		);
		return /** @type {{ isError: boolean, structuredContent?: any, content: { text: string }[] }} */ (
			r.result
		);
	};
	return { call, ctx, platform, fetchSpy };
}

/** Cuántos objetos de un tipo hay. @param {string} type */
const countOf = async (type) =>
	Number(
		/** @type {any} */ (
			await t.db.prepare('SELECT COUNT(*) AS n FROM objects WHERE type = ?1').bind(type).first()
		).n
	);

/** Una PNG inventada de 800 × 600 y sus dos copias WEBP de las medidas que corresponden. */
function pngWithCopies(rgb = /** @type {[number, number, number]} */ ([12, 90, 200])) {
	const png = solidPng(800, 600, rgb);
	const c360 = copySize(800, 600, 360);
	const c720 = copySize(800, 600, 720);
	return {
		png,
		copia_360: toBase64(fakeWebp(c360.width, c360.height, 1)),
		copia_720: toBase64(fakeWebp(c720.width, c720.height, 2))
	};
}

describe('subir una imagen y usarla', () => {
	it('PNG → en la biblioteca con copias → buscar → portada de un evento → la página la muestra', async () => {
		const s = await setup();
		const { png, copia_360, copia_720 } = pngWithCopies();
		const up = await s.call('subir_imagen', {
			contenido: toBase64(png),
			nombre: 'Flyer inventado de la fiesta',
			alt: 'Un cuadrado azul de prueba',
			copia_360,
			copia_720,
			confirmado_por: 'Mel',
			pedido: 'Subí el flyer y ponelo de portada'
		});
		expect(up.isError, up.content[0].text).toBe(false);
		const img = up.structuredContent;
		expect(img).toMatchObject({
			subido: true,
			nuevo: true,
			tipo: 'imagen',
			titulo: 'Flyer inventado de la fiesta',
			alt: 'Un cuadrado azul de prueba',
			medidas: '800 × 600 px',
			copias_chicas: [360, 720],
			url: expect.stringMatching(/^https:\/\/ejemplo\.test\/media\/img\/[0-9a-f]{64}\.png$/),
			miniatura: expect.stringMatching(/\/media\/img\/[0-9a-f]{64}-360\.webp$/)
		});
		expect(img.avisos).toEqual([]);
		// En R2: el original y sus dos copias.
		expect(await bucket().head(`img/${img.slug}.png`)).not.toBeNull();
		expect(await bucket().head(`img/${img.slug}-360.webp`)).not.toBeNull();
		expect(await bucket().head(`img/${img.slug}-720.webp`)).not.toBeNull();
		// Quién la subió: la rutina, su admin y quién la pidió; en Actividad, sin el pedido.
		const row = /** @type {any} */ (
			await t.db.prepare('SELECT created_by FROM objects WHERE id = ?1').bind(img.id).first()
		);
		expect(row.created_by).toBe(`rutina «${LLAVE.name}» (@${admin.login}) · pedido por Mel`);
		const log = /** @type {any} */ (
			await t.db
				.prepare(
					`SELECT summary, detail FROM admin_audit WHERE action = 'conector.subir_imagen' ORDER BY id DESC LIMIT 1`
				)
				.first()
		);
		expect(log.summary).toBe(
			'Claude, confirmado por Mel: subió la imagen «Flyer inventado de la fiesta» a la biblioteca'
		);
		expect(log.detail).not.toMatch(/ponelo de portada/);

		const found = await s.call('buscar', { texto: 'flyer inventado', tipo: 'imagen' });
		expect(found.isError, found.content[0].text).toBe(false);
		expect(found.structuredContent.resultados).toEqual([
			expect.objectContaining({ id: img.id, miniatura: img.miniatura, usos: [] })
		]);

		// Usarla sigue siendo un cambio en dos pasos, con el id que dio la subida.
		const args = {
			operacion: 'editar_objeto',
			tipo: 'evento',
			objeto: EVENT,
			cambios: { imagen: String(img.id) }
		};
		const preview = await s.call('vista_previa', args);
		expect(preview.isError, preview.content[0].text).toBe(false);
		expect(preview.structuredContent.resumen).toMatch(
			/imagen: sin imagen → Flyer inventado de la fiesta/
		);
		const { hash, version } = preview.structuredContent;
		const applied = await s.call('aplicar', { ...args, hash, version, confirmado_por: 'Mel' });
		expect(applied.isError, applied.content[0].text).toBe(false);

		const event = /** @type {any} */ (
			await t.db
				.prepare(
					`SELECT o.slug FROM objects o JOIN content_sources s ON s.object_id = o.id
					WHERE o.type = 'evento' AND s.legacy_slug = ?1`
				)
				.bind(EVENT)
				.first()
		);
		const { sitePost } = await import('$lib/server/contenido/posts.js');
		const page = await sitePost(s.platform, 'calendario', event.slug);
		expect(/** @type {any} */ (page.meta ?? page).featured).toBe(`/media/img/${img.slug}.png`);

		const read = await s.call('leer', { nombre: img.slug, tipo: 'imagen' });
		expect(read.structuredContent).toMatchObject({
			encontrado: true,
			id: img.id,
			creado: { por: row.created_by },
			usos: [expect.objectContaining({ tipo: 'evento' })]
		});
		expect(s.fetchSpy).not.toHaveBeenCalled();
	});

	it('los mismos bytes dos veces son una sola imagen', async () => {
		const s = await setup();
		const png = solidPng(40, 30);
		const a = await s.call('subir_imagen', { contenido: toBase64(png), nombre: 'Primera' });
		const b = await s.call('subir_imagen', {
			contenido: toBase64(png),
			nombre: 'Segunda',
			alt: 'Un rectángulo violeta'
		});
		expect(a.isError || b.isError, b.content[0].text).toBe(false);
		expect(b.structuredContent).toMatchObject({
			id: a.structuredContent.id,
			nuevo: false,
			titulo: 'Primera',
			// Si no tenía texto alternativo, lo toma (como el panel).
			alt: 'Un rectángulo violeta'
		});
		expect(b.structuredContent.avisos[0]).toMatch(/Ya estaba en la biblioteca/);
		// Sin copias: lo avisa (la tarjeta usa la original hasta la pasada de copias).
		expect(a.structuredContent.avisos.join(' ')).toMatch(/copias chicas/);
		expect(await countOf('imagen')).toBe(1);
	});
});

describe('lo que no se sube', () => {
	it('un tipo que miente con la extensión, un PDF como imagen y una imagen como archivo', async () => {
		const s = await setup();
		const html = new TextEncoder().encode('<html><script>alert(1)</script></html>');
		const lie = await s.call('subir_imagen', { contenido: toBase64(html), nombre: 'foto.png' });
		expect(lie.isError).toBe(true);
		expect(lie.content[0].text).toMatch(/No es una imagen JPG, PNG, WEBP, GIF o AVIF/);
		const pdf = await s.call('subir_imagen', { contenido: toBase64(fakePdf()), nombre: 'x.png' });
		expect(pdf.content[0].text).toMatch(/subilo con `subir_archivo`/);
		const img = await s.call('subir_archivo', {
			contenido: toBase64(solidPng(4, 4)),
			nombre: 'Programa.pdf'
		});
		expect(img.content[0].text).toMatch(/subila con `subir_imagen`/);
		expect(await countOf('imagen')).toBe(0);
		expect(await countOf('archivo')).toBe(0);
	});

	it('más de 2000 px, más de lo que entra en un mensaje y una dirección en vez de bytes', async () => {
		const s = await setup();
		const wide = await s.call('subir_imagen', {
			contenido: toBase64(solidPng(2400, 10)),
			nombre: 'Muy ancha'
		});
		expect(wide.isError).toBe(true);
		expect(wide.content[0].text).toMatch(/2400 × 10 px: el lado más largo puede tener hasta 2000/);
		const big = await s.call('subir_archivo', {
			contenido: toBase64(fakePdf(1024 * 1024 + 10)),
			nombre: 'Muy pesado'
		});
		expect(big.content[0].text).toMatch(/máximo en un mensaje.*`pedir_subida`/);
		const url = await s.call('subir_imagen', {
			contenido: 'https://ejemplo.test/una-foto.png',
			nombre: 'De otro lado'
		});
		expect(url.content[0].text).toMatch(/No bajo archivos de otras direcciones/);
		expect(s.fetchSpy).not.toHaveBeenCalled();
		expect(await countOf('imagen')).toBe(0);
	});

	it('el tope por día, por llave', async () => {
		const s = await setup();
		for (let i = 0; i < UPLOAD_CAPS.count.limit; i++) {
			expect(await uploadCountAllowed(t.db, `conector:llave:${LLAVE.id}`)).toBe(true);
		}
		const r = await s.call('subir_imagen', {
			contenido: toBase64(solidPng(5, 5)),
			nombre: 'Una más'
		});
		expect(r.isError).toBe(true);
		expect(r.content[0].text).toMatch(/tope de subidas del conector: 30 por día y 200 MB/);
		expect(await countOf('imagen')).toBe(0);
	});

	it('sin permiso de cambiar no aparece ni sube', async () => {
		const s = await setup({ canEdit: false });
		const r = await s.call('subir_imagen', { contenido: toBase64(solidPng(5, 5)), nombre: 'X' });
		expect(r.isError).toBe(true);
		expect(r.content[0].text).toMatch(/solo tiene permiso de lectura/);
		expect(await countOf('imagen')).toBe(0);
	});
});

describe('en dos pasos', () => {
	it('pedir_subida → PUT → confirmar_subida (y confirmar de nuevo da lo mismo)', async () => {
		const s = await setup();
		const { receiveUploadPart } = await import('./biblioteca.js');
		const asked = await s.call('pedir_subida', {
			tipo: 'imagen',
			nombre: 'Flyer grande',
			alt: 'Un cuadrado verde',
			confirmado_por: 'Pau'
		});
		expect(asked.isError, asked.content[0].text).toBe(false);
		const { subida, url } = asked.structuredContent;
		expect(url).toBe(`https://ejemplo.test/mcp/subida/${subida}`);
		// Confirmar antes del PUT: todavía no llegó.
		const early = await s.call('confirmar_subida', { subida });
		expect(early.content[0].text).toMatch(/Todavía no llegó/);

		const { png, copia_360, copia_720 } = pngWithCopies([20, 160, 60]);
		/** @param {Uint8Array} body @param {string | null} part */
		const put = (body, part = null) =>
			receiveUploadPart(t.db, bucket(), {
				token: subida,
				part,
				bytes: async (max) => (body.length > max ? null : body)
			});
		expect((await put(png)).status).toBe(201);
		expect((await put(png)).status).toBe(409);
		const b64 = (/** @type {string} */ x) => Uint8Array.from(atob(x), (c) => c.charCodeAt(0));
		expect((await put(b64(copia_360), '360')).status).toBe(201);
		expect((await put(b64(copia_720), '720')).status).toBe(201);

		const done = await s.call('confirmar_subida', { subida });
		expect(done.isError, done.content[0].text).toBe(false);
		expect(done.structuredContent).toMatchObject({
			nuevo: true,
			titulo: 'Flyer grande',
			alt: 'Un cuadrado verde',
			copias_chicas: [360, 720]
		});
		const again = await s.call('confirmar_subida', { subida });
		expect(again.structuredContent).toMatchObject({ id: done.structuredContent.id, nuevo: false });
		expect(await countOf('imagen')).toBe(1);
		const row = /** @type {any} */ (
			await t.db
				.prepare('SELECT created_by FROM objects WHERE id = ?1')
				.bind(done.structuredContent.id)
				.first()
		);
		expect(row.created_by).toMatch(/· pedido por Pau$/);
	});

	it('un video por PUT; lo que miente, lo muy pesado y una firma tocada se rechazan', async () => {
		const s = await setup();
		const { receiveUploadPart } = await import('./biblioteca.js');
		const asked = await s.call('pedir_subida', { tipo: 'archivo', nombre: 'Video de prueba' });
		const { subida } = asked.structuredContent;
		/** @param {string} token @param {Uint8Array} body */
		const put = (token, body) =>
			receiveUploadPart(t.db, bucket(), {
				token,
				part: null,
				bytes: async (max) => (body.length > max ? null : body)
			});
		const tampered = subida.slice(0, -1) + (subida.endsWith('A') ? 'B' : 'A');
		expect((await put(tampered, fakeMp4())).status).toBe(403);
		const html = new TextEncoder().encode('<!doctype html><title>x</title>'.padEnd(200, ' '));
		const lie = await put(subida, html);
		expect(lie.status).toBe(415);
		const heavy = await put(subida, new Uint8Array(25 * 1024 * 1024 + 1));
		expect(heavy).toMatchObject({ status: 413, body: { error: expect.stringMatching(/25 MB/) } });
		expect((await put(subida, fakeMp4('isom', 5000))).status).toBe(201);
		const done = await s.call('confirmar_subida', { subida });
		expect(done.isError, done.content[0].text).toBe(false);
		expect(done.structuredContent).toMatchObject({
			tipo: 'archivo',
			titulo: 'Video de prueba',
			clase: 'Video MP4',
			url: expect.stringMatching(/\/media\/file\/[0-9a-f]{64}\.mp4$/)
		});
		const found = await s.call('buscar', { texto: 'video', tipo: 'archivo' });
		expect(found.structuredContent.total).toBe(1);
	});
});
