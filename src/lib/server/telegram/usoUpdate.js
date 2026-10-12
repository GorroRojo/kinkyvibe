/**
 * Lo que se cuenta de un update **antes** de contestarlo (estadísticas de uso, uso.js): quién lo
 * mandó (para `telegram_uso_personas`) y lo que se sabe del update solo: el comando, la pantalla
 * de un botón y lo buscado en el modo inline. Lo demás (lo buscado en el bot, la cosa abierta,
 * seguir, vincular) lo suma el router al contestar, con el mismo recorder.
 *
 * Nunca guarda lo que viene después de un comando (`/start <código>`, `/vincular <código>`) ni el
 * id o el hash de un botón: solo el nombre del comando o de la pantalla.
 */
import { parseCommand } from './router.js';
import { ADMIN_COMMAND_NAMES, HANDLED_COMMANDS } from './commands.js';
import { decodeNav } from './nav.js';
import { decodeAdminNav } from './adminNav.js';
import { normalizeSearch, personFrom } from './uso.js';

/** La clave de un comando que el bot no conoce (lo escrito no se guarda). */
export const OTHER_COMMAND = '(otro)';

/**
 * La pantalla de un botón, sin nada que identifique qué se abrió (ni la dirección, ni el hash, ni
 * lo buscado): `list:w`, `section:m`, `event`, `site_results`… `null` si no es un botón nuestro o
 * no hace nada.
 *
 * @param {unknown} data el `callback_data`
 */
export function screenKey(data) {
	if (decodeAdminNav(data)) return 'admin';
	const state = decodeNav(data);
	if (!state || state.screen === 'noop') return null;
	if (state.screen === 'list') return `list:${state.view}`;
	if (state.screen === 'legacy_event') return 'event';
	if ('section' in state) return `${state.screen}:${state.section}`;
	return state.screen;
}

/**
 * @param {any} update
 * @returns {{ person: import('./uso.js').UsoPerson | null,
 *   counts: { tipo: import('./uso.js').UsoTipo, clave: string }[] }}
 */
export function classifyUpdate(update) {
	/** @type {{ tipo: import('./uso.js').UsoTipo, clave: string }[]} */
	const counts = [];
	if (update?.callback_query) {
		const key = screenKey(update.callback_query.data);
		if (key) counts.push({ tipo: 'pantalla', clave: key });
		return { person: personFrom(update.callback_query.from), counts };
	}
	if (update?.inline_query) {
		const q = update.inline_query;
		// Solo la primera página: pedir «más» no es otra búsqueda.
		if (!q.offset) counts.push({ tipo: 'inline', clave: normalizeSearch(q.query) });
		return { person: personFrom(q.from), counts };
	}
	if (update?.chosen_inline_result) {
		// La cosa elegida la cuenta el router: hay que buscarla en el índice público.
		return { person: personFrom(update.chosen_inline_result.from), counts };
	}
	const message = update?.message;
	if (message) {
		const command = parseCommand(message.text);
		if (command) {
			const known = HANDLED_COMMANDS.has(command.name) || ADMIN_COMMAND_NAMES.has(command.name);
			counts.push({ tipo: 'comando', clave: known ? command.name : OTHER_COMMAND });
		}
		return { person: personFrom(message.from), counts };
	}
	return { person: null, counts };
}
