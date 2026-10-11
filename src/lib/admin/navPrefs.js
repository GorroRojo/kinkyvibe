/**
 * Preferencias del menú del panel de cada persona, en localStorage (puede fallar en ventanas
 * privadas o con el storage bloqueado: entonces vale lo de siempre y el menú anda igual):
 * - qué grupos de la barra lateral dejó abiertos (pueden ser varios a la vez);
 * - "Ocultar lo que viene" (las secciones próximamente).
 */
import { NAV_AREAS, NAV_GROUPS, navGroupOf } from './nav.js';

/** Grupos abiertos: un JSON con la lista de ids (`["eventos","ventas"]`; `[]` = todos cerrados). */
export const OPEN_GROUPS_KEY = 'kv-panel-grupos';
/** La clave vieja, de cuando se abría un grupo a la vez: se lee una vez y se borra al guardar. */
export const OPEN_AREA_KEY = 'kv-panel-area';
export const HIDE_SOON_KEY = 'kv-panel-hide-soon';

/**
 * @param {string} key
 * @returns {string | null}
 */
function read(key) {
	try {
		return localStorage.getItem(key);
	} catch {
		return null;
	}
}

/**
 * @param {string} key
 * @param {string | null} value `null` borra
 */
function write(key, value) {
	try {
		if (value === null) localStorage.removeItem(key);
		else localStorage.setItem(key, value);
	} catch {
		// Sin storage: dura hasta recargar.
	}
}

/**
 * Un id de área válido o `null`.
 * @param {unknown} value
 */
export function parseArea(value) {
	return NAV_AREAS.some((a) => a.id === value) ? /** @type {string} */ (value) : null;
}

/**
 * Ids de grupo válidos, sin repetir y en el orden del menú. Lo que no es un grupo se descarta.
 * @param {Iterable<unknown>} ids
 * @returns {string[]}
 */
export function normalizeGroups(ids) {
	const set = new Set(ids);
	return NAV_GROUPS.filter((g) => set.has(g.id)).map((g) => g.id);
}

/**
 * Lo guardado en `OPEN_GROUPS_KEY`, o `null` si no hay nada (o no se entiende).
 * @param {string | null} raw
 * @returns {string[] | null}
 */
export function parseGroups(raw) {
	if (raw === null) return null;
	try {
		const value = JSON.parse(raw);
		return Array.isArray(value) ? normalizeGroups(value) : null;
	} catch {
		return null;
	}
}

/**
 * Los grupos que la persona dejó abiertos, o `null` si nunca tocó el menú. Si solo está la clave
 * vieja (un área), vale ese grupo.
 * @returns {string[] | null}
 */
export function readOpenGroups() {
	const saved = parseGroups(read(OPEN_GROUPS_KEY));
	if (saved) return saved;
	const old = navGroupOf(parseArea(read(OPEN_AREA_KEY)))?.id;
	return old ? [old] : null;
}

/** @param {Iterable<string>} ids */
export function saveOpenGroups(ids) {
	write(OPEN_GROUPS_KEY, JSON.stringify(normalizeGroups(ids)));
	write(OPEN_AREA_KEY, null);
}

/** @returns {boolean} */
export function readHideSoon() {
	return read(HIDE_SOON_KEY) === '1';
}

/** @param {boolean} hide */
export function saveHideSoon(hide) {
	write(HIDE_SOON_KEY, hide ? '1' : null);
}

/**
 * Qué grupos se ven abiertos al cargar: los que la persona dejó abiertos y, siempre, el de la
 * página actual (aunque lo haya cerrado). Sin nada guardado, solo el de la página actual (en
 * Inicio, ninguno).
 * @param {string | null | undefined} activeGroup
 * @param {readonly string[] | null | undefined} saved
 * @returns {string[]}
 */
export function pickOpenGroups(activeGroup, saved) {
	return normalizeGroups([...(saved ?? []), activeGroup]);
}

/**
 * Abre o cierra un grupo sin tocar los demás.
 * @param {readonly string[]} open
 * @param {string} id
 * @returns {string[]}
 */
export function toggleGroup(open, id) {
	return open.includes(id) ? open.filter((g) => g !== id) : normalizeGroups([...open, id]);
}

/**
 * «Abrir todo» o «Cerrar todo»: si ya están todos abiertos, cierra todo; si no, abre todos.
 * @param {readonly string[]} open
 * @param {readonly string[]} all los grupos que se ven en el menú
 * @returns {string[]}
 */
export function toggleAllGroups(open, all) {
	return allGroupsOpen(open, all) ? [] : normalizeGroups(all);
}

/**
 * @param {readonly string[]} open
 * @param {readonly string[]} all
 */
export function allGroupsOpen(open, all) {
	return all.length > 0 && all.every((id) => open.includes(id));
}
