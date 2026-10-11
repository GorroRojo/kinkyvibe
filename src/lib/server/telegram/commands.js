/**
 * La lista de comandos del bot (decisión 0029): **el único lugar** donde se escriben. De acá salen
 * lo que entiende el router (`router.js`) y lo que se le registra a Telegram con `setMyCommands`
 * para el autocompletado (el botón «Actualizar comandos del bot» de Ajustes → Automatizaciones).
 * Un test (`commands.test.js`) chequea que no se separen.
 *
 * Las descripciones las muestra Telegram en el menú «/»: hasta 256 caracteres, en el español del
 * sitio. Los comandos: minúsculas, números y `_`, hasta 32.
 */
import { callTelegramApi } from './send.js';

/**
 * `is_ephemeral` (Bot API 10.2): en los grupos, el comando y la respuesta los ve solo quien lo
 * mandó (y el bot).
 *
 * @typedef {{ command: string, description: string, is_ephemeral?: boolean }} BotCommand
 */

/** Los de todes (grupos y chats privados). @type {readonly BotCommand[]} */
export const PUBLIC_COMMANDS = Object.freeze([
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
]);

/** Los de la cuenta (fase 2): solo por chat privado y con «Lo que sigo». @type {readonly BotCommand[]} */
export const ACCOUNT_COMMANDS = Object.freeze([
	{ command: 'vincular', description: 'Conectá tu cuenta (código de Mi rincón)' },
	{ command: 'sigo', description: 'Lo que seguís en Lo que sigo' },
	{ command: 'silenciar', description: 'Pausá tus avisos por Telegram' },
	{ command: 'reanudar', description: 'Volvé a recibir tus avisos' },
	{ command: 'desvincular', description: 'Desconectá este chat de tu cuenta' }
]);

/**
 * Los que el router entiende pero no van en el menú: `/start` (lo manda Telegram al abrir el bot y
 * el link `t.me/<bot>?start=<código>`) y `/help` (sinónimo de `/ayuda`).
 */
export const HIDDEN_COMMANDS = Object.freeze(['start', 'help']);

/**
 * Los nombres de los comandos que cambian la vinculación del chat (`/sigo` es una pantalla: lo
 * contesta el router aparte).
 */
export const ACCOUNT_COMMAND_NAMES = new Set(
	ACCOUNT_COMMANDS.map((c) => c.command).filter((c) => c !== 'sigo')
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
 * @param {{ accounts: boolean }} opts
 * @returns {SetMyCommandsPayload[]}
 */
export function commandPayloads({ accounts }) {
	const copy = (/** @type {readonly BotCommand[]} */ list) => list.map((c) => ({ ...c }));
	return [
		{ commands: copy(PUBLIC_COMMANDS), scope: { type: 'default' } },
		{
			commands: PUBLIC_COMMANDS.map((c) => ({ ...c, is_ephemeral: true })),
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
 * @param {{ token: string | undefined, accounts: boolean, fetch?: typeof fetch }} input
 * @returns {Promise<SetCommandsResult>}
 */
export async function registerBotCommands({ token, accounts, fetch: fetchFn }) {
	const clean = String(token ?? '').trim();
	if (!clean) return { ok: false, reason: 'no_token' };
	/** @type {ScopeResult[]} */
	const results = [];
	for (const payload of commandPayloads({ accounts })) {
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
