/**
 * Talleres en varias partes (docs/talleres-partes.md): lecturas y escrituras de los edges `parte`.
 *
 * El taller es un evento (que es también la parte 1) con un edge `parte` hacia el evento de cada
 * una de las otras partes, en orden (`position`). Regla 4 de docs/objetos.md: la relación es un
 * edge, nunca una dirección ni un id en `data`. Todo se escribe con saveObject() sobre el taller
 * (versión nueva, con su revisión `partes` en la misma tanda), como el lugar
 * (src/lib/server/amigues/venues.js).
 *
 * Reglas que controla este archivo (el registro de tipos solo sabe de tipos):
 * - una parte es de un solo taller;
 * - no hay partes de partes (un evento con partes no puede ser parte de otro, ni al revés);
 * - un taller no es parte de sí mismo.
 *
 * Para afuera todo es por la dirección del evento (la de su página: la del .md importado o la del
 * objeto), como las entradas y las listas de posts. Solo imports relativos (lo usa el cron de los
 * recordatorios).
 */
import { ANON, canSee, visibleWhere } from '../objects/visibility.js';
import { ObjectError, VersionConflictError } from '../objects/errors.js';
import { saveObject } from '../objects/save.js';
import { revisionStatement } from '../contenido/revisions.js';
import {
	OCULTAR_PARTES_KEY,
	PARTE_EDGE,
	POR_PARTE_KEY,
	newPartData,
	newPartTitle,
	numberParts,
	partOf
} from '../../utils/partes.js';
import { dehydrateTags, tagEdgesOf, withTagEdges } from '../contenido/etiquetasEdges.js';

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */
/** @typedef {import('../objects/visibility.js').Viewer} Viewer */
/** @typedef {import('../../utils/partes.js').Workshop} Workshop */
/** @typedef {import('../../utils/partes.js').PartInfo} PartInfo */

const EVENT_TYPE = 'evento';

/** Quien mira desde el panel: ve también lo oculto (nunca lo borrado). */
export const PANEL_VIEWER = /** @type {Viewer} */ (Object.freeze({ role: 'admin', id: 'panel' }));

/** Cuántas partes puede tener un taller (la 1 es el taller): el `max` del edge más uno. */
export const MAX_PARTS = 21;

/** Cuántas veces se reintenta si alguien guardó el taller en el medio. */
const SAVE_TRIES = 3;

/**
 * Columnas de un evento con su dirección pública (`post_slug`), para SQL con `ev` (el objeto) y
 * `cs` (su `content_sources`).
 *
 * @param {string} ev
 * @param {string} cs
 */
const eventCols = (ev, cs) =>
	`${ev}.id AS ${ev}_id, ${ev}.version AS ${ev}_version, ${ev}.title AS ${ev}_title,
	coalesce(${cs}.legacy_slug, ${ev}.slug) AS ${ev}_slug, ${ev}.slug AS ${ev}_object_slug,
	json_extract(${ev}.data, '$.start') AS ${ev}_start, json_extract(${ev}.data, '$.end') AS ${ev}_end,
	json_extract(${ev}.data, '$.status') AS ${ev}_status,
	json_extract(${ev}.data, '$.extra.${POR_PARTE_KEY}') AS ${ev}_per_part,
	json_extract(${ev}.data, '$.extra.${OCULTAR_PARTES_KEY}') AS ${ev}_hide_parts,
	${ev}.visibility AS ${ev}_visibility, ${ev}.deleted_at AS ${ev}_deleted_at,
	${ev}.created_by AS ${ev}_created_by`;

/**
 * @param {string} ev
 * @param {string} cs
 */
const eventJoin = (ev, cs) =>
	`LEFT JOIN content_sources ${cs} ON ${cs}.object_id = ${ev}.id AND ${cs}.category = 'calendario'`;

/**
 * @typedef {PartInfo & {
 *   id: number, version: number, objectSlug: string, perPart: boolean, hideParts: boolean,
 *   visibility: string, deleted_at: number | null, created_by: string | null, type: string
 * }} EventRow
 */

/**
 * @param {Record<string, unknown>} r
 * @param {string} ev
 * @returns {EventRow}
 */
