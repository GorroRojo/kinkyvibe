/**
 * Las preguntas «Foto» (docs/formularios.md, «Foto»; docs/gancho-api.md): la subida desde la
 * página pública (el mismo FormData multipart con y sin JavaScript), guardada en R2 bajo
 * `formularios/` (no en la biblioteca pública `img/`, que /media no sirve), sin metadatos, el tipo
 * por los bytes (no por el nombre), el tope de peso y el de megabytes por conexión; la foto en el
 * panel (solo admins) y la API de Gancho (secreto). D1 y R2 de miniflare; datos inventados.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const env = vi.hoisted(() => ({ value: /** @type {Record<string, string>} */ ({}) }));
vi.mock('$env/dynamic/private', () => ({ env: env.value }));

import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import { clearFlagCache } from '$lib/server/flags.js';
import { ADMINS } from '$lib/server/auth.js';
import { hitRateLimit } from '$lib/server/db/rateLimit.js';
import { clientOf } from '$lib/server/cuentas/web.js';
import {
	createForm,
	getForm,
	saveForm,
	saveResponse,
	setFormOpen
} from '$lib/server/formularios/store.js';
import { applyPayment, reserveOrder } from '$lib/server/tickets/orders.js';
import { PHOTO_RATE_LIMIT } from '$lib/server/formularios/photos.js';
import { solidPng } from '$lib/server/media/testing.js';
import {
	PHOTO_MAX_BYTES,
	isPhotoKey,
	photoFile,
	responsesCsvRows
} from '$lib/utils/formularios.js';
import { responsesView } from '$lib/server/formularios/responses.js';
import * as page from './[slug]/+page.server.js';
import * as adminPhoto from '../../(authed)/admin/comunidad/formularios/[id]/respuestas/fotos/[file]/+server.js';
import * as ganchoList from '../../api/gancho/formularios/[slug]/respuestas/+server.js';
import * as ganchoPhoto from '../../api/gancho/formularios/[slug]/fotos/[responseId]/[questionId]/+server.js';
import * as media from '../../media/[...key]/+server.js';

vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

const SECRET = 'gancho-secreto-de-prueba-0123456789';
const IP = '203.0.113.20';

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
	env.value.FORMULARIOS_ENABLED = '1';
	env.value.GANCHO_SECRET = SECRET;
	clearFlagCache();
});

const QUESTIONS = [
	{ id: 'p1', kind: 'short', label: 'Tu apodo', required: true, options: [] },
	{ id: 'f1', kind: 'photo', label: 'Tu cara', required: true, options: [] }
];

/** Un JPEG mínimo con un Exif que dice dónde se sacó (GPS inventado). */
const GPS_TEXT = 'GPS -34.6037 -58.3816 fugazz';
function jpegWithGps() {
	const text = new TextEncoder().encode(GPS_TEXT);
	// «Exif\0\0» + TIFF (MM, 42, IFD en 8, cero entradas) + el texto.
	const tiff = [0x4d, 0x4d, 0x00, 0x2a, 0x00, 0x00, 0x00, 0x08, 0x00, 0x00, ...text];
	const app1 = [...new TextEncoder().encode('Exif\0\0'), ...tiff];
	const len = app1.length + 2;
	// prettier-ignore
	return Uint8Array.from([
		0xff, 0xd8,
		0xff, 0xe1, len >> 8, len & 0xff, ...app1,
		// SOF0: 8 bits, 2×2, un componente
		0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x02, 0x00, 0x02, 0x01, 0x01, 0x11, 0x00,
		// SOS y unos bytes de datos
		0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00, 0x12, 0x34, 0x56,
		0xff, 0xd9
	]);
}

/** @param {Uint8Array} bytes @param {string} name @param {string} type */
const fileOf = (bytes, name, type) => new File([bytes], name, { type });

/**
 * @param {{ path: string, params: Record<string, string>, form?: Record<string, string | File>,
 *   user?: any, ip?: string, headers?: Record<string, string> }} o
 */
