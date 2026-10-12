/**
 * Buscar sin resultados de punta a punta por el router: la respuesta con parecidos, sección, lo
 * que viene y «⭐ Seguir» (noResults.js), el botón de seguir la etiqueta buscada (`sf:`) con sus
 * permisos (como «Seguir» en una tarjeta: privado, vinculado, «Lo que sigo» prendido) y que no
 * quede en ningún log qué se buscó. Índice, árbol y cuentas inventados, sin red ni base.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderBotText } from '$lib/utils/botTexts.js';
import { planUpdate } from './router.js';
import { SEARCH_PROMPT_HEAD } from './screens.js';
import { shortHash } from './nav.js';
import { manager, NOW, ORIGIN, source } from './noResults.fixtures.js';

const PRIVATE = { id: 42, type: 'private' };
const GROUP = { id: -100, type: 'supergroup' };
const FOLLOW = `sf:${shortHash('shibari')}:shibari`;

/** @param {{ linked?: boolean, followResult?: any }} [o] */
function fakeFollows({ linked = true, followResult = 'created_telegram' } = {}) {
	return {
		accountFor: vi.fn(async () => (linked ? 'cuenta-inventada' : null)),
		targets: vi.fn(async () => []),
		following: vi.fn(async () => new Set()),
		follow: vi.fn(async () => followResult),
		titles: vi.fn(async () => [])
	};
}

/** @param {ReturnType<typeof fakeFollows> | null} [follows] @param {object} [over] */
const deps = (follows = fakeFollows(), over = {}) => ({
	listUpcoming: async () => [],
	origin: ORIGIN,
	now: () => NOW,
	botUsername: 'BotDePrueba',
	inline: { source: async () => source, tags: async () => manager() },
	accounts: vi.fn(async () =>
		follows ? { link: vi.fn(), unlink: vi.fn(), setMuted: vi.fn(), follows } : null
	),
	...over
});

/** La respuesta al mensaje de Buscar. @param {string} text @param {object} [chat] */
const reply = (text, chat = PRIVATE) => ({
	message: {
		chat,
		from: { id: 77 },
		text,
		reply_to_message: { from: { is_bot: true }, text: `${SEARCH_PROMPT_HEAD}: …` }
	}
});
/** @param {string} text @param {object} [chat] */
const msg = (text, chat = PRIVATE) => ({ message: { chat, from: { id: 77 }, text } });
/** @param {string} data @param {object} [chat] */
const tap = (data, chat = PRIVATE) => ({
	callback_query: { id: 'cb', from: { id: 77 }, data, message: { message_id: 9, chat } }
});

/** @param {any} plan */
const step = (plan) => plan?.steps[0];
/** @param {any} plan */
const buttons = (plan) => step(plan)?.reply_markup?.inline_keyboard.flat() ?? [];

afterEach(() => vi.restoreAllMocks());

describe('la respuesta sin resultados', () => {
	it('una etiqueta sin nada: parecidos, «Seguir», la sección filtrada y lo que viene', async () => {
		const p = await planUpdate(reply('shibari'), deps());
		const s = step(p);
		expect(s.method).toBe('sendMessage');
		expect(s.text).toContain(renderBotText('sitio.sin_resultados', { busqueda: 'shibari' }));
		expect(s.text).toContain('Taller inventado');
		const data = buttons(p).map((/** @type {any} */ b) => b.callback_data);
		expect(data).toEqual([
			'q:0:suspensión',
			'q:0:nudos',
			'q:0:cuerdas',
			FOLLOW,
			`c:m:0:${shortHash('suspensión')}`,
			's',
			'h'
		]);
	});

	it('/buscar con un error de tipeo sugiere la palabra; tocarla trae sus resultados', async () => {
		const p = await planUpdate(msg('/buscar querdaz'), deps());
		const suggestion = buttons(p).find((/** @type {any} */ b) => b.callback_data === 'q:0:cuerdas');
		expect(suggestion.text).toBe(
			renderBotText('sitio.boton_sugerencia', { busqueda: 'cuerdas', cantidad: 2 })
		);
		const results = step(await planUpdate(tap(suggestion.callback_data), deps()));
		expect(results.text).toContain(
			renderBotText('sitio.encontre', { cantidad: 2, busqueda: 'cuerdas' })
		);
	});

	it('en un grupo: sin «Seguir», con lo demás', async () => {
		const p = await planUpdate(msg('/buscar shibari', GROUP), deps());
		expect(JSON.stringify(p)).not.toContain('sf:');
		expect(buttons(p).map((/** @type {any} */ b) => b.callback_data)).toContain('q:0:nudos');
	});

	it('sin el árbol de etiquetas (o si falla): sugiere igual, sin «Seguir»', async () => {
		const failing = deps(fakeFollows(), {
			inline: {
				source: async () => source,
				tags: async () => {
					throw new Error('sin árbol');
				}
			}
		});
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const p = await planUpdate(msg('/buscar querdaz'), failing);
		expect(JSON.stringify(p)).not.toContain('sf:');
		expect(buttons(p).map((/** @type {any} */ b) => b.callback_data)).toContain('q:0:cuerdas');
	});
});