function rowOf(r, ev) {
	/** @param {string} k */
	const v = (k) => r[`${ev}_${k}`];
	/** @param {unknown} x */
	const text = (x) => (x === null || x === undefined || x === '' ? null : String(x));
	return {
		id: Number(v('id')),
		version: Number(v('version')),
		title: String(v('title') ?? ''),
		slug: String(v('slug')),
		objectSlug: String(v('object_slug')),
		start: text(v('start')),
		end: text(v('end')),
		status: text(v('status')),
		perPart: v('per_part') === 1 || v('per_part') === true || v('per_part') === 'true',
		hideParts: v('hide_parts') === 1 || v('hide_parts') === true || v('hide_parts') === 'true',
		visibility: String(v('visibility')),
		deleted_at: v('deleted_at') == null ? null : Number(v('deleted_at')),
		created_by: text(v('created_by')),
		type: EVENT_TYPE
	};
}

/**
 * El evento de la base en esa dirección (la del .md importado o la del objeto), también oculto o
 * borrado, o `null`. Lectura interna: quien llama decide qué se ve.
 *
 * @param {D1Database} db
 * @param {string} slug
 * @returns {Promise<EventRow | null>}
 */
export async function findEventRow(db, slug) {
	if (typeof slug !== 'string' || !slug) return null;
	const row = await db
		.prepare(
			`SELECT ${eventCols('ev', 'cs')} FROM objects ev ${eventJoin('ev', 'cs')}
			WHERE ev.type = ?2 AND (cs.legacy_slug = ?1 OR (cs.legacy_slug IS NULL AND ev.slug = ?1))
			ORDER BY cs.legacy_slug IS NULL LIMIT 1`
		)
		.bind(slug, EVENT_TYPE)
		.first();
	return row ? rowOf(row, 'ev') : null;
}

/**
 * El taller del que `id` es parte (vivo o no), o `null`.
 *
 * @param {D1Database} db
 * @param {number} id
 * @returns {Promise<EventRow | null>}
 */
async function parentOf(db, id) {
	const row = await db
		.prepare(
			`SELECT ${eventCols('ev', 'cs')} FROM edges e
			JOIN objects ev ON ev.id = e.from_id AND ev.type = ?3 ${eventJoin('ev', 'cs')}
			WHERE e.kind = ?2 AND e.to_id = ?1 ORDER BY ev.deleted_at IS NOT NULL, e.id LIMIT 1`
		)
		.bind(id, PARTE_EDGE, EVENT_TYPE)
		.first();
	return row ? rowOf(row, 'ev') : null;
}

/**
 * Las otras partes del taller `id`, en orden. Con `viewer`, solo las que ve; sin él, todas las
 * que no están borradas (para escribir).
 *
 * @param {D1Database} db
 * @param {number} id
 * @param {Viewer | null} viewer
 * @returns {Promise<EventRow[]>}
 */
async function childrenOf(db, id, viewer) {
	const vis = viewer ? visibleWhere(viewer, 'ev') : { sql: 'ev.deleted_at IS NULL', params: [] };
	const { results } = await db
		.prepare(
			`SELECT ${eventCols('ev', 'cs')} FROM edges e
			JOIN objects ev ON ev.id = e.to_id AND ev.type = ? ${eventJoin('ev', 'cs')}
			WHERE e.kind = ? AND e.from_id = ? AND ${vis.sql}
			ORDER BY e.position, e.id`
		)
		.bind(EVENT_TYPE, PARTE_EDGE, id, ...vis.params)
		.all();
	return results.map((r) => rowOf(r, 'ev'));
}

/**
 * El taller de un evento (si es el taller o una de sus partes) con todas sus partes numeradas,
 * solo con lo que `viewer` puede ver; `null` si el evento no es parte de ningún taller (o quien
 * mira no ve el taller, o no ve ninguna otra parte).
 *
 * @param {D1Database | null | undefined} db
 * @param {string} slug dirección del evento
 * @param {Viewer} [viewer]
 * @returns {Promise<Workshop | null>}
 */