function fakeEvent({ path, params, form, user, ip = IP, headers = {} }) {
	const url = new URL(path, 'https://kinkyvibe.ar');
	const body = new FormData();
	for (const [k, v] of Object.entries(form ?? {})) body.append(k, v);
	/** @type {any} */
	const event = {
		url,
		params,
		platform: t.platform,
		locals: { user, user_token: user ? 'token-de-prueba' : '', member: undefined },
		setHeaders: () => {},
		cookies: { get: () => undefined, set: () => {}, delete: () => {} },
		getClientAddress: () => ip,
		request: new Request(url, {
			method: form ? 'POST' : 'GET',
			body: form ? body : undefined,
			headers: { 'cf-connecting-ip': ip, ...headers }
		})
	};
	return event;
}

/** @param {Record<string, any>} [over] */
async function openForm(over = {}) {
	const id = await createForm(t.db, { title: 'Gancho de prueba' }, { by: 'x' });
	const form = /** @type {any} */ (await getForm(t.db, id));
	await saveForm(
		t.db,
		id,
		{ ...form, questions: QUESTIONS, privacy: 'named', access: 'link', ...over },
		{ by: 'x' }
	);
	await setFormOpen(t.db, id, true, { by: 'x' });
	return /** @type {any} */ (await getForm(t.db, id));
}

const WHO = { nombre: 'Persona Demo', mail: 'demo@example.com' };

/** @param {any} form @param {Record<string, string | File>} values @param {any} [o] */
const submit = (form, values, o = {}) =>
	page.actions.send(
		fakeEvent({
			path: `/formularios/${form.slug}`,
			params: { slug: form.slug },
			form: values,
			...o
		})
	);

/** Las respuestas guardadas. */
async function stored() {
	const { results } = await t.db
		.prepare('SELECT id, answers FROM form_responses ORDER BY id')
		.all();
	return results.map((r) => ({ id: Number(r.id), answers: JSON.parse(String(r.answers)) }));
}

/** @param {() => unknown} fn @returns {Promise<any>} */
async function thrown(fn) {
	try {
		await fn();
	} catch (e) {
		return e;
	}
	throw new Error('no falló');
}

const bucket = () => /** @type {import('@cloudflare/workers-types').R2Bucket} */ (t.env.MEDIA);

