/**
 * Quién guarda desde el panel, para todo el pedido (interruptor `contenido_db`).
 *
 * Cada guardado del panel (editor, cargar un evento, la agenda, borrar y deshacer, las etiquetas,
 * importar la planilla…) pasa por el cliente del repo (./repo.js). En lugar de que cada pantalla
 * le pase quién es, hooks.server.js corre el pedido de cada admin con {@link runAsPanelAuthor}:
 * así la base registra siempre el **login de GitHub** (no el nombre que se muestra) y sabe si es
 * superadmin (decide cómo se muestra el texto que guarda, decisión 0004).
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import { isAdmin } from '$lib/server/auth';

/**
 * @typedef {{ login: string, name?: string | null, superadmin: boolean }} PanelAuthor
 */

/** @type {AsyncLocalStorage<PanelAuthor>} */
const store = new AsyncLocalStorage();

/**
 * Corre `fn` con `author` como quien guarda.
 *
 * @template T
 * @param {PanelAuthor} author
 * @param {() => T} fn
 * @returns {T}
 */
export function runAsPanelAuthor(author, fn) {
	return store.run(author, fn);
}

/** Quién guarda en este pedido, o `null` (fuera de un pedido del panel). */
export function panelAuthor() {
	return store.getStore() ?? null;
}

/**
 * Resuelve un pedido; si es de une admin, con su login de GitHub como quien guarda (lo usa
 * hooks.server.js). Les admins del panel son superadmins (decisión 0003).
 *
 * @template T
 * @param {{ locals: App.Locals }} event
 * @param {(event: any) => T} resolve
 * @returns {T}
 */
export function resolveAsPanelAuthor(event, resolve) {
	const user = event.locals.user;
	if (!user?.login || !isAdmin(user)) return resolve(event);
	return runAsPanelAuthor({ login: user.login, name: user.name ?? null, superadmin: true }, () =>
		resolve(event)
	);
}