describe('«⭐ Seguir» la etiqueta buscada', () => {
	it('privado y vinculado: la sigue por el mismo camino y el botón queda «✓ Ya seguís»', async () => {
		const f = fakeFollows();
		const p = await planUpdate(tap(FOLLOW), deps(f));
		expect(f.follow).toHaveBeenCalledWith('cuenta-inventada', 'shibari');
		expect(p?.callback?.text).toContain('shibari');
		expect(step(p).method).toBe('editMessageText');
		expect(buttons(p)).toContainEqual({
			text: renderBotText('seguir.boton_ya', { nombre: '🪢 shibari' }),
			disabled: {}
		});
	});

	it('si ya la seguía, lo avisa y el botón queda deshabilitado', async () => {
		const p = await planUpdate(tap(FOLLOW), deps(fakeFollows({ followResult: 'already' })));
		expect(p?.callback?.text).toBe(renderBotText('seguir.ya'));
		expect(JSON.stringify(p)).not.toContain('sf:');
	});

	it('sin chat vinculado: cómo conectarlo, sin seguir nada', async () => {
		const f = fakeFollows({ linked: false });
		const p = await planUpdate(tap(FOLLOW), deps(f));
		expect(f.follow).not.toHaveBeenCalled();
		expect(step(p).text).toBe(renderBotText('seguir.sin_vincular'));
	});

	it('en un grupo: link al privado, sin mirar ninguna cuenta', async () => {
		const f = fakeFollows();
		const p = await planUpdate(tap(FOLLOW, GROUP), deps(f));
		expect(f.accountFor).not.toHaveBeenCalled();
		expect(f.follow).not.toHaveBeenCalled();
		expect(JSON.stringify(p)).toContain('https://t.me/BotDePrueba?start=sigo');
	});

	it('con «Lo que sigo» apagado: solo el aviso', async () => {
		const p = await planUpdate(tap(FOLLOW), deps(null));
		expect(p?.steps).toEqual([]);
		expect(p?.callback?.text).toBe(renderBotText('vincular.apagado'));
	});

	it('un botón armado a mano no sigue otra cosa', async () => {
		const f = fakeFollows();
		// Otro hash para la misma búsqueda, y una búsqueda que no es una etiqueta.
		for (const data of [`sf:${shortHash('nudos')}:shibari`, `sf:${shortHash('xqxq')}:xqxq`]) {
			const p = await planUpdate(tap(data), deps(f));
			expect(p?.callback?.text).toBe(renderBotText('seguir.no_esta'));
		}
		// Una búsqueda que sí trae algo: ya no es «sin resultados».
		const p = await planUpdate(tap(`sf:${shortHash('cuerdas')}:cuerdas`), deps(f));
		expect(p?.callback?.text).toBe(renderBotText('errores.no_disponible'));
		expect(f.follow).not.toHaveBeenCalled();
	});
});

describe('privacidad', () => {
	it('ni la búsqueda ni el seguir dejan en el log qué se buscó', async () => {
		const logged = /** @type {unknown[][]} */ ([]);
		for (const level of /** @type {const} */ (['log', 'info', 'warn', 'error', 'debug'])) {
			vi.spyOn(console, level).mockImplementation((...args) => void logged.push(args));
		}
		await planUpdate(reply('shibari'), deps());
		await planUpdate(msg('/buscar querdaz'), deps());
		await planUpdate(tap(FOLLOW), deps());
		const all = JSON.stringify(logged);
		expect(all).not.toContain('shibari');
		expect(all).not.toContain('querdaz');
	});
});