describe('subir una foto desde la página pública', () => {
	it('un PNG: se guarda en R2 bajo formularios/<id>/ (no en img/) y la respuesta lleva la clave', async () => {
		const form = await openForm();
		const png = solidPng(4, 4);
		const r = await submit(form, {
			...WHO,
			p_p1: 'Demo',
			p_f1: fileOf(png, 'cara.png', 'image/png')
		});
		expect(r).toEqual({ sent: true });
		const [row] = await stored();
		const key = row.answers.find((/** @type {any} */ a) => a.id === 'f1').value;
		expect(isPhotoKey(key)).toBe(true);
		expect(key.startsWith(`formularios/${form.id}/`)).toBe(true);
		expect(key.endsWith('.png')).toBe(true);
		const obj = await bucket().get(key);
		expect(obj?.httpMetadata?.contentType).toBe('image/png');
		expect(obj?.httpMetadata?.cacheControl).toBe('private, no-store');
		await obj?.arrayBuffer();
		const lib = await bucket().list({ prefix: 'img/' });
		expect(lib.objects.some((o) => o.key.includes(photoFile(key)))).toBe(false);
		// /media no la sirve (solo la biblioteca: img/ y file/).
		const e = await thrown(() => media.GET(fakeEvent({ path: `/media/${key}`, params: { key } })));
		expect(e.status).toBe(404);
	});

	it('un JPEG con GPS en el Exif sale sin él', async () => {
		const form = await openForm();
		const jpeg = jpegWithGps();
		expect(new TextDecoder('latin1').decode(jpeg)).toContain(GPS_TEXT);
		expect(
			await submit(form, { ...WHO, p_p1: 'Demo', p_f1: fileOf(jpeg, 'cara.jpg', 'image/jpeg') })
		).toEqual({ sent: true });
		const [row] = await stored();
		const key = row.answers.find((/** @type {any} */ a) => a.id === 'f1').value;
		const obj = await bucket().get(key);
		const saved = new Uint8Array(await /** @type {any} */ (obj).arrayBuffer());
		expect(saved[0]).toBe(0xff);
		expect(new TextDecoder('latin1').decode(saved)).not.toContain('GPS');
		expect(saved.length).toBeLessThan(jpeg.length);
	});

	it('un archivo que no es imagen con nombre y tipo de imagen: rechazado, sin guardar', async () => {
		const form = await openForm();
		const fake = new TextEncoder().encode('<html><script>alert(1)</script></html>');
		const r = /** @type {any} */ (
			await submit(form, { ...WHO, p_p1: 'Demo', p_f1: fileOf(fake, 'cara.png', 'image/png') })
		);
		expect(r.status).toBe(400);
		expect(r.data.errors.f1).toMatch(/JPG, PNG/);
		expect(await stored()).toEqual([]);
		expect((await bucket().list({ prefix: `formularios/${form.id}/` })).objects).toEqual([]);
	});

	it(`más de ${PHOTO_MAX_BYTES / 1024 / 1024} MB: rechazada`, async () => {
		const form = await openForm();
		const big = new Uint8Array(PHOTO_MAX_BYTES + 1);
		big.set(solidPng(2, 2));
		const r = /** @type {any} */ (
			await submit(form, { ...WHO, p_p1: 'Demo', p_f1: fileOf(big, 'cara.png', 'image/png') })
		);
		expect(r.status).toBe(400);
		expect(r.data.errors.f1).toMatch(/MB/);
		expect(await stored()).toEqual([]);
	});

	it('obligatoria: sin foto, error; un texto en el campo (una clave ajena) no cuenta como foto', async () => {
		const form = await openForm();
		const r = /** @type {any} */ (await submit(form, { ...WHO, p_p1: 'Demo' }));
		expect(r.status).toBe(400);
		expect(r.data.errors.f1).toBe('Subí una foto.');
		const other = `formularios/${form.id}/${'a'.repeat(64)}.png`;
		const r2 = /** @type {any} */ (await submit(form, { ...WHO, p_p1: 'Demo', p_f1: other }));
		expect(r2.status).toBe(400);
		expect(r2.data.errors.f1).toBe('Subí una foto.');
		expect(await stored()).toEqual([]);
	});

	it('si falla otro campo, pide volver a elegir la foto', async () => {
		const form = await openForm();
		const r = /** @type {any} */ (
			await submit(form, { ...WHO, p_f1: fileOf(solidPng(3, 3), 'c.png', 'image/png') })
		);
		expect(r.status).toBe(400);
		expect(r.data.errors).toMatchObject({
			p1: 'Completá esta respuesta.',
			f1: 'Volvé a elegir la foto.'
		});
	});

	it('tope de megabytes de fotos por formulario y conexión', async () => {
		const form = await openForm();
		const client = await clientOf(fakeEvent({ path: '/', params: {} }));
		await hitRateLimit(
			t.db,
			`form:${form.id}:foto:${client}`,
			PHOTO_RATE_LIMIT,
			Date.now(),
			PHOTO_RATE_LIMIT.limit
		);
		const png = () => fileOf(solidPng(4, 4, [1, 2, 3]), 'c.png', 'image/png');
		const r = /** @type {any} */ (await submit(form, { ...WHO, p_p1: 'Demo', p_f1: png() }));
		expect(r.status).toBe(429);
		// Otra conexión sí puede.
		expect(
			await submit(form, { ...WHO, p_p1: 'Demo', p_f1: png() }, { ip: '198.51.100.7' })
		).toEqual({ sent: true });
	});
});

