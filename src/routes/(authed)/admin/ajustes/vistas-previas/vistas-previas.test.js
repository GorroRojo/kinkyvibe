/**
 * Ajustes › Comunicación › Vistas previas al compartir: solo admins, guarda solo los textos
 * cambiados (validados), queda en el registro de actividad y el sitio los usa enseguida. D1 de
 * miniflare; datos inventados.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import { ADMINS } from '$lib/server/auth';
import { navItem } from '$lib/admin/nav.js';
import { PREVIEW_TEXT_DEFAULTS } from '$lib/utils/previewTexts.js';
import {
	PREVIEW_TEXTS_SETTING,
	clearLinkPreviewCache,
	linkPreviewData
} from '$lib/server/linkPreview.js';
import * as page from './+page.server.js';

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
	clearLinkPreviewCache();
});

const admin = { id: ADMINS[0].id, login: ADMINS[0].login };

/**
 * @param {{ user?: any, form?: Record<string, string> }} [o]
 * @returns {any}
 */
function fakeEvent({ user, form } = {}) {
	const url = new URL('/admin/ajustes/vistas-previas', 'https://kinkyvibe.ar');
	const body = new FormData();
	for (const [k, v] of Object.entries(form ?? {})) body.set(k, v);
	return {
		url,
		params: {},
		platform: t.platform,
		locals: { user: user === undefined ? admin : user, user_token: user === null ? '' : 't' },
		setHeaders: () => {},
		request: new Request(url, { method: 'POST', body })
	};
}

/** @param {() => unknown} fn @returns {Promise<any>} */
async function thrown(fn) {
	try {
		await fn();
		return null;
	} catch (e) {
		return e;
	}
}

async function auditRows() {
	const { results } = await t.db
		.prepare('SELECT actor_login, action, target_id, summary, detail FROM admin_audit ORDER BY id')
		.all();
	return results;
}

describe('/admin/ajustes/vistas-previas', () => {
	it('está en el menú, en Ajustes › Comunicación', () => {
		expect(navItem('ajustes-vistas-previas')).toMatchObject({
			href: '/admin/ajustes/vistas-previas',
			area: 'ajustes',
			sub: 'comunicacion',
			soon: false
		});
	});

	it('sin sesión redirige al login; sin permiso, 403 (página y guardar)', async () => {
		expect((await thrown(() => page.load(fakeEvent({ user: null }))))?.status).toBe(303);
		const nobody = { id: 1, login: 'persona-sin-permiso' };
		expect((await thrown(() => page.load(fakeEvent({ user: nobody }))))?.status).toBe(403);
		const form = { 'home.title': 'Intento sin permiso' };
		expect((await thrown(() => page.actions.save(fakeEvent({ user: nobody, form }))))?.status).toBe(
			403
		);
		const row = await t.db
			.prepare('SELECT 1 FROM ticket_settings WHERE key = ?1')
			.bind(PREVIEW_TEXTS_SETTING)
			.first();
		expect(row).toBeNull();
		expect(await auditRows()).toEqual([]);
	});

	it('muestra cada texto con su original', async () => {
		const data = /** @type {any} */ (await page.load(fakeEvent()));
		expect(data.dbAvailable).toBe(true);
		expect(data.saved).toEqual({});
		expect(Object.fromEntries(data.fields.map((/** @type {any} */ f) => [f.key, f.value]))).toEqual(
			PREVIEW_TEXT_DEFAULTS
		);
		// las imágenes de ahora, una por tarjeta
		expect(Object.keys(data.images).sort()).toEqual([
			'amigues',
			'calendario',
			'default',
			'material',
			'wiki'
		]);
		expect(data.images.calendario).toMatch(/^\/og\/calendario\/[0-9a-f]{16}\.jpg$/);
	});

	it('guarda solo lo cambiado, lo anota en la actividad y el sitio lo usa al toque', async () => {
		const before = await linkPreviewData(t.platform);
		const form = {
			...PREVIEW_TEXT_DEFAULTS,
			'calendario.description': 'Una descripción inventada.',
			'calendario.cardName': 'Agenda'
		};
		const res = await page.actions.save(fakeEvent({ form }));
		expect(res).toMatchObject({ ok: true });
		const saved = /** @type {any} */ (await page.load(fakeEvent()));
		expect(saved.saved).toEqual({
			'calendario.description': 'Una descripción inventada.',
			'calendario.cardName': 'Agenda'
		});
		expect(saved.updatedBy).toBe(admin.login);
		const rows = await auditRows();
		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({
			actor_login: admin.login,
			action: 'settings.save',
			target_id: 'link_preview_texts',
			summary: 'Cambió 2 textos de las vistas previas al compartir'
		});
		expect(JSON.parse(String(rows[0].detail)).changed).toEqual([
			'calendario.description',
			'calendario.cardName'
		]);
		const after = await linkPreviewData(t.platform);
		expect(after.texts['calendario.description']).toBe('Una descripción inventada.');
		// cambió el nombre de la imagen del calendario: otra dirección; las otras, igual
		expect(after.images?.calendario).not.toBe(before.images?.calendario);
		expect(after.images?.material).toBe(before.images?.material);
	});

	it('{x} tiene que quedar: 400, no guarda nada ni lo anota', async () => {
		const res = /** @type {any} */ (
			await page.actions.save(fakeEvent({ form: { 'filtros.oneTag': 'con la etiqueta' } }))
		);
		expect(res.status).toBe(400);
		expect(res.data.errors['filtros.oneTag']).toContain('{x}');
		expect(res.data.values['filtros.oneTag']).toBe('con la etiqueta');
		expect(/** @type {any} */ (await page.load(fakeEvent())).saved).toEqual({});
		expect(await auditRows()).toEqual([]);
	});

	it('todo igual al original borra la fila (volver al original)', async () => {
		await page.actions.save(fakeEvent({ form: { 'home.title': 'Título inventado' } }));
		await page.actions.save(fakeEvent({ form: { ...PREVIEW_TEXT_DEFAULTS } }));
		const row = await t.db
			.prepare('SELECT 1 FROM ticket_settings WHERE key = ?1')
			.bind(PREVIEW_TEXTS_SETTING)
			.first();
		expect(row).toBeNull();
		expect((await linkPreviewData(t.platform)).texts['home.title']).toBe('Kinky Vibe');
		const rows = await auditRows();
		expect(rows.map((r) => r.summary)).toEqual([
			'Cambió un texto de las vistas previas al compartir',
			'Cambió un texto de las vistas previas al compartir'
		]);
	});
});
