/**
 * Edges: las relaciones entre objetos (un evento → su lugar, una edición → su serie…).
 *
 * Se escriben SOLO desde saveObject() (./save.js), que usa `normalizeEdges` y
 * `checkEdgeTargets` de acá. Las foreign keys de `edges` (migración 0012) garantizan que los dos
 * extremos existan; el tipo del objeto de origen dice qué `kind` puede tener y hacia qué tipos.
 *
 * Algunos edges los calcula el tipo a partir de sus datos (`derived` en el tipo, por ejemplo
 * `adjunto` del material, que sigue al texto): {@link withDerivedEdges} los suma en cada guardado y
 * quien guarda no los puede mandar.
 *
 * Al leer, un edge solo se muestra si quien mira puede ver el otro extremo (`getEdges`).
 *
 * Solo usa imports relativos.
 */
import { ObjectError } from './errors.js';
import { OBJECT_COLUMNS, forViewer, rowToObject } from './read.js';
import { visibleWhere } from './visibility.js';

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */

/** Edges salientes que se pueden mandar por `kind` en un guardado. */
export const MAX_EDGES_PER_KIND = 200;

/**
 * Un edge como lo manda quien guarda: el id del otro objeto, o `{ to, data }`.
 *
 * @typedef {number | { to: number, data?: Record<string, unknown> | null }} EdgeInput
 */

/** @typedef {{ kind: string, to: number, position: number, data: string | null }} NormalizedEdge */

/**
 * Valida los edges salientes contra el tipo (sin tocar la base). Solo los `kind` presentes se
 * reemplazan al guardar; los demás quedan como están.
 *
 * @param {import('./types/index.js').CoreType} def
 * @param {Record<string, EdgeInput[]> | undefined} edges
 * @param {number | null} selfId el id del objeto que se guarda (null si es nuevo)
 * @returns {Map<string, NormalizedEdge[]>}
 */
export function normalizeEdges(def, edges, selfId) {
	/** @type {Map<string, NormalizedEdge[]>} */
	const out = new Map();
	if (edges === undefined) return out;
	if (!edges || typeof edges !== 'object' || Array.isArray(edges)) {
		throw new ObjectError('invalid', 'Las relaciones tienen un formato inválido.');
	}
	/** @type {import('./fields.js').FieldError[]} */
	const errors = [];
	for (const [kind, list] of Object.entries(edges)) {
		const edgeDef = def.edges?.[kind];
		if (!edgeDef) {
			errors.push({
				path: `edges.${kind}`,
				message: `Un ${def.label.toLowerCase()} no tiene la relación «${kind}».`
			});
			continue;
		}
		if (!Array.isArray(list) || list.length > MAX_EDGES_PER_KIND) {
			errors.push({ path: `edges.${kind}`, message: `${edgeDef.label}: formato inválido.` });
			continue;
		}
		/** @type {NormalizedEdge[]} */
		const normalized = [];
		for (const item of list) {
			const to = typeof item === 'number' ? item : item?.to;
			const data = typeof item === 'object' && item?.data ? item.data : null;
			if (!Number.isSafeInteger(to) || /** @type {number} */ (to) <= 0) {
				errors.push({ path: `edges.${kind}`, message: `${edgeDef.label}: referencia inválida.` });
				continue;
			}
			if (to === selfId) {
				errors.push({
					path: `edges.${kind}`,
					message: `${edgeDef.label}: no puede apuntar a sí mismo.`
				});
				continue;
			}
			if (data !== null && (typeof data !== 'object' || Array.isArray(data))) {
				errors.push({ path: `edges.${kind}`, message: `${edgeDef.label}: datos inválidos.` });
				continue;
			}
			if (normalized.some((e) => e.to === to)) continue; // repetido: una sola vez
			normalized.push({
				kind,
				to: /** @type {number} */ (to),
				position: normalized.length,
				data: data ? JSON.stringify(data) : null
			});
		}
		if (edgeDef.max !== undefined && normalized.length > edgeDef.max) {
			errors.push({
				path: `edges.${kind}`,
				message: `${edgeDef.label}: como mucho ${edgeDef.max}.`
			});
		}
		if (edgeDef.required && normalized.length === 0) {
			errors.push({ path: `edges.${kind}`, message: `${edgeDef.label}: falta elegirlo.` });
		}
		out.set(kind, normalized);
	}
	if (errors.length) throw new ObjectError('invalid', 'Revisá las relaciones.', { errors });
	return out;
}

/**
 * Suma los edges calculados del tipo (`derived`, con `deriveEdges`) a los que manda quien guarda:
 * en CADA guardado se reemplazan por lo que dicen los datos (agrega los que faltan, saca los que
 * sobran). Mandarlos a mano es un error. Un `edges` con formato inválido vuelve tal cual (lo
 * rechaza {@link normalizeEdges}).
 *
 * @param {D1Database} db
 * @param {import('./types/index.js').CoreType} def
 * @param {Record<string, EdgeInput[]> | undefined} edges
 * @param {Record<string, any>} data ya validado
 * @returns {Promise<Record<string, EdgeInput[]> | undefined>}
 */
