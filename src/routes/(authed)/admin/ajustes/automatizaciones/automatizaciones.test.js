/**
 * Ajustes → Automatizaciones: solo admins (sin sesión, 303 al login; sin permiso, 403) y nunca un
 * secreto en lo que llega al navegador. «Actualizar comandos del bot» (`?/comandos`) con `fetch` de
 * mentira: nunca sale nada a la red. D1 de miniflare.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createTestDB } from '$lib/server/db/testing.js';
import { ADMINS } from '$lib/server/auth';
import { fakeRequestEvent, thrown } from '$lib/server/series/fixtures.js';
import { setFlag } from '$lib/server/flags.js';

vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

/** @type {Awaited<ReturnType<typeof createTestDB>>} */
let t;
beforeAll(async () => {
	t = await createTestDB();
});
afterAll(async () => {
	await t?.dispose();
});
afterEach(() => {
	vi.doUnmock('$env/dynamic/private');
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
	vi.resetModules();
});

const TOKEN = '987654:TOKEN-INVENTADO-PARA-LA-PRUEBA';
const SECRET = 'secreto-inventado-del-webhook-0001';

async function page({ token = TOKEN } = {}) {
	vi.resetModules();
	vi.doMock('$env/dynamic/private', () => ({
		env: { TELEGRAM_BOT_TOKEN: token, TELEGRAM_WEBHOOK_SECRET: SECRET, TELEGRAM_BOT_ENABLED: '1' }
	}));
	return import('./+page.server.js');
}

/**
 * `fetch` de mentira que contesta como Telegram (y se guarda lo que le mandan).
 *
 * @param {{ status?: number, body?: unknown }} [reply]
 */
function stubTelegram({ status = 200, body = { ok: true, result: true } } = {}) {
	const f = vi.fn(
		async (/** @type {any} */ _url, /** @type {any} */ _init) =>
			new Response(JSON.stringify(body), { status })
	);
	vi.stubGlobal('fetch', f);
	return f;
}

/** Las entradas del registro de los comandos del bot. */
async function auditRows() {
	const { results } = await t.db
		.prepare("SELECT * FROM admin_audit WHERE action = 'telegram.commands' ORDER BY id")
		.all();
	return /** @type {any[]} */ (results);
}

const admin = { id: ADMINS[0].id, login: ADMINS[0].login };
/** @param {any} user */
const ev = (user) =>
	fakeRequestEvent({ platform: t.platform, path: '/admin/ajustes/automatizaciones', user });
/** @param {any} user */
const post = (user) =>
	fakeRequestEvent({
		platform: t.platform,
		path: '/admin/ajustes/automatizaciones?/comandos',
		user,
		form: {}
	});

describe('/admin/ajustes/automatizaciones', () => {
	it('sin sesión: al login; sin permiso: 403', async () => {
		const { load } = await page();
		expect(await thrown(() => load(ev(null)))).toMatchObject({ status: 303 });
		expect(await thrown(() => load(ev({ id: 1, login: 'alguien-de-prueba' })))).toMatchObject({
			status: 403
		});
	});

	it('admins: crons, mails, Telegram y reglas; sin el token ni el secreto', async () => {
		const { load } = await page();
		const data = /** @type {any} */ (await load(ev(admin)));
		expect(data.crons.map((/** @type {any} */ c) => c.id)).toEqual([
			'cron-recordatorios',
			'cron-backup'
		]);
		expect(data.mails.length).toBeGreaterThan(0);
		expect(data.telegram).toMatchObject({ state: 'on' });
		expect(data.rules.soon).toBe(true);
		const all = JSON.stringify(data);
		expect(all).not.toContain(TOKEN);
		expect(all).not.toContain(SECRET);
	});

	it('dice si el token está cargado, sin el valor', async () => {
		expect(/** @type {any} */ (await (await page()).load(ev(admin))).telegramTokenOk).toBe(true);
		const none = /** @type {any} */ (await (await page({ token: '' })).load(ev(admin)));
		expect(none.telegramTokenOk).toBe(false);
	});
});

