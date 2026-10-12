/**
 * «Textos del bot» en el bot: que cada clave que usa el código exista (y que no sobre ninguna),
 * que lo cambiado en el panel llegue a las pantallas, las respuestas, los avisos, el webhook
 * (también en `waitUntil`) y al `setMyCommands`, y cómo se guarda. D1 de miniflare y `fetch` de
 * mentira; datos inventados.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import { BOT_TEXT_FIELDS } from '$lib/utils/botTexts.js';
import {
	ACCOUNT_COMMANDS,
	PUBLIC_COMMANDS,
	commandPayloads,
	registerBotCommands
} from './commands.js';
import { commandsHash, getCommandsSync, syncBotCommands } from './commandsSync.js';
import { followedText, formatFollowNotice } from './format.js';
import { planUpdate } from './router.js';
import { homeScreen } from './screens.js';
import {
	BOT_TEXTS_SETTING,
	botText,
	readBotTextOverrides,
	runWithBotTexts,
	saveBotTextOverrides
} from './texts.js';
import { handleWebhook } from './webhook.js';

vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

const ORIGIN = 'https://ejemplo.test';
const TOKEN = '000000:token-inventado-para-pruebas';
const EVENTS = [
	{ slug: 'fiesta-inventada', title: 'Fiesta inventada', start: '2031-01-10T23:00:00-03:00' }
];

// ---------------------------------------------------------------------------------------------
// Que el registro y el código no se separen
// ---------------------------------------------------------------------------------------------

const DIR = new URL('./', import.meta.url);
/** Todo el código del bot que puede pedir un texto (sin las pruebas). */
const SOURCES = [
	...readdirSync(DIR)
		.filter((f) => f.endsWith('.js') && !f.endsWith('.test.js') && !f.includes('fixtures'))
		.map((f) => readFileSync(new URL(f, DIR), 'utf8')),
	readFileSync(new URL('../sigo/notify.js', import.meta.url), 'utf8')
].join('\n');

