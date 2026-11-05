/**
 * Quién guarda desde el panel, para todo el pedido (eventos y material en la base).
 *
 * Cada guardado del panel (editor, cargar un evento, la agenda, borrar y deshacer, las etiquetas,
 * importar la planilla…) pasa por el cliente del repo (./repo.js). En lugar de que cada pantalla
 * le pase quién es, hooks.server.js corre el pedido de cada admin con {@link runAsPanelAuthor}:
 * así la base registra siempre el **login de GitHub** (no el nombre que se muestra) y sabe si es
 * superadmin (decide cómo se muestra el texto que guarda, decisión 0004).
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import { isAdmin } from '$lib/server/auth';
import { revisionStatement } from './revisions.js';

/**
 * @typedef {{
 *   login: string,
 *   name?: string | null,
 *   superadmin: boolean,
 *   claude?: { confirmedBy: string | null }
 * }} PanelAuthor
 *
 * `claude`: el guardado lo pidió el conector de Claude (docs/conector-claude.md) a nombre de esta
 * persona: el historial lo anota como `source` = 'claude', con quién lo confirmó.
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

/**
 * La versión del historial de un guardado del panel: como `revisionStatement(db, self, source)`,
 * salvo que el pedido sea del conector de Claude ({@link runAsPanelAuthor} con `claude`): entonces
 * queda como `source` = 'claude', con quién lo confirmó (docs/conector-claude.md). Para los
 * guardados que no pasan por el cliente del repo (perfiles, etiquetas, la Kinkipedia, el lugar de
 * un evento).
 *
 * @param {import('@cloudflare/workers-types').D1Database} db
 * @param {import('../objects/save.js').SavedRef} self
 * @param {import('./revisions.js').REVISION_SOURCES[number]} source
 */
export function panelRevisionStatement(db, self, source) {
	const claude = panelAuthor()?.claude;
	return claude
		? revisionStatement(db, self, 'claude', claude.confirmedBy)
		: revisionStatement(db, self, source);
}