describe('?/comandos (Actualizar comandos del bot)', () => {
	it('sin sesión: al login; sin permiso: 403; y no llama a Telegram', async () => {
		const f = stubTelegram();
		const { actions } = await page();
		expect(await thrown(() => actions.comandos(post(null)))).toMatchObject({ status: 303 });
		expect(
			await thrown(() => actions.comandos(post({ id: 1, login: 'alguien-de-prueba' })))
		).toMatchObject({ status: 403 });
		expect(f).not.toHaveBeenCalled();
	});

	it('sin token: lo dice y no hace nada (ni Telegram ni registro)', async () => {
		const f = stubTelegram();
		const before = (await auditRows()).length;
		const { actions } = await page({ token: '' });
		const r = /** @type {any} */ (await actions.comandos(post(admin)));
		expect(r.status).toBe(400);
		expect(r.data.commandsError).toContain('Falta el token del bot');
		expect(f).not.toHaveBeenCalled();
		expect(await auditRows()).toHaveLength(before);
	});

	it('admins: registra los tres alcances, contesta qué quedó y lo anota', async () => {
		await setFlag(t.db, 'lo_que_sigo', false, { by: 'prueba' });
		const f = stubTelegram();
		const { actions } = await page();
		const r = /** @type {any} */ (await actions.comandos(post(admin)));
		expect(r.commandsOk).toBe(true);
		const PUBLIC = [
			'inicio',
			'proximos',
			'hoy',
			'semana',
			'finde',
			'evento',
			'buscar',
			'fondo',
			'ayuda'
		];
		expect(r.commandsResults.map((/** @type {any} */ x) => [x.scope, x.commands])).toEqual([
			['default', PUBLIC],
			['all_group_chats', PUBLIC],
			['all_private_chats', PUBLIC]
		]);
		expect(f).toHaveBeenCalledTimes(3);
		for (const [url] of f.mock.calls) {
			const u = new URL(url);
			expect(u.host).toBe('api.telegram.org');
			expect(u.pathname).toBe(`/bot${TOKEN}/setMyCommands`);
		}
		expect(JSON.stringify(r)).not.toContain(TOKEN);
		const rows = await auditRows();
		const last = rows[rows.length - 1];
		expect(last).toMatchObject({ actor_login: admin.login, target_id: 'telegram:commands' });
		expect(last.summary).toBe('Actualizó los comandos del bot de Telegram');
		expect(String(last.detail)).not.toContain(TOKEN);
	});

	it('con «Lo que sigo»: por privado suma los de la cuenta', async () => {
		await setFlag(t.db, 'lo_que_sigo', true, { by: 'prueba' });
		const f = stubTelegram();
		const { actions } = await page();
		await actions.comandos(post(admin));
		const bodies = f.mock.calls.map(([, init]) => JSON.parse(init.body));
		expect(bodies[2]).toEqual({
			scope: { type: 'all_private_chats' },
			commands: [
				{ command: 'inicio', description: 'Volver al inicio del bot' },
				{ command: 'proximos', description: 'Los próximos eventos públicos' },
				{ command: 'hoy', description: 'Los eventos de hoy' },
				{ command: 'semana', description: 'Lo que hay en los próximos 7 días' },
				{ command: 'finde', description: 'Lo que hay este fin de semana' },
				{ command: 'evento', description: 'Buscá un evento por nombre, fecha o lugar' },
				{
					command: 'buscar',
					description: 'Buscá en todo el sitio: eventos, material, Kinkipedia y amigues'
				},
				{ command: 'fondo', description: 'Cuánto juntó el Fondo Kinky Vibe este mes' },
				{ command: 'ayuda', description: 'Qué podés pedirme' },
				{ command: 'vincular', description: 'Conectá tu cuenta (código de Mi rincón)' },
				{ command: 'sigo', description: 'Lo que seguís en Lo que sigo' },
				{ command: 'silenciar', description: 'Pausá tus avisos por Telegram' },
				{ command: 'reanudar', description: 'Volvé a recibir tus avisos' },
				{ command: 'desvincular', description: 'Desconectá este chat de tu cuenta' }
			]
		});
		await setFlag(t.db, 'lo_que_sigo', false, { by: 'prueba' });
	});

	it('si Telegram falla: el error, sin el token, y queda anotado', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		stubTelegram({
			status: 401,
			body: { ok: false, error_code: 401, description: `Unauthorized for ${TOKEN}` }
		});
		const { actions } = await page();
		const r = /** @type {any} */ (await actions.comandos(post(admin)));
		expect(r.status).toBe(502);
		expect(r.data.commandsError).toBeTruthy();
		expect(r.data.commandsResults[0]).toMatchObject({ ok: false });
		expect(r.data.commandsResults[0].error).toContain('401');
		expect(JSON.stringify(r)).not.toContain(TOKEN);
		const rows = await auditRows();
		expect(rows[rows.length - 1].summary).toContain('falló');
	});
});
