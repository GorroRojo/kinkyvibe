/**
 * La lista de comandos del bot: que el router y lo que se registra en Telegram no se separen, y
 * los `setMyCommands` exactos. `fetch` de mentira y token inventado: nunca sale nada a la red.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import {
	ACCOUNT_COMMANDS,
	HANDLED_COMMANDS,
	HIDDEN_COMMANDS,
	PUBLIC_COMMANDS,
	commandPayloads,
	registerBotCommands
} from './commands.js';
import { callTelegramApi } from './send.js';
import { handleUpdate } from './router.js';
import { UNKNOWN_TEXT } from './format.js';

const TOKEN = '000000:token-inventado-para-pruebas';

const PUBLIC = [
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
	{ command: 'ayuda', description: 'Qué podés pedirme' }
];
/** En los grupos, los mismos como comandos efímeros (Bot API 10.2). */
const GROUP = PUBLIC.map((c) => ({ ...c, is_ephemeral: true }));
const ACCOUNT = [
	{ command: 'vincular', description: 'Conectá tu cuenta (código de Mi rincón)' },
	{ command: 'sigo', description: 'Lo que seguís en Lo que sigo' },
	{ command: 'silenciar', description: 'Pausá tus avisos por Telegram' },
	{ command: 'reanudar', description: 'Volvé a recibir tus avisos' },
	{ command: 'desvincular', description: 'Desconectá este chat de tu cuenta' }
];

/**
 * `fetch` de mentira que contesta como Telegram.
 *
 * @param {(url: URL) => { status?: number, body?: unknown }} [respond]
 */
const fakeFetch = (respond = () => ({})) =>
	vi.fn(async (/** @type {any} */ url, /** @type {any} */ _init) => {
		const { status = 200, body = { ok: true, result: true } } = respond(new URL(url));
		return new Response(JSON.stringify(body), { status });
	});

/** @param {ReturnType<typeof fakeFetch>} f */
const calls = (f) =>
	f.mock.calls.map(([url, init]) => ({ url: new URL(url), init, body: JSON.parse(init.body) }));

describe('la lista', () => {
	it('es la que se acordó, con descripciones válidas para Telegram', () => {
		expect(PUBLIC_COMMANDS).toEqual(PUBLIC);
		expect(ACCOUNT_COMMANDS).toEqual(ACCOUNT);
		for (const c of [...PUBLIC_COMMANDS, ...ACCOUNT_COMMANDS]) {
			expect(c.command).toMatch(/^[a-z0-9_]{1,32}$/);
			expect(c.description.length).toBeGreaterThan(0);
			expect(c.description.length).toBeLessThanOrEqual(256);
		}
	});

	it('empieza por /inicio (el inicio del bot), en los tres alcances', () => {
		expect(PUBLIC_COMMANDS[0]).toEqual({
			command: 'inicio',
			description: 'Volver al inicio del bot'
		});
		for (const accounts of [true, false]) {
			for (const payload of commandPayloads({ accounts })) {
				expect(payload.commands[0].command, payload.scope.type).toBe('inicio');
			}
		}
		// `/start` sigue andando, pero no va en el menú.
		expect(HIDDEN_COMMANDS).toContain('start');
		expect(PUBLIC_COMMANDS.some((c) => c.command === 'start')).toBe(false);
	});

	it('lo que entiende el router es lo listado más /start y /help, y viceversa', () => {
		expect([...HANDLED_COMMANDS].sort()).toEqual(
			[...PUBLIC.map((c) => c.command), ...ACCOUNT.map((c) => c.command), ...HIDDEN_COMMANDS].sort()
		);
		// Cada `case` del router tiene que estar en la lista (si no, nunca se llegaría a él).
		const source = readFileSync(fileURLToPath(new URL('./router.js', import.meta.url)), 'utf8');
		const cases = source
			.split("case '")
			.slice(1)
			.map((part) => part.slice(0, part.indexOf("'")));
		expect(cases.length).toBeGreaterThan(0);
		for (const name of cases) expect(HANDLED_COMMANDS.has(name)).toBe(true);
	});

	it('cada comando listado tiene respuesta propia; uno que no está, «No entendí»', async () => {
		const deps = {
			listUpcoming: async () => [],
			origin: 'https://ejemplo.test',
			accounts: async () => ({
				link: async () => /** @type {const} */ ('invalid'),
				unlink: async () => false,
				setMuted: async () => false
			})
		};
		/** @param {string} text */
		const ask = async (text) =>
			/** @type {any} */ (
				await handleUpdate({ message: { chat: { id: 7, type: 'private' }, text } }, deps)
			);
		for (const name of HANDLED_COMMANDS) {
			const res = await ask(`/${name}`);
			expect(res?.method, name).toBe('sendMessage');
			expect(res.text, name).not.toBe(UNKNOWN_TEXT);
		}
		expect((await ask('/inventado')).text).toBe(UNKNOWN_TEXT);
	});
});