export async function readWorkshop(db, slug, viewer = ANON) {
	if (!db) return null;
	const self = await findEventRow(db, slug);
	if (!self || !canSee(self, viewer)) return null;
	const parent = await parentOf(db, self.id);
	if (parent && parent.deleted_at === null && !canSee(parent, viewer)) return null;
	const workshop = parent && parent.deleted_at === null ? parent : self;
	const children = await childrenOf(db, workshop.id, viewer);
	if (!children.length) return null;
	return numberParts(workshop, children);
}

/**
 * Todos los talleres con partes que `viewer` puede ver (una consulta): para las etiquetas
 * «Parte N de M» del calendario y los recordatorios de cada parte.
 *
 * @param {D1Database | null | undefined} db
 * @param {Viewer} [viewer]
 * @returns {Promise<Workshop[]>}
 */
export async function allWorkshops(db, viewer = ANON) {
	if (!db) return [];
	const visP = visibleWhere(viewer, 'p');
	const visC = visibleWhere(viewer, 'c');
	const { results } = await db
		.prepare(
			`SELECT e.from_id AS workshop_id, ${eventCols('p', 'pcs')}, ${eventCols('c', 'ccs')}
			FROM edges e
			JOIN objects p ON p.id = e.from_id AND p.type = ? ${eventJoin('p', 'pcs')}
			JOIN objects c ON c.id = e.to_id AND c.type = ? ${eventJoin('c', 'ccs')}
			WHERE e.kind = ? AND ${visP.sql} AND ${visC.sql}
			ORDER BY e.from_id, e.position, e.id`
		)
		.bind(EVENT_TYPE, EVENT_TYPE, PARTE_EDGE, ...visP.params, ...visC.params)
		.all();
	/** @type {Map<number, { workshop: EventRow, children: EventRow[] }>} */
	const byWorkshop = new Map();
	for (const r of results) {
		const id = Number(r.workshop_id);
		let entry = byWorkshop.get(id);
		if (!entry) {
			entry = { workshop: rowOf(r, 'p'), children: [] };
			byWorkshop.set(id, entry);
		}
		entry.children.push(rowOf(r, 'c'));
	}
	return [...byWorkshop.values()].map((e) => numberParts(e.workshop, e.children));
}

/**
 * Las partes (2 en adelante) de los talleres con una sola entrada, por dirección del taller:
 * lo que necesitan los recordatorios (uno por parte para quien tiene la entrada del taller).
 *
 * @param {D1Database | null | undefined} db
 * @returns {Promise<Map<string, { parts: import('../../utils/partes.js').NumberedPart[], total: number }>>}
 */
export async function coveredPartsByWorkshop(db) {
	/** @type {Map<string, { parts: import('../../utils/partes.js').NumberedPart[], total: number }>} */
	const out = new Map();
	for (const ws of await allWorkshops(db, ANON)) {
		if (ws.workshop.perPart) continue;
		out.set(ws.workshop.slug, { parts: ws.parts.slice(1), total: ws.total });
	}
	return out;
}

// --- Escrituras (panel) ---

/** @typedef {{ ok: true } | { ok: false, message: string }} WriteResult */

/**
 * Guarda el taller con saveObject() (versión nueva y revisión `partes` en la misma tanda). Si el
 * evento se importó de un .md y nadie lo había editado, cambiar solo las partes no lo marca como
 * editado (como el lugar).
 *
 * @param {D1Database} db
 * @param {string} slug
 * @param {(row: EventRow) => Promise<import('../objects/save.js').SaveInput | WriteResult>} build
 * @param {{ by: string, now: number, keepImported: boolean }} opts
 * @returns {Promise<WriteResult>}
 */
async function saveWorkshop(db, slug, build, { by, now, keepImported }) {
	for (let attempt = 1; ; attempt++) {
		const row = await findEventRow(db, slug);
		if (!row || row.deleted_at !== null) return { ok: false, message: NOT_IN_DB };
		const input = await build(row);
		if ('ok' in input) return input;
		try {
			await saveObject(db, input, {
				actor: by,
				now,
				also: (self) => [
					...(keepImported
						? [
								db
									.prepare(
										`UPDATE content_sources SET imported_version = ?3
										WHERE object_id = ?1 AND imported_version = ?2`
									)
									.bind(row.id, row.version, row.version + 1)
							]
						: []),
					revisionStatement(db, self, 'partes')
				]
			});
			return { ok: true };
		} catch (e) {
			if (e instanceof VersionConflictError && attempt < SAVE_TRIES) continue;
			if (e instanceof ObjectError) {
				const details = e.errors.map((x) => x.message).join(' ');
				return { ok: false, message: details ? `${e.message} ${details}` : e.message };
			}
			throw e;
		}
	}
}

