/**
 * Ajustes › Comunicación › Textos del bot: solo admins (página y guardar), guarda solo lo
 * cambiado y validado, queda en Actividad sin el texto y el bot lo usa enseguida. D1 de
 * miniflare; datos inventados.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import { ADMINS } from '$lib/server/auth';
import { navItem } from '$lib/admin/nav.js';
import { BOT_TEXT_DEFAULTS } from '$lib/utils/botTexts.js';
import { buildPreview, PREVIEW_SCREENS, screenForKey } from '$lib/admin/botTextPreview.js';
import { BOT_TEXTS_SETTING, botTextOverrides } from '$lib/server/telegram/texts.js';
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
});

const admin = { id: ADMINS[0].id, login: ADMINS[0].login };

/**
 * @param {{ user?: any, form?: Record<string, string> }} [o]
 * @returns {any}
 */
function fakeEvent({ user, form } = {}) {
	const url = new URL('/admin/ajustes/textos-bot', 'https://kinkyvibe.ar');
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

describe('/admin/ajustes/textos-bot', () => {
	it('está en el menú, en Ajustes › Comunicación', () => {
		expect(navItem('ajustes-textos-bot')).toMatchObject({
			href: '/admin/ajustes/textos-bot',
			area: 'ajustes',
			sub: 'comunicacion',
			soon: false
		});
	});

	it('sin sesión redirige al login; sin permiso, 403 (página y guardar)', async () => {
		expect((await thrown(() => page.load(fakeEvent({ user: null }))))?.status).toBe(303);
		const nobody = { id: 1, login: 'persona-sin-permiso' };
		expect((await thrown(() => page.load(fakeEvent({ user: nobody }))))?.status).toBe(403);
		const form = { 'inicio.boton_hoy': 'Intento sin permiso' };
		for (const user of [null, nobody]) {
			const e = await thrown(() => page.actions.save(fakeEvent({ user, form })));
			expect([303, 403]).toContain(e?.status);
		}
		const row = await t.db
			.prepare('SELECT 1 FROM ticket_settings WHERE key = ?1')
			.bind(BOT_TEXTS_SETTING)
			.first();
		expect(row).toBeNull();
		expect(await auditRows()).toEqual([]);
	});

	it('muestra cada texto con su original, por sección', async () => {
		const data = /** @type {any} */ (await page.load(fakeEvent()));
		expect(data.dbAvailable).toBe(true);
		expect(data.saved).toEqual({});
		expect(Object.fromEntries(data.fields.map((/** @type {any} */ f) => [f.key, f.value]))).toEqual(
			BOT_TEXT_DEFAULTS
		);
		expect(data.sections.map((/** @type {any} */ s) => s.label)).toEqual([
			'Inicio y menú',
			'Comandos (el menú «/»)',
			'Eventos',
			'Seguir y avisos',
			'Vincular cuenta',
			'Puerta (admins)',
			'Buscar en todo el sitio y modo inline',
			'Errores'
		]);
	});

	it('guarda solo lo cambiado, lo anota en Actividad (sin el texto) y el bot lo usa', async () => {
		const form = {
			...BOT_TEXT_DEFAULTS,
			'inicio.boton_hoy': 'Hoy mismo',
			'comandos.hoy': 'Lo que hay hoy'
		};
		const r = /** @type {any} */ (await page.actions.save(fakeEvent({ form })));
		expect(r.ok).toBe(true);
		expect(r.message).toMatch(/comandos del menú «\/» se registran solos/);
		expect(await botTextOverrides(t.db)).toEqual({
			'inicio.boton_hoy': 'Hoy mismo',
			'comandos.hoy': 'Lo que hay hoy'
		});
		const [row] = await auditRows();
		expect(row).toMatchObject({
			actor_login: admin.login,
			action: 'settings.save',
			target_id: 'telegram_bot_texts',
			summary: 'Cambió 2 textos del bot de Telegram'
		});
		expect(JSON.parse(String(row.detail))).toEqual({
			changed: ['inicio.boton_hoy', 'comandos.hoy'],
			custom: ['inicio.boton_hoy', 'comandos.hoy']
		});
		expect(String(row.detail)).not.toContain('Hoy mismo');

		const again = /** @type {any} */ (await page.load(fakeEvent()));
		expect(again.saved).toEqual({
			'inicio.boton_hoy': 'Hoy mismo',
			'comandos.hoy': 'Lo que hay hoy'
		});
		expect(again.updatedBy).toBe(admin.login);

		// «Volver al texto original» de todo: se borra la fila.
		await page.actions.save(fakeEvent({ form: { ...BOT_TEXT_DEFAULTS } }));
		expect(await botTextOverrides(t.db)).toEqual({});
	});

	it('con errores no guarda nada y dice qué revisar, en castellano', async () => {
		const form = {
			'inicio.boton_hoy': 'x'.repeat(70),
			'inicio.texto': 'Hola {persona}',
			'eventos.resultados': '**Encontré'
		};
		const r = /** @type {any} */ (await page.actions.save(fakeEvent({ form })));
		expect(r.status).toBe(400);
		expect(r.data.error).toBe('Revisá lo marcado.');
		expect(r.data.errors['inicio.boton_hoy']).toMatch(/64 bytes/);
		expect(r.data.errors['inicio.texto']).toMatch(/\{persona\}/);
		expect(r.data.errors['eventos.resultados']).toMatch(/sin cerrar/);
		expect(r.data.values['inicio.texto']).toBe('Hola {persona}');
		expect(await botTextOverrides(t.db)).toEqual({});
		expect(await auditRows()).toEqual([]);
	});
});

describe('la vista previa', () => {
	it('cada pantalla se arma con los originales y con lo escrito', () => {
		for (const s of PREVIEW_SCREENS) expect(buildPreview(s.id, {}), s.id).toBeTruthy();
		const inicio = buildPreview('inicio', {
			'inicio.boton_hoy': 'HOY',
			'inicio.texto': '**Hola** <x>'
		});
		expect(inicio.html).toBe('<b>Hola</b> &lt;x&gt;');
		expect(inicio.buttons?.[0][0].text).toBe('HOY');
		const menu = buildPreview('comandos', { 'comandos.hoy': 'Lo de hoy' });
		expect(menu.commands?.find((c) => c.command === 'hoy')?.description).toBe('Lo de hoy');
	});

	it('al tocar un campo salta a su pantalla; los sueltos se muestran solos', () => {
		expect(screenForKey('inicio.boton_fondo')).toBe('inicio');
		expect(screenForKey('comandos.sigo')).toBe('comandos');
		expect(screenForKey('errores.despacio')).toBe('solo');
		expect(buildPreview('solo', {}, 'errores.despacio')).toEqual({ toast: 'Más despacio 🙂' });
		expect(buildPreview('solo', {}, 'eventos.boton_mapa').buttons?.[0][0].text).toBe(
			'🗺 Cómo llegar'
		);
	});
});