describe('commandPayloads', () => {
	it('con «Lo que sigo»: todes ven los públicos (efímeros en grupos); por privado, además los de la cuenta', () => {
		expect(commandPayloads({ accounts: true })).toEqual([
			{ commands: PUBLIC, scope: { type: 'default' } },
			{ commands: GROUP, scope: { type: 'all_group_chats' } },
			{ commands: [...PUBLIC, ...ACCOUNT], scope: { type: 'all_private_chats' } }
		]);
	});

	it('sin «Lo que sigo»: también por privado, solo los públicos (pisa lo de antes)', () => {
		expect(commandPayloads({ accounts: false })).toEqual([
			{ commands: PUBLIC, scope: { type: 'default' } },
			{ commands: GROUP, scope: { type: 'all_group_chats' } },
			{ commands: PUBLIC, scope: { type: 'all_private_chats' } }
		]);
	});

	it('los de la cuenta nunca son efímeros ni van a los grupos', () => {
		const [def, group] = commandPayloads({ accounts: true });
		for (const c of [...def.commands, ...group.commands]) {
			expect(ACCOUNT.map((a) => a.command)).not.toContain(c.command);
		}
		expect(group.commands.every((c) => c.is_ephemeral === true)).toBe(true);
		expect(def.commands.some((c) => 'is_ephemeral' in c)).toBe(false);
	});
});

describe('registerBotCommands', () => {
	it('manda los tres setMyCommands exactos, sin language_code', async () => {
		const f = fakeFetch();
		const r = await registerBotCommands({ token: TOKEN, accounts: true, fetch: f });
		const sent = calls(f);
		expect(sent).toHaveLength(3);
		for (const c of sent) {
			expect(c.url.origin).toBe('https://api.telegram.org');
			expect(c.url.pathname).toBe(`/bot${TOKEN}/setMyCommands`);
			expect(c.init.method).toBe('POST');
			expect(c.init.headers).toEqual({ 'content-type': 'application/json' });
			expect(c.body).not.toHaveProperty('language_code');
		}
		expect(sent.map((c) => c.body)).toEqual([
			{ commands: PUBLIC, scope: { type: 'default' } },
			{ commands: GROUP, scope: { type: 'all_group_chats' } },
			{ commands: [...PUBLIC, ...ACCOUNT], scope: { type: 'all_private_chats' } }
		]);
		expect(r).toEqual({
			ok: true,
			results: [
				{
					scope: 'default',
					label: 'Para todes (respaldo)',
					commands: PUBLIC.map((c) => c.command),
					ok: true
				},
				{
					scope: 'all_group_chats',
					label: 'En grupos (efímeros: solo los ve quien pregunta)',
					commands: PUBLIC.map((c) => c.command),
					ok: true
				},
				{
					scope: 'all_private_chats',
					label: 'En chats privados',
					commands: [
						'inicio',
						'proximos',
						'hoy',
						'semana',
						'finde',
						'evento',
						'buscar',
						'fondo',
						'ayuda',
						'vincular',
						'sigo',
						'silenciar',
						'reanudar',
						'desvincular'
					],
					ok: true
				}
			]
		});
	});

	it('es idempotente: dos veces mandan lo mismo', async () => {
		const f = fakeFetch();
		await registerBotCommands({ token: TOKEN, accounts: false, fetch: f });
		await registerBotCommands({ token: TOKEN, accounts: false, fetch: f });
		const bodies = calls(f).map((c) => c.body);
		expect(bodies).toHaveLength(6);
		expect(bodies.slice(3)).toEqual(bodies.slice(0, 3));
	});

	it('sin token: no llama a nada', async () => {
		const f = fakeFetch();
		for (const token of [undefined, '', '   ']) {
			expect(await registerBotCommands({ token, accounts: true, fetch: f })).toEqual({
				ok: false,
				reason: 'no_token'
			});
		}
		expect(f).not.toHaveBeenCalled();
	});

	it('si Telegram falla, lo dice por alcance y nunca con el token', async () => {
		const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
		const f = fakeFetch((url) =>
			url.pathname.endsWith('/setMyCommands')
				? {
						status: 401,
						body: { ok: false, error_code: 401, description: `Unauthorized ${TOKEN}` }
					}
				: {}
		);
		const r = await registerBotCommands({ token: TOKEN, accounts: true, fetch: f });
		expect(r.ok).toBe(false);
		const results = /** @type {any} */ (r).results;
		expect(results.map((/** @type {any} */ x) => x.ok)).toEqual([false, false, false]);
		expect(results[0].error).toContain('401');
		expect(JSON.stringify(r)).not.toContain(TOKEN);
		expect(JSON.stringify(spy.mock.calls)).not.toContain(TOKEN);
		spy.mockRestore();
	});
});

describe('callTelegramApi', () => {
	it('sin red: un error corto, sin el token ni la URL', async () => {
		const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
		const boom = vi.fn(async () => {
			throw new TypeError(`fetch failed https://api.telegram.org/bot${TOKEN}/setMyCommands`);
		});
		const r = await callTelegramApi({
			token: TOKEN,
			method: 'setMyCommands',
			body: {},
			fetch: boom
		});
		expect(r.ok).toBe(false);
		expect(JSON.stringify(r)).not.toContain(TOKEN);
		expect(JSON.stringify(r)).not.toContain('api.telegram.org');
		expect(JSON.stringify(spy.mock.calls)).not.toContain(TOKEN);
		spy.mockRestore();
	});

	it('200 con ok: false también es un error', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const f = fakeFetch(() => ({ body: { ok: false, description: 'Bad Request: algo' } }));
		const r = await callTelegramApi({ token: TOKEN, method: 'setMyCommands', body: {}, fetch: f });
		expect(r).toEqual({
			ok: false,
			status: 200,
			error: 'Telegram respondió 200: Bad Request: algo.',
			description: 'Bad Request: algo'
		});
		vi.restoreAllMocks();
	});
});