/** Lo que se contesta si el evento no está en la base. */
export const NOT_IN_DB =
	'Ese evento no está en la base: las partes se arman con eventos de la base.';

/**
 * Cambia las partes de un taller (2 en adelante, en orden): agregar, sacar y reordenar es mandar
 * la lista nueva entera. `[]` deja de ser un taller (las partes quedan como eventos sueltos).
 *
 * @param {D1Database} db
 * @param {{ eventSlug: string, partSlugs: string[], by: string, now?: number }} input
 * @returns {Promise<WriteResult>}
 */
export async function setWorkshopParts(db, { eventSlug, partSlugs, by, now = Date.now() }) {
	if (!Array.isArray(partSlugs)) return { ok: false, message: 'Las partes no son una lista.' };
	if (partSlugs.length + 1 > MAX_PARTS) {
		return { ok: false, message: `Un taller puede tener como mucho ${MAX_PARTS} partes.` };
	}
	return saveWorkshop(
		db,
		eventSlug,
		async (workshop) => {
			const parent = await parentOf(db, workshop.id);
			if (parent && parent.deleted_at === null) {
				return {
					ok: false,
					message: `Este evento ya es una parte de «${parent.title}»: las partes se arman desde el taller.`
				};
			}
			/** @type {number[]} */
			const ids = [];
			for (const raw of partSlugs) {
				const slug = String(raw ?? '').trim();
				const part = slug ? await findEventRow(db, slug) : null;
				if (!part || part.deleted_at !== null) {
					return { ok: false, message: `No encontramos el evento «${slug}» en la base.` };
				}
				if (part.id === workshop.id) {
					return { ok: false, message: 'Un taller no puede ser parte de sí mismo.' };
				}
				if (ids.includes(part.id)) {
					return { ok: false, message: `«${part.title}» está dos veces.` };
				}
				const other = await parentOf(db, part.id);
				if (other && other.deleted_at === null && other.id !== workshop.id) {
					return {
						ok: false,
						message: `«${part.title}» ya es parte de «${other.title}»: sacala de ahí primero.`
					};
				}
				if ((await childrenOf(db, part.id, null)).length) {
					return {
						ok: false,
						message: `«${part.title}» tiene sus propias partes: no puede ser parte de otro taller.`
					};
				}
				ids.push(part.id);
			}
			return {
				id: workshop.id,
				type: EVENT_TYPE,
				version: workshop.version,
				edges: { [PARTE_EDGE]: ids }
			};
		},
		{ by, now, keepImported: true }
	);
}

/**
 * Las partes de un taller tal como están guardadas (sin las borradas), para el panel.
 *
 * @param {D1Database} db
 * @param {number} workshopId
 */
async function currentPartSlugs(db, workshopId) {
	return (await childrenOf(db, workshopId, null)).map((p) => p.slug);
}

/**
 * Una dirección de objeto libre para una parte nueva: `<taller>-parte-<n>` (o con `-2`, `-3`…
 * si ya existe como objeto o como dirección vieja de un .md).
 *
 * @param {D1Database} db
 * @param {string} base
 */
async function freeSlug(db, base) {
	for (let i = 1; i < 50; i++) {
		const slug = i === 1 ? base : `${base}-${i}`;
		const taken = await db
			.prepare(
				`SELECT 1 AS x FROM objects WHERE type = ?2 AND slug = ?1
				UNION ALL SELECT 1 FROM content_sources WHERE category = 'calendario' AND legacy_slug = ?1
				LIMIT 1`
			)
			.bind(slug, EVENT_TYPE)
			.first();
		if (!taken) return slug;
	}
	return null;
}

