/**
 * Ajustes: la portada (decisión 0042). Solo admins; los cuatro subgrupos con sus tarjetas, y la
 * línea de estado de cada una sale de la base en una tanda. D1 de miniflare; datos inventados.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import { ADMINS } from '$lib/server/auth';
import { FLAGS } from '$lib/server/flags.js';
import { AJUSTES_SUBGROUPS, navAreaSections, navItem } from '$lib/admin/nav.js';
import { BOT_TEXT_FIELDS } from '$lib/utils/botTexts.js';
import { PREVIEW_TEXT_FIELDS } from '$lib/utils/previewTexts.js';
import { PREVIEW_TEXTS_SETTING } from '$lib/server/linkPreview.js';
import { buildAjustesStatus, loadAjustesStatus } from '$lib/server/admin/ajustesStatus.js';
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
const NOW = Date.UTC(2026, 9, 12, 15, 0);
const MIN = 60_000;

/**
 * @param {{ user?: any }} [o]
 * @returns {any}
 */
function fakeEvent({ user } = {}) {
	return {
		url: new URL('/admin/ajustes', 'https://kinkyvibe.ar'),
		params: {},
		platform: t.platform,
		locals: { user: user === undefined ? admin : user, user_token: user === null ? '' : 't' },
		setHeaders: () => {}
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

/**
 * @param {string} key
 * @param {string} value
 */
async function setting(key, value) {
	await t.db
		.prepare(
			"INSERT INTO ticket_settings (key, value, updated_at, updated_by) VALUES (?1, ?2, ?3, 'test')"
		)
		.bind(key, value, NOW)
		.run();
}

/** Dos textos del bot cambiados (los dos primeros botones, con un texto inventado). */
function twoBotTexts() {
	const buttons = BOT_TEXT_FIELDS.filter((f) => !/\{/.test(f.value) && f.value.length < 30);
	return Object.fromEntries(buttons.slice(0, 2).map((f) => [f.key, `${f.value} (prueba)`]));
}

describe('/admin/ajustes (portada)', () => {
	it('sin sesión redirige al login; sin permiso, 403', async () => {
		expect((await thrown(() => page.load(fakeEvent({ user: null }))))?.status).toBe(303);
		const nobody = { id: 1, login: 'persona-sin-permiso' };
		expect((await thrown(() => page.load(fakeEvent({ user: nobody }))))?.status).toBe(403);
	});

	it('es la página del área: la barra lateral y «← Ajustes» llevan acá', () => {
		expect(navItem('ajustes')).toMatchObject({ href: '/admin/ajustes', area: 'ajustes' });
		const groups = navAreaSections('ajustes');
		expect(groups.map((g) => g.id)).toEqual(AJUSTES_SUBGROUPS.map((g) => g.id));
		expect(groups.flatMap((g) => g.items).length).toBe(9);
	});

	it('con la base vacía: los originales, nada en el registro, todo apagado', async () => {
		const data = /** @type {any} */ (await page.load(fakeEvent()));
		const status = data.status;
		expect(status['ajustes-textos-bot']).toEqual({ text: 'Los originales' });
		expect(status['ajustes-vistas-previas']).toEqual({ text: 'Los originales' });
		expect(status.propinas).toEqual({ text: 'Todavía ninguna' });
		expect(status.actividad).toEqual({ text: 'Sin cambios todavía' });
		expect(status['ajustes-admins']).toEqual({
			text: `${ADMINS.length} ${ADMINS.length === 1 ? 'admin' : 'admins'}`
		});
		// Sin Fondo guardado (ni a mano ni el último automático): dice que es automático y que
		// todavía no llegó (ajustes-fondo-linea); no inventa un porcentaje.
		expect(status['ajustes-fondo']).toEqual({
			text: 'Automático (todavía no llegó el porcentaje)'
		});
		// Cada línea que hay es de una sección de Ajustes.
		const ids = new Set(navAreaSections('ajustes').flatMap((g) => g.items.map((i) => i.id)));
		for (const id of Object.keys(status)) expect(ids.has(id), id).toBe(true);
	});

	it('con datos: cada tarjeta dice lo suyo, en una sola tanda más Automatizaciones', async () => {
		await setting('transfer_alias', 'alias.de.prueba');
		await setting('fondo_percent_override', '10');
		await setting('telegram_bot_texts', JSON.stringify(twoBotTexts()));
		await t.db
			.prepare(
				"INSERT INTO feature_flags (key, enabled, updated_at, updated_by) VALUES ('lo_que_sigo', 1, ?1, 'test')"
			)
			.bind(NOW)
			.run();
		await t.db
			.prepare(
				"INSERT INTO admin_audit (at, actor_login, action, summary) VALUES (?1, 'GorroRojo', 'settings.save', 'Prueba')"
			)
			.bind(NOW - 5 * MIN)
			.run();
		for (const [id, status] of [
			['t1', 'approved'],
			['t2', 'approved'],
			['t3', 'pending']
		]) {
			await t.db
				.prepare(
					"INSERT INTO tips (id, amount, status, post_category, post_slug, created_at, updated_at) VALUES (?1, 1000, ?2, 'material', 'nota-de-prueba', ?3, ?3)"
				)
				.bind(id, status, NOW)
				.run();
		}
		const status = await loadAjustesStatus({ db: t.db, env: {}, mpReady: true, now: NOW });
		expect(status['ajustes-cobros']).toEqual({ text: 'Mercado Pago y transferencia' });
		expect(status['ajustes-fondo']).toEqual({ text: '10 % (fijado a mano)' });
		expect(status['ajustes-textos-bot']).toEqual({ text: '2 textos cambiados' });
		expect(status.propinas).toEqual({ text: '2 recibidas' });
		expect(status.actividad).toEqual({ text: 'Último cambio: hace 5 min' });
		const off = Object.keys(FLAGS).length - 1;
		expect(status['ajustes-interruptores']).toEqual({ text: `${off} en prueba`, tone: 'warn' });
		expect(status['ajustes-automatizaciones']).toEqual({ text: 'Todo al día' });
	});

	it('la variable de entorno manda sobre la base en los interruptores (como isFlagOn)', async () => {
		const env = Object.fromEntries(Object.values(FLAGS).map((f) => [f.envVar, '1']));
		const status = await loadAjustesStatus({ db: t.db, env, now: NOW });
		expect(status['ajustes-interruptores']).toEqual({ text: 'Todos prendidos' });
	});

	it('Automatizaciones: si algo falla, lo dice (el chequeo nocturno encontró problemas)', async () => {
		await t.db
			.prepare("INSERT INTO integrity_runs (ran_at, problem_count, problems) VALUES (?1, 3, '[]')")
			.bind(NOW - 60 * MIN)
			.run();
		const status = await loadAjustesStatus({ db: t.db, env: {}, now: NOW });
		expect(status['ajustes-automatizaciones']).toEqual({ text: '1 con problemas', tone: 'warn' });
	});

	it('Fondo: sin el fijado a mano, el último que llegó de fondo.kinkyvibe.ar', async () => {
		await setting('fondo_percent_last', JSON.stringify({ percent: 12, at: NOW - MIN }));
		const status = await loadAjustesStatus({ db: t.db, env: {}, now: NOW });
		expect(status['ajustes-fondo']).toEqual({ text: '12 % de cada entrada' });
	});

	it('Vistas previas: cuántos textos se cambiaron (la misma fila que lee linkPreview.js)', async () => {
		const title = PREVIEW_TEXT_FIELDS.find((f) => f.key === 'home.title');
		expect(title).toBeTruthy();
		await setting(PREVIEW_TEXTS_SETTING, JSON.stringify({ 'home.title': 'Otro título de prueba' }));
		const status = await loadAjustesStatus({ db: t.db, env: {}, now: NOW });
		expect(status['ajustes-vistas-previas']).toEqual({ text: '1 texto cambiado' });
	});

	it('sin base: solo lo que no depende de ella (sin adivinar el resto)', async () => {
		const status = await loadAjustesStatus({ db: null, env: {}, now: NOW });
		expect(Object.keys(status)).toEqual(['ajustes-admins']);
	});
});

describe('buildAjustesStatus (Cobros)', () => {
	const base = {
		flags: null,
		lastActivity: null,
		tips: null,
		automations: null,
		now: NOW
	};
	/** @param {boolean} mpReady @param {Record<string, unknown>[]} settings */
	const cobros = (mpReady, settings) =>
		buildAjustesStatus({ ...base, settings, mpReady })['ajustes-cobros'];
	const alias = [
		{ key: 'transfer_alias', value: 'alias.de.prueba', updated_at: 1, updated_by: 'x' }
	];
	it('dice qué medios se pueden ofrecer y avisa lo que falta', () => {
		expect(cobros(true, alias)).toEqual({ text: 'Mercado Pago y transferencia' });
		expect(cobros(false, alias)).toEqual({
			text: 'Transferencia (falta Mercado Pago)',
			tone: 'warn'
		});
		// Sin datos para transferir (ni en el panel ni en TICKETS_TRANSFER_INFO, que en los tests no está).
		expect(cobros(true, [])).toEqual({
			text: 'Mercado Pago (faltan los datos para transferir)',
			tone: 'warn'
		});
		expect(cobros(false, [])).toEqual({ text: 'Ningún medio de cobro listo', tone: 'warn' });
	});
});

describe('buildAjustesStatus (Fondo)', () => {
	const base = {
		flags: null,
		lastActivity: null,
		tips: null,
		automations: null,
		mpReady: false,
		now: NOW
	};
	const row = (/** @type {string} */ key, /** @type {string} */ value) => ({
		key,
		value,
		updated_at: 1,
		updated_by: 'x'
	});
	const last = row('fondo_percent_last', JSON.stringify({ percent: 12, at: NOW - MIN }));
	/** @param {Record<string, unknown>[]} settings @param {number | null} [fondoDevPercent] */
	const fondo = (settings, fondoDevPercent) =>
		buildAjustesStatus({ ...base, settings, fondoDevPercent })['ajustes-fondo'];
	it('el orden de resolveFondoPercent: a mano, después el de dev, después el último automático', () => {
		expect(fondo([row('fondo_percent_override', '10'), last], 20)).toEqual({
			text: '10 % (fijado a mano)'
		});
		expect(fondo([last], 20)).toEqual({ text: '20 % de cada entrada' });
		expect(fondo([last], null)).toEqual({ text: '12 % de cada entrada' });
		expect(fondo([], null)).toEqual({ text: 'Automático (todavía no llegó el porcentaje)' });
	});
});