const KEYS = new Set(BOT_TEXT_FIELDS.map((f) => f.key));
/** Las claves escritas enteras en el código (`botText('inicio.texto')`). */
const literal = new Set(
	[...SOURCES.matchAll(/(?:botText|renderBotText|htmlOf)\(\s*'([a-z]+\.[a-z_]+)'/g)].map(
		(m) => m[1]
	)
);
// Las que se piden con un ternario: `botText(cond ? 'a.b' : 'c.d')`.
for (const m of SOURCES.matchAll(
	/botText\(\s*[^'()]*\?\s*'([a-z]+\.[a-z_]+)'\s*:\s*'([a-z]+\.[a-z_]+)'/g
)) {
	literal.add(m[1]);
	literal.add(m[2]);
}
for (const m of SOURCES.matchAll(/\?\s*'(seguir\.[a-z_]+)'/g)) literal.add(m[1]);
for (const m of SOURCES.matchAll(/:\s*'(seguir\.[a-z_]+)'/g)) literal.add(m[1]);
for (const m of SOURCES.matchAll(/'(seguir\.aviso_[a-z]+)'/g)) literal.add(m[1]);
// Los de la página de la Mini App, por nombre (`TEXT_KEYS` de miniapp.js).
for (const m of SOURCES.matchAll(/'(miniapp\.[a-z_]+)'/g)) literal.add(m[1]);
/** Las que se arman: `eventos.titulo_<lista>`, `eventos.vacio_<lista>` y `comandos.<comando>`. */
const LISTS = ['hoy', 'semana', 'finde', 'proximos'];
const built = new Set([
	...LISTS.flatMap((l) => [`eventos.titulo_${l}`, `eventos.vacio_${l}`]),
	...[...PUBLIC_COMMANDS, ...ACCOUNT_COMMANDS].map((c) => `comandos.${c.command}`)
]);

describe('el registro y el código', () => {
	it('cada clave que pide el bot existe', () => {
		expect(literal.size).toBeGreaterThan(50);
		for (const key of literal) expect(KEYS.has(key), key).toBe(true);
	});

	it('las claves que se arman siguen armándose así en el código', () => {
		expect(SOURCES).toContain('botText(`eventos.titulo_${LIST_TEXT[view]}`)');
		expect(SOURCES).toContain('botText(`eventos.vacio_${LIST_TEXT[view]}`');
		expect(SOURCES).toContain(
			"Object.freeze({ d: 'hoy', w: 'semana', f: 'finde', p: 'proximos' })"
		);
		expect(SOURCES).toContain('renderBotText(`comandos.${c.command}`, {}, texts)');
	});

	it('no sobra ninguna: cada clave del registro la usa el bot', () => {
		const used = new Set([...literal, ...built]);
		const orphans = [...KEYS].filter((k) => !used.has(k));
		expect(orphans).toEqual([]);
	});

	it('los comandos del registro son exactamente los del menú', () => {
		const inRegistry = BOT_TEXT_FIELDS.filter((f) => f.section === 'comandos').map((f) =>
			f.key.slice('comandos.'.length)
		);
		expect(inRegistry).toEqual([...PUBLIC_COMMANDS, ...ACCOUNT_COMMANDS].map((c) => c.command));
	});
});

// ---------------------------------------------------------------------------------------------
// Lo cambiado llega al bot
// ---------------------------------------------------------------------------------------------

const CTX = /** @type {const} */ ({ origin: ORIGIN, chat: 'private', now: 0, sigo: false });

describe('runWithBotTexts y botText', () => {
	it('fuera de un pedido, los originales; adentro, lo cambiado (también después de un await)', async () => {
		expect(botText('inicio.boton_hoy')).toBe('Hoy');
		await runWithBotTexts({ 'inicio.boton_hoy': 'Hoy mismo' }, async () => {
			expect(botText('inicio.boton_hoy')).toBe('Hoy mismo');
			await new Promise((r) => setTimeout(r, 1));
			expect(botText('inicio.boton_hoy')).toBe('Hoy mismo');
		});
		expect(botText('inicio.boton_hoy')).toBe('Hoy');
	});

	it('dos pedidos a la vez no se mezclan', async () => {
		const a = runWithBotTexts({ 'inicio.boton_hoy': 'A' }, async () => {
			await new Promise((r) => setTimeout(r, 5));
			return botText('inicio.boton_hoy');
		});
		const b = runWithBotTexts({ 'inicio.boton_hoy': 'B' }, async () => botText('inicio.boton_hoy'));
		expect(await Promise.all([a, b])).toEqual(['A', 'B']);
	});

	it('lo inválido se ignora (sale el original)', () => {
		runWithBotTexts({ 'inicio.boton_hoy': '<b>x</b>', 'no.existe': 'x' }, () => {
			expect(botText('inicio.boton_hoy')).toBe('Hoy');
		});
	});

	it('la pantalla de inicio usa el texto y los botones cambiados, con las variables', () => {
		const texts = {
			'inicio.texto': '**Buenas** <gente>',
			'inicio.boton_buscar': '🔍 Buscá',
			'inicio.boton_sitio': 'Ir a {sitio}'
		};
		const screen = runWithBotTexts(texts, () => homeScreen(CTX));
		expect(screen.text).toBe('<b>Buenas</b> &lt;gente&gt;');
		const labels = screen.keyboard.flat().map((b) => b.text);
		expect(labels).toContain('🔍 Buscá');
		expect(labels).toContain('Ir a ejemplo.test');
		// el callback_data no cambia con el texto
		expect(screen.keyboard[1][0]).toMatchObject({ text: '🔍 Buscá', callback_data: 's' });
	});

	it('un aviso de botón cambiado con < va escapado cuando sale como mensaje', async () => {
		const plan = await runWithBotTexts({ 'errores.no_entendi': 'No entendí <eso> & aquello' }, () =>
			planUpdate(
				{ message: { chat: { id: 1, type: 'private' }, text: '/nada' } },
				{ listUpcoming: async () => EVENTS, origin: ORIGIN }
			)
		);
		expect(plan?.steps[0]).toMatchObject({
			text: 'No entendí &lt;eso&gt; &amp; aquello',
			parse_mode: 'HTML'
		});
	});

	it('y como aviso del botón va tal cual (texto solo)', async () => {
		const plan = await runWithBotTexts({ 'errores.no_entendi': 'No entendí <eso>' }, () =>
			planUpdate(
				{ callback_query: { id: 'cb', data: 'zzz', message: { message_id: 1, chat: { id: 1 } } } },
				{ listUpcoming: async () => EVENTS, origin: ORIGIN }
			)
		);
		expect(plan?.callback).toEqual({ id: 'cb', text: 'No entendí <eso>' });
	});

	it('el aviso al seguir: lo cambiado, y sigue entrando en 200 (se acorta el nombre)', () => {
		const texts = { 'seguir.listo': '¡Ya seguís {nombre}!', 'seguir.listo_telegram': 'Te aviso.' };
		runWithBotTexts(texts, () => {
			expect(followedText('Cuerdas', { telegram: true })).toBe('¡Ya seguís Cuerdas!\nTe aviso.');
			const long = followedText('x'.repeat(300), { telegram: true });
			expect(long.length).toBeLessThanOrEqual(200);
			expect(long.endsWith('\nTe aviso.')).toBe(true);
		});
	});

	it('el aviso de Lo que sigo por Telegram usa los textos que le pasa el cron', () => {
		const notice = {
			kind: /** @type {const} */ ('nuevo'),
			title: 'T',
			start: '',
			url: 'https://x.y'
		};
		expect(formatFollowNotice(notice, { 'seguir.aviso_nuevo': '✨ **Nuevo**' })).toBe(
			'✨ <b>Nuevo</b>\n\n<b>T</b>\nhttps://x.y'
		);
		expect(formatFollowNotice(notice, {})).toBe(
			'🆕 Se anunció algo nuevo\n\n<b>T</b>\nhttps://x.y'
		);
	});

	it('Buscar: reconoce la respuesta al mensaje cambiado y al original', async () => {
		const deps = { listUpcoming: async () => EVENTS, origin: ORIGIN };
		const texts = { 'eventos.buscar': '**¿Qué buscás?** Respondé acá.' };
		/** @param {string} prompt */
		const reply = (prompt) => ({
			message: {
				chat: { id: 1, type: 'private' },
				text: 'fiesta',
				reply_to_message: { from: { is_bot: true }, text: prompt }
			}
		});
		for (const prompt of ['¿Qué buscás? Respondé acá.', '🔎 Escribí qué buscás: lo que sea']) {
			const plan = await runWithBotTexts(texts, () => planUpdate(reply(prompt), deps));
			expect(plan?.steps[0].text, prompt).toContain('Fiesta inventada');
		}
		const other = await runWithBotTexts(texts, () => planUpdate(reply('Otra cosa'), deps));
		expect(other).toBeNull();
	});
});

describe('commandPayloads y registerBotCommands', () => {
	it('sin textos cambiados, los originales; con textos, las descripciones cambiadas en los tres alcances', async () => {
		expect(commandPayloads({ accounts: true })).toEqual(
			commandPayloads({ accounts: true, texts: {} })
		);
		const texts = { 'comandos.hoy': 'Lo de hoy', 'comandos.sigo': 'Tus cosas' };
		const payloads = commandPayloads({ accounts: true, texts });
		for (const p of payloads) {
			expect(p.commands.find((c) => c.command === 'hoy')?.description).toBe('Lo de hoy');
		}
		expect(payloads[2].commands.find((c) => c.command === 'sigo')?.description).toBe('Tus cosas');
		const f = vi.fn(async () => new Response(JSON.stringify({ ok: true, result: true })));
		await registerBotCommands({ token: TOKEN, accounts: false, fetch: f, texts });
		for (const [, init] of /** @type {any[]} */ (f.mock.calls)) {
			const hoy = JSON.parse(init.body).commands.find(
				(/** @type {any} */ c) => c.command === 'hoy'
			);
			expect(hoy.description).toBe('Lo de hoy');
		}
	});
});

// ---------------------------------------------------------------------------------------------
// Con la base: guardar, leer, el cron y el webhook
// ---------------------------------------------------------------------------------------------

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

describe('guardar y leer', () => {
	it('sin fila, nada; guarda solo lo cambiado, con quién y cuándo; vacío borra la fila', async () => {
		expect(await readBotTextOverrides(t.db)).toEqual({
			overrides: {},
			updatedAt: null,
			updatedBy: null
		});
		await saveBotTextOverrides(
			t.db,
			{ 'inicio.boton_hoy': 'Hoy!' },
			{ by: 'admin-de-prueba', now: 5 }
		);
		expect(await readBotTextOverrides(t.db)).toEqual({
			overrides: { 'inicio.boton_hoy': 'Hoy!' },
			updatedAt: 5,
			updatedBy: 'admin-de-prueba'
		});
		await saveBotTextOverrides(t.db, {}, { by: 'admin-de-prueba' });
		const row = await t.db
			.prepare('SELECT 1 FROM ticket_settings WHERE key = ?1')
			.bind(BOT_TEXTS_SETTING)
			.first();
		expect(row).toBeNull();
	});

	it('un JSON roto o sin base: los originales, sin tirar', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		await t.db
			.prepare(
				"INSERT INTO ticket_settings (key, value, updated_at, updated_by) VALUES (?1, '{roto', 1, 'x')"
			)
			.bind(BOT_TEXTS_SETTING)
			.run();
		expect((await readBotTextOverrides(t.db)).overrides).toEqual({});
		expect((await readBotTextOverrides(null)).overrides).toEqual({});
	});
});

describe('el cron registra las descripciones cambiadas', () => {
	it('cambiar una descripción en el panel cambia el hash y se manda en setMyCommands', async () => {
		vi.spyOn(console, 'log').mockImplementation(() => {});
		const ok = () => vi.fn(async () => new Response(JSON.stringify({ ok: true, result: true })));
		expect(await syncBotCommands({ db: t.db, token: TOKEN, now: 1, fetch: ok() })).toBe('synced');
		await saveBotTextOverrides(t.db, { 'comandos.hoy': 'Lo de hoy' }, { by: 'admin-de-prueba' });
		const f = ok();
		expect(await syncBotCommands({ db: t.db, token: TOKEN, now: 2, fetch: f })).toBe('synced');
		expect(f).toHaveBeenCalledTimes(3);
		for (const [, init] of /** @type {any[]} */ (f.mock.calls)) {
			const hoy = JSON.parse(init.body).commands.find(
				(/** @type {any} */ c) => c.command === 'hoy'
			);
			expect(hoy.description).toBe('Lo de hoy');
		}
		expect((await getCommandsSync(t.db))?.hash).toBe(
			await commandsHash({ accounts: false, texts: { 'comandos.hoy': 'Lo de hoy' } })
		);
		expect(await syncBotCommands({ db: t.db, token: TOKEN, now: 3, fetch: ok() })).toBe(
			'unchanged'
		);
	});
});

describe('el webhook usa lo cambiado, también en waitUntil', () => {
	const SECRET = 'un-secreto-de-prueba-largo';
	/** @param {string} text */
	const request = (text) =>
		new Request(`${ORIGIN}/api/telegram`, {
			method: 'POST',
			headers: { 'x-telegram-bot-api-secret-token': SECRET },
			body: JSON.stringify({ message: { chat: { id: 7, type: 'private' }, text } })
		});

	it('sin token, en la respuesta; con token, en lo que manda a la API', async () => {
		await saveBotTextOverrides(
			t.db,
			{ 'inicio.texto': '**Hola, gente**' },
			{ by: 'admin-de-prueba' }
		);
		const texts = vi.fn(async () => (await readBotTextOverrides(t.db)).overrides);
		const base = {
			secret: SECRET,
			enabled: true,
			origin: ORIGIN,
			listUpcoming: async () => EVENTS,
			texts
		};
		const res = await handleWebhook({ ...base, request: request('/start') });
		expect((await res.json()).text).toBe('<b>Hola, gente</b>');

		const f = vi.fn(
			async (/** @type {any} */ _u, /** @type {any} */ _i) =>
				new Response(JSON.stringify({ ok: true, result: true }))
		);
		/** @type {Promise<unknown>[]} */
		const tasks = [];
		await handleWebhook({
			...base,
			request: request('/start'),
			token: TOKEN,
			fetch: f,
			waitUntil: (x) => tasks.push(x)
		});
		await Promise.all(tasks);
		expect(JSON.parse(f.mock.calls[0][1].body).text).toBe('<b>Hola, gente</b>');
		expect(texts).toHaveBeenCalledTimes(2);
	});

	it('los textos se leen después del secreto (sin secreto, ni se piden)', async () => {
		const texts = vi.fn(async () => ({}));
		const res = await handleWebhook({
			secret: SECRET,
			enabled: true,
			origin: ORIGIN,
			listUpcoming: async () => EVENTS,
			texts,
			request: new Request(`${ORIGIN}/api/telegram`, { method: 'POST', body: '{}' })
		});
		expect(res.status).toBe(401);
		expect(texts).not.toHaveBeenCalled();
	});

	it('si leerlos falla, contesta igual con los originales', async () => {
		const res = await handleWebhook({
			secret: SECRET,
			enabled: true,
			origin: ORIGIN,
			listUpcoming: async () => EVENTS,
			texts: async () => {
				throw new Error('sin base');
			},
			request: request('/start')
		});
		expect((await res.json()).text).toContain('Hola, soy el bot de Kinky Vibe');
	});
});