/**
 * Crea una parte nueva copiando el taller (texto, etiquetas, personas, imagen, lugar), con su
 * fecha, y la suma al final de las partes. Sin la configuración de entradas si el taller vende una
 * sola entrada. Son dos guardados (la parte nueva y el taller): si el segundo falla, la parte
 * queda creada como evento suelto y el mensaje lo dice.
 *
 * @param {D1Database} db
 * @param {{ eventSlug: string, start: string, end?: string | null, by: string, now?: number }} input
 * @returns {Promise<{ ok: true, slug: string } | { ok: false, message: string }>}
 */
export async function createWorkshopPart(db, { eventSlug, start, end, by, now = Date.now() }) {
	if (!start || Number.isNaN(Date.parse(start))) {
		return { ok: false, message: 'Elegí cuándo empieza la parte nueva.' };
	}
	if (end && Number.isNaN(Date.parse(end)))
		return { ok: false, message: 'La hora de fin no es válida.' };
	const workshop = await findEventRow(db, eventSlug);
	if (!workshop || workshop.deleted_at !== null) return { ok: false, message: NOT_IN_DB };
	const parent = await parentOf(db, workshop.id);
	if (parent && parent.deleted_at === null) {
		return {
			ok: false,
			message: `Este evento ya es una parte de «${parent.title}»: las partes se arman desde el taller.`
		};
	}
	const existing = await currentPartSlugs(db, workshop.id);
	if (existing.length + 2 > MAX_PARTS) {
		return { ok: false, message: `Un taller puede tener como mucho ${MAX_PARTS} partes.` };
	}
	const n = existing.length + 2;
	const full = await db.prepare('SELECT data FROM objects WHERE id = ?1').bind(workshop.id).first();
	// Las etiquetas son edges (../contenido/etiquetasEdges.js): la parte nueva lleva la misma lista
	// (armada y partida de nuevo: una etiqueta que ya no existe queda como texto).
	const tagEdges = await tagEdgesOf(db, [workshop.id]);
	const { data, edges: tagEdgeInput } = await dehydrateTags(
		db,
		'calendario',
		newPartData(withTagEdges(JSON.parse(String(full?.data ?? '{}')), tagEdges.get(workshop.id)), {
			start,
			end
		})
	);
	// El lugar y las personas con perfil son edges: la parte nueva los copia tal cual.
	const { results: copied } = await db
		.prepare(
			`SELECT kind, to_id, data FROM edges WHERE from_id = ?1 AND kind IN ('lugar', 'persona')
			ORDER BY kind, position, id`
		)
		.bind(workshop.id)
		.all();
	/** @type {Record<string, import('../objects/edges.js').EdgeInput[]>} */
	const edges = { ...tagEdgeInput };
	for (const e of copied) {
		const kind = String(e.kind);
		(edges[kind] ??= []).push({
			to: Number(e.to_id),
			data: e.data == null ? null : JSON.parse(String(e.data))
		});
	}
	const slug = await freeSlug(db, `${workshop.objectSlug}-parte-${n}`.slice(0, 100));
	if (!slug) return { ok: false, message: 'No encontramos una dirección libre para la parte.' };
	try {
		await saveObject(
			db,
			{
				type: EVENT_TYPE,
				slug,
				title: newPartTitle(workshop.title, n),
				data,
				edges,
				visibility: /** @type {any} */ (workshop.visibility)
			},
			{ actor: by, now, also: (self) => [revisionStatement(db, self, 'partes')] }
		);
	} catch (e) {
		if (e instanceof ObjectError) {
			const details = e.errors.map((x) => x.message).join(' ');
			return { ok: false, message: details ? `${e.message} ${details}` : e.message };
		}
		throw e;
	}
	const linked = await setWorkshopParts(db, {
		eventSlug,
		partSlugs: [...existing, slug],
		by,
		now
	});
	if (!linked.ok) {
		return {
			ok: false,
			message: `Creamos «${slug}» pero no la pudimos sumar al taller: ${linked.message}`
		};
	}
	return { ok: true, slug };
}

/**
 * Prende o apaga «Entradas por parte» en el taller (`extra.entradas_por_parte`, junto con el
 * resto de la configuración de entradas).
 *
 * @param {D1Database} db
 * @param {{ eventSlug: string, perPart: boolean, by: string, now?: number }} input
 * @returns {Promise<WriteResult>}
 */
