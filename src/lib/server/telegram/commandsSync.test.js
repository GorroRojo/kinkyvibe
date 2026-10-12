/**
 * El registro automático del menú «/» (cron): idempotente, reintenta si falla, no hace nada sin
 * token y vuelve a registrar cuando cambia «Lo que sigo». Base de prueba y `fetch` de mentira:
 * nunca sale nada a la red.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import { setFlag } from '$lib/server/flags.js';
import { sha256Hex } from '$lib/server/hash.js';
import { commandPayloads } from './commands.js';
import {
	COMMANDS_SYNC_KEY,
	commandsHash,
	getCommandsSync,
	storeCommandsSync,
	syncBotCommands
} from './commandsSync.js';

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

const TOKEN = '000000:token-inventado-para-pruebas';
const NOW = Date.parse('2031-01-08T12:00:00-03:00');

/** @param {number} [status] */
const fakeFetch = (status = 200) =>
	vi.fn(async (/** @type {any} */ _url, /** @type {any} */ _init) =>
		status === 200
			? new Response(JSON.stringify({ ok: true, result: true }), { status })
			: new Response(JSON.stringify({ ok: false, description: `Unauthorized ${TOKEN}` }), {
					status
				})
	);

const audit = async () =>
	(await t.db.prepare("SELECT * FROM admin_audit WHERE action = 'telegram.commands'").all())
		.results;

describe('syncBotCommands', () => {
	it('lista nueva: manda los tres alcances, guarda el hash y lo anota como automático', async () => {
		vi.spyOn(console, 'log').mockImplementation(() => {});
		const f = fakeFetch();
		expect(await syncBotCommands({ db: t.db, token: TOKEN, now: NOW, fetch: f })).toBe('synced');
		expect(f).toHaveBeenCalledTimes(3);
		for (const [url] of f.mock.calls)
			expect(new URL(url).pathname).toBe(`/bot${TOKEN}/setMyCommands`);
		expect(await getCommandsSync(t.db)).toEqual({
			hash: await commandsHash({ accounts: false }),
			at: NOW,
			by: 'automático'
		});
		const rows = await audit();
		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({ actor_login: 'automático', target_id: 'telegram:commands' });
		expect(String(rows[0].detail)).not.toContain(TOKEN);
		vi.restoreAllMocks();
	});

	it('misma lista: no llama a Telegram', async () => {
		vi.spyOn(console, 'log').mockImplementation(() => {});
		await syncBotCommands({ db: t.db, token: TOKEN, now: NOW, fetch: fakeFetch() });
		const f = fakeFetch();
		expect(await syncBotCommands({ db: t.db, token: TOKEN, now: NOW + 900e3, fetch: f })).toBe(
			'unchanged'
		);
		expect(f).not.toHaveBeenCalled();
		expect(await audit()).toHaveLength(1);
		vi.restoreAllMocks();
	});

	it('si Telegram falla: no guarda el hash y lo reintenta la próxima corrida, sin el token en el log', async () => {
		const err = vi.spyOn(console, 'error').mockImplementation(() => {});
		vi.spyOn(console, 'log').mockImplementation(() => {});
		expect(await syncBotCommands({ db: t.db, token: TOKEN, now: NOW, fetch: fakeFetch(401) })).toBe(
			'failed'
		);
		expect(await getCommandsSync(t.db)).toBeNull();
		expect(await audit()).toHaveLength(0);
		expect(JSON.stringify(err.mock.calls)).not.toContain(TOKEN);
		const f = fakeFetch();
		expect(await syncBotCommands({ db: t.db, token: TOKEN, now: NOW + 900e3, fetch: f })).toBe(
			'synced'
		);
		expect(f).toHaveBeenCalledTimes(3);
		vi.restoreAllMocks();
	});

	it('sin token: no hace nada', async () => {
		const f = fakeFetch();
		for (const token of [undefined, '', '  ']) {
			expect(await syncBotCommands({ db: t.db, token, now: NOW, fetch: f })).toBe('no_token');
		}
		expect(f).not.toHaveBeenCalled();
		expect(await getCommandsSync(t.db)).toBeNull();
	});

	it('prender «Lo que sigo» vuelve a registrar (con los comandos de la cuenta)', async () => {
		vi.spyOn(console, 'log').mockImplementation(() => {});
		await syncBotCommands({ db: t.db, token: TOKEN, now: NOW, fetch: fakeFetch() });
		await setFlag(t.db, 'lo_que_sigo', true, { by: 'prueba' });
		const f = fakeFetch();
		expect(await syncBotCommands({ db: t.db, token: TOKEN, now: NOW + 900e3, fetch: f })).toBe(
			'synced'
		);
		const privateBody = JSON.parse(f.mock.calls[2][1].body);
		expect(privateBody.scope).toEqual({ type: 'all_private_chats' });
		expect(privateBody.commands.map((/** @type {any} */ c) => c.command)).toContain('vincular');
		expect((await getCommandsSync(t.db))?.hash).toBe(await commandsHash({ accounts: true }));
		vi.restoreAllMocks();
	});

	it('/inicio va primero en los tres alcances, con y sin «Lo que sigo»', async () => {
		vi.spyOn(console, 'log').mockImplementation(() => {});
		for (const [i, on] of [false, true].entries()) {
			await setFlag(t.db, 'lo_que_sigo', on, { by: 'prueba' });
			const f = fakeFetch();
			expect(
				await syncBotCommands({ db: t.db, token: TOKEN, now: NOW + i * 900e3, fetch: f })
			).toBe('synced');
			const bodies = f.mock.calls.map(([, init]) => JSON.parse(init.body));
			expect(bodies.map((b) => b.scope.type)).toEqual([
				'default',
				'all_group_chats',
				'all_private_chats'
			]);
			for (const b of bodies) {
				expect(b.commands[0]).toMatchObject({
					command: 'inicio',
					description: 'Volver al inicio del bot'
				});
			}
		}
		vi.restoreAllMocks();
	});

	it('lo registrado antes de /inicio cambia el hash: el cron lo vuelve a registrar', async () => {
		vi.spyOn(console, 'log').mockImplementation(() => {});
		const withoutInicio = commandPayloads({ accounts: false }).map((p) => ({
			...p,
			commands: p.commands.filter((c) => c.command !== 'inicio')
		}));
		await storeCommandsSync(
			t.db,
			{ hash: await sha256Hex(JSON.stringify(withoutInicio)), at: NOW, by: 'manual' },
			'admin-de-prueba'
		);
		const f = fakeFetch();
		expect(await syncBotCommands({ db: t.db, token: TOKEN, now: NOW + 900e3, fetch: f })).toBe(
			'synced'
		);
		expect(f).toHaveBeenCalledTimes(3);
		vi.restoreAllMocks();
	});

	it('el botón manual guarda el mismo hash: el cron después no repite', async () => {
		await setFlag(t.db, 'lo_que_sigo', false, { by: 'prueba' });
		await storeCommandsSync(
			t.db,
			{ hash: await commandsHash({ accounts: false }), at: NOW, by: 'manual' },
			'admin-de-prueba'
		);
		const f = fakeFetch();
		expect(await syncBotCommands({ db: t.db, token: TOKEN, now: NOW, fetch: f })).toBe('unchanged');
		expect(f).not.toHaveBeenCalled();
		expect((await getCommandsSync(t.db))?.by).toBe('manual');
		const row = await t.db
			.prepare('SELECT updated_by FROM ticket_settings WHERE key = ?1')
			.bind(COMMANDS_SYNC_KEY)
			.first();
		expect(row?.updated_by).toBe('admin-de-prueba');
	});
});
