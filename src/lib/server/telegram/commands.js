/**
 * La lista de comandos del bot (decisión 0029): **el único lugar** donde se escriben. De acá salen
 * lo que entiende el router (`router.js`) y lo que se le registra a Telegram con `setMyCommands`
 * para el autocompletado (el botón «Actualizar comandos del bot» de Ajustes → Automatizaciones).
 * Un test (`commands.test.js`) chequea que no se separen.
 *
 * Las descripciones las muestra Telegram en el menú «/»: hasta 256 caracteres, en el español del
 * sitio. Los comandos: minúsculas, números y `_`, hasta 32. Las descripciones se cambian en el
 * panel («Textos del bot», claves `comandos.<comando>`): lo que se registra es lo cambiado (y por
 * eso cambia el hash del registro automático, commandsSync.js); acá quedan los originales.
 */
import { renderBotText } from '$lib/utils/botTexts.js';
import { callTelegramApi } from './send.js';

/** @param {string} command */
const original = (command) => renderBotText(`comandos.${command}`);

/**
 * `is_ephemeral` (Bot API 10.2): en los grupos, el comando y la respuesta los ve solo quien lo
 * mandó (y el bot).
 *
 * @typedef {{ command: string, description: string, is_ephemeral?: boolean }} BotCommand
 */

/**
 * Los de todes (grupos y chats privados). `/inicio` va primero: es lo mismo que `/start` sin nada
 * (el inicio con sus botones), con un nombre que se entiende en el menú.
 *
 * @type {readonly BotCommand[]}
 */
export const PUBLIC_COMMANDS = Object.freeze(
	['inicio', 'proximos', 'hoy', 'semana', 'finde', 'evento', 'buscar', 'fondo', 'ayuda'].map(
		(command) => ({ command, description: original(command) })
	)
);

/** Los de la cuenta (fase 2): solo por chat privado y con «Lo que sigo». @type {readonly BotCommand[]} */
export const ACCOUNT_COMMANDS = Object.freeze(
	['vincular', 'sigo', 'entradas', 'silenciar', 'reanudar', 'desvincular'].map((command) => ({
		command,
		description: original(command)
	}))
);

/**
 * Los que el router entiende pero no van en el menú: `/start` (lo manda Telegram al abrir el bot y
 * el link `t.me/<bot>?start=<código>`; en el menú está `/inicio`, que hace lo mismo sin código) y
 * `/help` (sinónimo de `/ayuda`).
 */
export const HIDDEN_COMMANDS = Object.freeze(['start', 'help']);

/**
 * Los de admins (decisión 0041): `/estado` y `/avisos`, atajos a «📊 Estado» y «🔔 Mis avisos».
 * **No** están en `HANDLED_COMMANDS` ni en el menú «/» de nadie: el router los contesta antes,
 * solo por chat privado y solo a une admin vinculade (mirado en cada mensaje); a cualquier otra
 * persona le contesta lo mismo que a un comando que no existe («No entendí»).
 */
export const ADMIN_COMMAND_NAMES = new Set(['estado', 'avisos']);

/**
 * Los nombres de los comandos que cambian la vinculación del chat (`/sigo` y `/entradas` son
 * pantallas: los contesta el router aparte).
 */
export const ACCOUNT_COMMAND_NAMES = new Set(
	ACCOUNT_COMMANDS.map((c) => c.command).filter((c) => c !== 'sigo' && c !== 'entradas')
);

/** Todo lo que el router contesta (el resto es «No entendí ese comando»). */
export const HANDLED_COMMANDS = new Set([
	...PUBLIC_COMMANDS.map((c) => c.command),
	...ACCOUNT_COMMANDS.map((c) => c.command),
	...HIDDEN_COMMANDS
]);

/**
 * @typedef {{ type: 'default' } | { type: 'all_group_chats' } | { type: 'all_private_chats' }} CommandScope
 * @typedef {{ commands: BotCommand[], scope: CommandScope }} SetMyCommandsPayload
 */

/**
 * Los tres `setMyCommands` que hay que mandar:
 *
 * - `default`: los de todes (el respaldo, por si un alcance más específico no está);
 * - `all_group_chats`: los mismos, **efímeros** (`is_ephemeral`, Bot API 10.2): en un grupo, el
 *   comando y la respuesta los ve solo quien preguntó, y no se ensucia el grupo;
 * - `all_private_chats`: los de todes y, solo con «Lo que sigo» prendido, los de la cuenta
 *   (apagado, contestan «todavía no se puede», así que no se ofrecen).
 *
 * Se mandan siempre los tres, también sin los de la cuenta, para que pisar lo registrado antes sea
 * idempotente. Sin `language_code`: valen para cualquier idioma.
 *
 * @param {{ accounts: boolean, texts?: import('$lib/utils/botTexts.js').BotTexts | null }} opts
 *   `texts`: los textos cambiados en el panel (las descripciones `comandos.<comando>`)
 * @returns {SetMyCommandsPayload[]}
 */
export function commandPayloads({ accounts, texts = null }) {
	const copy = (/** @type {readonly BotCommand[]} */ list) =>
		list.map((c) => ({
			...c,
			description: renderBotText(`comandos.${c.command}`, {}, texts)
		}));
	return [
		{ commands: copy(PUBLIC_COMMANDS), scope: { type: 'default' } },
		{
			commands: copy(PUBLIC_COMMANDS).map((c) => ({ ...c, is_ephemeral: true })),
			scope: { type: 'all_group_chats' }
		},
		{
			commands: copy(accounts ? [...PUBLIC_COMMANDS, ...ACCOUNT_COMMANDS] : PUBLIC_COMMANDS),
			scope: { type: 'all_private_chats' }
		}
	];
}

/** Cómo se dice cada alcance en el panel. */
export const SCOPE_LABELS = Object.freeze({
	default: 'Para todes (respaldo)',
	all_group_chats: 'En grupos (efímeros: solo los ve quien pregunta)',
	all_private_chats: 'En chats privados'
});

/**
 * @typedef {{
 *   scope: CommandScope['type'],
 *   label: string,
 *   commands: string[],
 *   ok: boolean,
 *   error?: string
 * }} ScopeResult
 * @typedef {{ ok: false, reason: 'no_token' } | { ok: boolean, results: ScopeResult[] }} SetCommandsResult
 */

/**
 * Le registra los comandos a Telegram (`setMyCommands`, uno por alcance). Idempotente: cada
 * llamada reemplaza la lista de ese alcance. Sin token no hace nada. Los errores nunca traen el
 * token (ver `callTelegramApi`).
 *
 * @param {{ token: string | undefined, accounts: boolean, fetch?: typeof fetch,
 *   texts?: import('$lib/utils/botTexts.js').BotTexts | null }} input `texts`: los textos
 *   cambiados en el panel (las descripciones)
 * @returns {Promise<SetCommandsResult>}
 */
export async function registerBotCommands({ token, accounts, fetch: fetchFn, texts = null }) {
	const clean = String(token ?? '').trim();
	if (!clean) return { ok: false, reason: 'no_token' };
	/** @type {ScopeResult[]} */
	const results = [];
	for (const payload of commandPayloads({ accounts, texts })) {
		const r = await callTelegramApi({
			token: clean,
			method: 'setMyCommands',
			body: payload,
			fetch: fetchFn
		});
		results.push({
			scope: payload.scope.type,
			label: SCOPE_LABELS[payload.scope.type],
			commands: payload.commands.map((c) => c.command),
			ok: r.ok,
			...(r.ok ? {} : { error: r.error })
		});
	}
	return { ok: results.every((r) => r.ok), results };
}
