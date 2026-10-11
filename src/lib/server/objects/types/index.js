/**
 * Registro de los tipos núcleo (definidos en código). Para agregar uno: ver docs/objetos.md
 * («Agregar un tipo núcleo»).
 *
 * Solo usa imports relativos (lo usa el cron nocturno, que no pasa por Vite).
 */
import { validateFields } from '../fields.js';
import archivo from './archivo.js';
import etiqueta from './etiqueta.js';
import evento from './evento.js';
import imagen from './imagen.js';
import lugar from './lugar.js';
import material from './material.js';
import perfil from './perfil.js';

/**
 * Una relación que un tipo puede tener hacia otros objetos (edge saliente).
 *
 * @typedef {object} EdgeDef
 * @prop {string} label
 * @prop {readonly string[]} to tipos permitidos del otro extremo
 * @prop {number} [max] cuántos como mucho (sin `max`: sin límite)
 * @prop {boolean} [required] un objeto vivo sin este edge es un «huérfano» (chequeo nocturno)
 * @prop {boolean} [derived] lo calcula el tipo en cada guardado a partir de sus datos
 *   (`deriveEdges`): quien guarda no lo manda (si lo manda, es un error)
 */

/**
 * @typedef {object} CoreType
 * @prop {string} type clave (minúsculas, sin espacios); no se cambia nunca
 * @prop {string} label nombre para mostrar
 * @prop {Record<string, import('../fields.js').FieldDef>} fields
 * @prop {Record<string, EdgeDef>} [edges] por `kind`
 * @prop {(data: unknown) => unknown} [normalize] corrige valores viejos antes de validar (p. ej.
 *   un valor de opción que cambió de nombre); devuelve los datos tal cual si no hay nada que hacer
 * @prop {(data: Record<string, any>) => import('../fields.js').FieldError[]} [check] reglas entre campos
 * @prop {(data: Record<string, any>) => string} [searchText] texto extra para la búsqueda
 * @prop {(db: import('@cloudflare/workers-types').D1Database, data: Record<string, any>) =>
 *   Promise<Record<string, import('../edges.js').EdgeInput[]>>} [deriveEdges] los edges `derived`
 *   que corresponden a estos datos (ya validados); saveObject() los reemplaza en cada guardado
 */

/**
 * @typedef {{
 *   types: ReadonlyMap<string, CoreType>,
 *   get: (type: string) => CoreType | undefined
 * }} Registry
 */

const KEY = /^[a-z][a-z0-9_]*$/;

/**
 * Arma un registro y verifica que las definiciones sean coherentes (falla al importar, no en
 * producción a la madrugada).
 *
 * @param {CoreType[]} list
 * @returns {Registry}
 */
export function createRegistry(list) {
	/** @type {Map<string, CoreType>} */
	const types = new Map();
	for (const def of list) {
		if (!KEY.test(def.type)) throw new Error(`Tipo de objeto con clave inválida: ${def.type}`);
		if (types.has(def.type)) throw new Error(`Tipo de objeto repetido: ${def.type}`);
		types.set(def.type, def);
	}
	for (const def of list) {
		for (const [kind, edge] of Object.entries(def.edges ?? {})) {
			if (!KEY.test(kind)) throw new Error(`${def.type}: edge con clave inválida: ${kind}`);
			if (edge.derived && !def.deriveEdges)
				throw new Error(`${def.type}.${kind}: es calculado y el tipo no tiene deriveEdges`);
			for (const to of edge.to) {
				if (!types.has(to))
					throw new Error(`${def.type}.${kind}: apunta a un tipo que no existe: ${to}`);
			}
		}
	}
	return { types, get: (type) => types.get(type) };
}

/** Los tipos núcleo del sitio. */
export const coreTypes = createRegistry([
	evento,
	lugar,
	perfil,
	etiqueta,
	material,
	imagen,
	archivo
]);

/**
 * Valida y normaliza los datos de un objeto según su tipo.
 *
 * @param {CoreType} def
 * @param {unknown} data
 * @returns {import('../fields.js').ValidationResult}
 */
export function validateData(def, data) {
	const result = validateFields(def.fields, def.normalize ? def.normalize(data) : data);
	if (!result.ok) return result;
	const extra = def.check?.(result.data) ?? [];
	return extra.length ? { ok: false, errors: extra } : result;
}