export async function setPerPartTickets(db, { eventSlug, perPart, by, now = Date.now() }) {
	return saveWorkshop(
		db,
		eventSlug,
		async (row) => {
			if (row.perPart === perPart) return { ok: true };
			const full = await db.prepare('SELECT data FROM objects WHERE id = ?1').bind(row.id).first();
			/** @type {Record<string, any>} */
			const data = JSON.parse(String(full?.data ?? '{}'));
			const extra = { ...(data.extra && typeof data.extra === 'object' ? data.extra : {}) };
			if (perPart) extra[POR_PARTE_KEY] = true;
			else delete extra[POR_PARTE_KEY];
			if (Object.keys(extra).length) data.extra = extra;
			else delete data.extra;
			return { id: row.id, type: EVENT_TYPE, version: row.version, data };
		},
		{ by, now, keepImported: false }
	);
}

/**
 * Prende o apaga «Si ocultás el taller, ocultar también sus partes» (`extra.ocultar_partes`).
 * Apagado (lo de siempre), cada parte tiene su propia visibilidad; prendido, una parte se ve solo
 * si quien mira también ve el taller (`partVisibleWhere` en objects/visibility.js).
 *
 * @param {D1Database} db
 * @param {{ eventSlug: string, hideParts: boolean, by: string, now?: number }} input
 * @returns {Promise<WriteResult>}
 */
export async function setHideParts(db, { eventSlug, hideParts, by, now = Date.now() }) {
	return saveWorkshop(
		db,
		eventSlug,
		async (row) => {
			if (row.hideParts === hideParts) return { ok: true };
			const full = await db.prepare('SELECT data FROM objects WHERE id = ?1').bind(row.id).first();
			/** @type {Record<string, any>} */
			const data = JSON.parse(String(full?.data ?? '{}'));
			const extra = { ...(data.extra && typeof data.extra === 'object' ? data.extra : {}) };
			if (hideParts) extra[OCULTAR_PARTES_KEY] = true;
			else delete extra[OCULTAR_PARTES_KEY];
			if (Object.keys(extra).length) data.extra = extra;
			else delete data.extra;
			return { id: row.id, type: EVENT_TYPE, version: row.version, data };
		},
		{ by, now, keepImported: false }
	);
}

/**
 * Lo que muestra la sección «Partes» del editor: el taller (si el evento es el taller o una
 * parte), y eventos que parecen partes y todavía no están sumados («<taller>-parte-2», como se
 * cargaban antes).
 *
 * @param {D1Database | null | undefined} db
 * @param {string} slug
 */
export async function panelParts(db, slug) {
	if (!db) return null;
	const self = await findEventRow(db, slug);
	if (!self || self.deleted_at !== null) return { inDb: false, workshop: null, suggestions: [] };
	const workshop = await readWorkshop(db, slug, PANEL_VIEWER);
	const isPart = Boolean(workshop && workshop.workshop.slug !== slug);
	/** @type {{ slug: string, title: string, start: string | null }[]} */
	let suggestions = [];
	if (!isPart) {
		const linked = new Set(workshop?.parts.map((p) => p.slug) ?? []);
		const { results } = await db
			.prepare(
				`SELECT ${eventCols('ev', 'cs')} FROM objects ev ${eventJoin('ev', 'cs')}
				WHERE ev.type = ?1 AND ev.deleted_at IS NULL
				AND coalesce(cs.legacy_slug, ev.slug) LIKE ?2 ESCAPE '\\'
				AND NOT EXISTS (SELECT 1 FROM edges x WHERE x.kind = ?3 AND x.to_id = ev.id)
				ORDER BY json_extract(ev.data, '$.start') LIMIT 20`
			)
			.bind(EVENT_TYPE, `${slug.replace(/[\\%_]/g, (c) => `\\${c}`)}-parte-%`, PARTE_EDGE)
			.all();
		suggestions = results
			.map((r) => rowOf(r, 'ev'))
			.filter((r) => !linked.has(r.slug))
			.map((r) => ({ slug: r.slug, title: r.title, start: r.start }));
	}
	return {
		inDb: true,
		workshop,
		isPart,
		current: workshop ? partOf(workshop, slug) : null,
		suggestions
	};
}