describe('la foto en el panel y en la API de Gancho', () => {
	/** Un formulario con una respuesta con foto. */
	async function withPhoto() {
		const form = await openForm();
		await submit(form, {
			...WHO,
			p_p1: 'Demo',
			p_f1: fileOf(solidPng(5, 5), 'cara.png', 'image/png')
		});
		const [row] = await stored();
		const key = row.answers.find((/** @type {any} */ a) => a.id === 'f1').value;
		return { form, row, key };
	}

	it('el panel: solo admins, privada, sin caché; una foto de otro formulario, 404', async () => {
		const { form, key } = await withPhoto();
		const file = photoFile(key);
		const path = `/admin/comunidad/formularios/${form.id}/respuestas/fotos/${file}`;
		const anon = await thrown(() =>
			adminPhoto.GET(fakeEvent({ path, params: { id: String(form.id), file } }))
		);
		expect(anon.status).toBe(303);
		const notAdmin = await thrown(() =>
			adminPhoto.GET(fakeEvent({ path, params: { id: String(form.id), file }, user: { id: -1 } }))
		);
		expect(notAdmin.status).toBe(403);
		const admin = { id: ADMINS[0].id, login: ADMINS[0].login };
		const res = await adminPhoto.GET(
			fakeEvent({ path, params: { id: String(form.id), file }, user: admin })
		);
		expect(res.status).toBe(200);
		expect(res.headers.get('content-type')).toBe('image/png');
		expect(res.headers.get('cache-control')).toBe('private, no-store');
		expect(new Uint8Array(await res.arrayBuffer())[1]).toBe(0x50);
		const other = await openForm({ slug: 'otro' });
		const wrong = await thrown(() =>
			adminPhoto.GET(fakeEvent({ path, params: { id: String(other.id), file }, user: admin }))
		);
		expect(wrong.status).toBe(404);
	});

	it('el CSV lleva «sí», nunca la clave', async () => {
		const { form, key } = await withPhoto();
		const view = await responsesView(t.db, form);
		const [head, row] = responsesCsvRows(form.questions, view.responses, form.privacy);
		expect(row[head.indexOf('Tu cara')]).toBe('sí');
		expect(row.join(',')).not.toContain(photoFile(key));
	});

	/** @param {string} path @param {Record<string, string>} params @param {Record<string, string>} [headers] */
	const api = (path, params, headers = { 'x-gancho-secret': SECRET }) =>
		fakeEvent({ path, params, headers });

	it('la API: sin secreto configurado 404, sin header o con otro 401', async () => {
		const { form } = await withPhoto();
		const path = `/api/gancho/formularios/${form.slug}/respuestas`;
		delete env.value.GANCHO_SECRET;
		expect((await ganchoList.GET(api(path, { slug: form.slug }))).status).toBe(404);
		env.value.GANCHO_SECRET = 'corto';
		expect((await ganchoList.GET(api(path, { slug: form.slug }))).status).toBe(404);
		env.value.GANCHO_SECRET = SECRET;
		expect((await ganchoList.GET(api(path, { slug: form.slug }, {}))).status).toBe(401);
		const wrong = { 'x-gancho-secret': `${SECRET}x` };
		expect((await ganchoList.GET(api(path, { slug: form.slug }, wrong))).status).toBe(401);
		const photoPath = `/api/gancho/formularios/${form.slug}/fotos/1/f1`;
		const params = { slug: form.slug, responseId: '1', questionId: 'f1' };
		expect((await ganchoPhoto.GET(api(photoPath, params, wrong))).status).toBe(401);
	});

	it('la API: las respuestas con quién respondió y la dirección de la foto; la foto, sus bytes', async () => {
		const { form, row } = await withPhoto();
		const res = await ganchoList.GET(
			api(`/api/gancho/formularios/${form.slug}/respuestas`, { slug: form.slug })
		);
		expect(res.status).toBe(200);
		expect(res.headers.get('cache-control')).toBe('private, no-store');
		const body = await res.json();
		expect(body.form).toMatchObject({ slug: form.slug, privacy: 'named' });
		expect(body.responses).toHaveLength(1);
		const r = body.responses[0];
		expect(r).toMatchObject({
			id: row.id,
			anonymous: false,
			name: 'Persona Demo',
			email: 'demo@example.com'
		});
		expect(typeof r.createdAt).toBe('string');
		const photo = r.answers.find((/** @type {any} */ a) => a.id === 'f1');
		expect(photo).toEqual({
			id: 'f1',
			label: 'Tu cara',
			kind: 'photo',
			value: `/api/gancho/formularios/${form.slug}/fotos/${row.id}/f1`
		});
		expect(JSON.stringify(body)).not.toContain('formularios/' + form.id);

		const params = { slug: form.slug, responseId: String(row.id), questionId: 'f1' };
		const img = await ganchoPhoto.GET(api(photo.value, params));
		expect(img.status).toBe(200);
		expect(img.headers.get('content-type')).toBe('image/png');
		expect(img.headers.get('cache-control')).toBe('private, no-store');
		expect(new Uint8Array(await img.arrayBuffer())[1]).toBe(0x50);
		// Una pregunta que no es foto, o una respuesta que no existe: 404.
		expect((await ganchoPhoto.GET(api(photo.value, { ...params, questionId: 'p1' }))).status).toBe(
			404
		);
		expect((await ganchoPhoto.GET(api(photo.value, { ...params, responseId: '999' }))).status).toBe(
			404
		);
	});

	it('la API: `ticket` dice de qué entrada de qué orden es la respuesta que llegó por un link', async () => {
		const form = await openForm({ access: 'ticket', eventSlug: 'fiesta-de-prueba' });
		const r = /** @type {any} */ (
			await reserveOrder(t.db, {
				eventSlug: 'fiesta-de-prueba',
				type: { id: 'general', price: 8000, capacity: 10 },
				quantity: 2,
				holders: [
					{ name: 'Titular Uno', pronouns: 'elle' },
					{ name: 'Titular Dos', pronouns: 'ella' }
				],
				buyer: { name: 'Titular Uno', pronouns: 'elle', email: 'compra@example.com', dni: '1' }
			})
		);
		const orderId = /** @type {string} */ (r.order.id);
		await applyPayment(t.db, {
			id: 1,
			status: 'approved',
			external_reference: orderId,
			transaction_amount: 16000,
			currency_id: 'ARS'
		});
		await t.db
			.prepare(
				"INSERT INTO form_sends (order_id, form_id, sent_at, status, attempts) VALUES (?1, ?2, 1, 'sent', 1)"
			)
			.bind(orderId, form.id)
			.run();
		const answers = [{ id: 'p1', label: 'Tu apodo', value: 'Demo' }];
		const who = { email: 'compra@example.com', orderId };
		await saveResponse(t.db, {
			formId: form.id,
			answers,
			identity: { ...who, name: 'Titular Dos' },
			invite: { orderId, ticket: 2 }
		});
		await saveResponse(t.db, {
			formId: form.id,
			answers,
			identity: { ...who, name: 'Titular Uno' },
			invite: { orderId }
		});
		// Una con nombre de antes de los links por entrada (con orden, sin número): la entrada 1.
		await t.db
			.prepare(
				"INSERT INTO form_responses (form_id, answers, day, anonymous, name, order_id, created_at) VALUES (?1, '[]', '2099-01-01', 0, 'Titular Uno', ?2, 1)"
			)
			.bind(form.id, orderId)
			.run();
		// Sin link personal: `ticket` null.
		await saveResponse(t.db, {
			formId: form.id,
			answers,
			identity: { name: 'Persona Demo', email: 'demo@example.com' }
		});
		const res = await ganchoList.GET(
			api(`/api/gancho/formularios/${form.slug}/respuestas`, { slug: form.slug })
		);
		const body = await res.json();
		const ref = `KV-${orderId.slice(0, 8).toUpperCase()}`;
		expect(body.responses.map((/** @type {any} */ x) => x.ticket)).toEqual([
			{ order: ref, number: 2, holderName: 'Titular Dos' },
			{ order: ref, number: 1, holderName: 'Titular Uno' },
			{ order: ref, number: 1, holderName: 'Titular Uno' },
			null
		]);
		expect(body.responses[0]).toMatchObject({ name: 'Titular Dos', email: 'compra@example.com' });
		// Con la privacidad de hoy en «Anónimo», tampoco va la entrada.
		await saveForm(t.db, form.id, { ...form, privacy: 'anonymous' }, { by: 'x' });
		const hidden = await (
			await ganchoList.GET(
				api(`/api/gancho/formularios/${form.slug}/respuestas`, { slug: form.slug })
			)
		).json();
		expect(hidden.responses.every((/** @type {any} */ x) => x.ticket === null)).toBe(true);
	});

	it('la API no sirve formularios sin «Foto»', async () => {
		const form = await openForm({
			slug: 'sin-foto',
			questions: [{ id: 'p1', kind: 'short', label: 'Algo', required: true, options: [] }]
		});
		const res = await ganchoList.GET(
			api(`/api/gancho/formularios/${form.slug}/respuestas`, { slug: form.slug })
		);
		expect(res.status).toBe(404);
	});
});