export async function withDerivedEdges(db, def, edges, data) {
	const kinds = Object.entries(def.edges ?? {})
		.filter(([, e]) => e.derived)
		.map(([kind]) => kind);
	if (!kinds.length || !def.deriveEdges) return edges;
	if (edges !== undefined && (!edges || typeof edges !== 'object' || Array.isArray(edges))) {
		return edges;
	}
	const sent = kinds.filter((kind) => edges && kind in edges);
	if (sent.length) {
		throw new ObjectError('invalid', 'Revisá las relaciones.', {
			errors: sent.map((kind) => ({
				path: `edges.${kind}`,
				message: `${def.edges?.[kind]?.label}: sale de los datos, no se manda.`
			}))
		});
	}
	const derived = await def.deriveEdges(db, data);
	/** @type {Record<string, EdgeInput[]>} */
	const out = { ...edges };
	for (const kind of kinds) out[kind] = derived[kind] ?? [];
	return out;
}

/**
 * Verifica que los destinos existan, estén vivos y sean de un tipo permitido.
 *
 * @param {D1Database} db
 * @param {import('./types/index.js').CoreType} def
 * @param {Map<string, NormalizedEdge[]>} edges
 */
export async function checkEdgeTargets(db, def, edges) {
	const ids = [...new Set([...edges.values()].flat().map((e) => e.to))];
	if (!ids.length) return;
	const { results } = await db
		.prepare(
			'SELECT id, type, deleted_at FROM objects WHERE id IN (SELECT value FROM json_each(?1))'
		)
		.bind(JSON.stringify(ids))
		.all();
	const byId = new Map(results.map((r) => [Number(r.id), r]));
	/** @type {import('./fields.js').FieldError[]} */
	const errors = [];
	for (const [kind, list] of edges) {
		const edgeDef = /** @type {import('./types/index.js').EdgeDef} */ (def.edges?.[kind]);
		for (const edge of list) {
			const target = byId.get(edge.to);
			if (!target || target.deleted_at != null) {
				errors.push({
					path: `edges.${kind}`,
					message: `${edgeDef.label}: el objeto ${edge.to} no existe.`
				});
			} else if (!edgeDef.to.includes(String(target.type))) {
				errors.push({
					path: `edges.${kind}`,
					message: `${edgeDef.label}: tiene que ser ${edgeDef.to.join(' o ')}, no ${target.type}.`
				});
			}
		}
	}
	if (errors.length)
		throw new ObjectError('invalid_reference', 'Revisá las relaciones.', { errors });
}

/**
 * @typedef {{
 *   id: number,
 *   kind: string,
 *   position: number,
 *   data: Record<string, unknown> | null,
 *   object: import('./read.js').StoredObject
 * }} EdgeWithObject
 */

/**
 * Edges de un objeto con el objeto del otro extremo, solo los que quien mira puede ver (los
 * dos extremos pasan por el helper de visibilidad).
 *
 * @param {D1Database} db
 * @param {number} id
 * @param {import('./visibility.js').Viewer | null | undefined} viewer
 * @param {{ direction?: 'out' | 'in', kind?: string }} [options]
 * @returns {Promise<EdgeWithObject[]>}
 */
export async function getEdges(db, id, viewer, { direction = 'out', kind } = {}) {
	const [self, other] = direction === 'out' ? ['from_id', 'to_id'] : ['to_id', 'from_id'];
	const cols = OBJECT_COLUMNS.split(', ')
		.map((c) => `o.${c} AS o_${c}`)
		.join(', ');
	const visibleSelf = visibleWhere(viewer, 's');
	const visibleOther = visibleWhere(viewer, 'o');
	// Solo `?` sin número: visibleWhere agrega los suyos en el medio.
	const { results } = await db
		.prepare(
			`SELECT e.id AS e_id, e.kind AS e_kind, e.position AS e_position, e.data AS e_data, ${cols}
			 FROM edges e
			 JOIN objects s ON s.id = e.${self}
			 JOIN objects o ON o.id = e.${other}
			 WHERE e.${self} = ? AND (? IS NULL OR e.kind = ?)
			 AND ${visibleSelf.sql} AND ${visibleOther.sql}
			 ORDER BY e.kind, e.position, e.id`
		)
		.bind(id, kind ?? null, kind ?? null, ...visibleSelf.params, ...visibleOther.params)
		.all();
	return results.map((r) => {
		/** @type {Record<string, unknown>} */
		const row = {};
		for (const [k, v] of Object.entries(r)) if (k.startsWith('o_')) row[k.slice(2)] = v;
		return {
			id: Number(r.e_id),
			kind: String(r.e_kind),
			position: Number(r.e_position),
			data: r.e_data == null ? null : JSON.parse(String(r.e_data)),
			object: forViewer(rowToObject(row), viewer)
		};
	});
}
