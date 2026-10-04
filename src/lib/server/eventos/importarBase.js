/**
 * «Importar desde la planilla» guardando en la base (objetos `evento`), sin GitHub ni `.md`.
 *
 * - {@link importSources}: los eventos de la base que se pueden duplicar (para el buscador), con
 *   su configuración de entradas (para empezar a editarlas desde ahí);
 * - {@link takenEventSlugs}: las direcciones ocupadas (objetos `evento`, también borrados, sus
 *   direcciones viejas y los `.md` de este deploy);
 * - {@link createImportedDrafts}: arma cada borrador (copia del evento elegido, o de la plantilla)
 *   con las mismas reglas que siempre (`buildImportedEvent`: no listado, `borrador: true`,
 *   «anunciado» o «abierto», etiquetas, la entrada General del «Valor»), le aplica las entradas que
 *   se eligieron y lo guarda con `saveObject()`: versión 1 con su historial, los perfiles de
 *   `personas` como edges `persona`, las etiquetas vivas como edges `etiqueta` y, si el lugar no
 *   cambió, el mismo edge `lugar` que el original.
 *
 * El texto del evento se arma en memoria con el mismo mapa que usa el panel
 * (../contenido/markdown.js) para reusar `buildImportedEvent` y el editor de entradas tal cual;
 * nunca se escribe un archivo.
 *
 * Lo que no se copia: la imagen propia del evento original (un número, en la carpeta del evento en
 * el repo: las imágenes todavía no están en la base); una imagen compartida (`src/lib/assets`) sí.
 */
import { parseDocument } from 'yaml';
import eventTemplate from '$lib/posts/calendario/_event_template.md?raw';
import { allDbEventObjects, bodyHtmlFor, findDbPost } from '$lib/server/contenido/repo.js';
import { EVENT_CATEGORY, EVENT_TYPE, eventToMeta } from '$lib/server/contenido/eventos.js';
import { markdownToPost } from '$lib/server/contenido/markdown.js';
import { dehydrateContent } from '$lib/server/contenido/relaciones.js';
import { revisionStatement } from '$lib/server/contenido/revisions.js';
import { eventVenue } from '$lib/server/amigues/venues.js';
import { ObjectError } from '$lib/server/objects/errors.js';
import { saveObject } from '$lib/server/objects/save.js';
import { coreTypes, validateData } from '$lib/server/objects/types/index.js';
import { ticketsFileErrors } from '$lib/server/tickets/editor.js';
import {
	NEW_EVENT_TEMPLATE,
	REMOVE,
	applyFrontmatterChanges,
	isNumericFeatured,
	joinMarkdown,
	readEventFields,
	splitMarkdown,
	uniqueSlug
} from '$lib/utils/eventDraft.js';
import { buildImportedEvent, placeFields } from '$lib/utils/sheetImport.js';
import { GOAL_KEY } from '$lib/utils/salesGoal.js';
import {
	applyTicketsToMarkdown,
	readTicketsForm,
	validateTicketsForm
} from '$lib/utils/ticketsEditor.js';

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */
/** @typedef {import('$lib/utils/ticketsEditor.js').TicketsForm} TicketsForm */
/** @typedef {import('$lib/utils/sourcePicker.js').ImportSource} ImportSource */

/**
 * Filas por importación. Cada fila son unas pocas consultas a D1 (leer el original una vez por
 * evento, los perfiles de `personas`, el guardado con su historial); 40 es el mismo tope que la
 * importación de los `.md` (../contenido/importer.js), lejos del máximo de consultas por pedido.
 */
export const IMPORT_MAX_ROWS = 40;

/** Las claves de la venta de entradas (y la meta) que el editor de entradas lee de un evento. */
export const TICKET_META_KEYS = /** @type {const} */ ([
	'tickets',
	'payment_methods',
	'tickets_open',
	'tickets_close',
	'modalidad',
	'recordatorios',
	'mp_fee_percent',
	'puerta',
	'puerta_precio',
	GOAL_KEY
]);

/** La plantilla de eventos del repo (o la de respaldo si no se puede leer). */
function template() {
	try {
		readEventFields(splitMarkdown(eventTemplate).frontmatter);
		return eventTemplate;
	} catch {
		return NEW_EVENT_TEMPLATE;
	}
}

/**
 * Lo que el editor de entradas necesita de un evento: sus claves de venta y meta (solo las que
 * tiene), sus etiquetas y su dirección (el aviso del Fondo y la modalidad automática).
 *
 * @param {Record<string, any>} meta
 * @returns {Record<string, any>}
 */
export function ticketMetaOf(meta) {
	/** @type {Record<string, any>} */
	const out = {};
	for (const key of TICKET_META_KEYS) {
		if (meta[key] !== undefined && meta[key] !== null) out[key] = meta[key];
	}
	return out;
}

/**
 * @typedef {ImportSource & { location: string, ticketMeta: Record<string, any> | null }} ImportSourceRow
 *   `ticketMeta`: {@link ticketMetaOf}, `null` si no tiene nada de venta
 */

/**
 * Los eventos de la base que se pueden duplicar, del más reciente al más viejo (también los
 * ocultos y no listados, marcados; nunca los borrados ni los `_…`). `seriesName(tags)` da el nombre
 * de la serie del evento ('' si no está en ninguna).
 *
 * @param {D1Database} db
 * @param {{ seriesName?: (tags: string[]) => string }} [opts]
 * @returns {Promise<ImportSourceRow[]>}
 */
export async function importSources(db, { seriesName = () => '' } = {}) {
	const out = [];
	for (const [slug, e] of await allDbEventObjects(db)) {
		if (e.deleted || slug.startsWith('_')) continue;
		const meta = eventToMeta(e.object);
		const tags = Array.isArray(meta.tags) ? meta.tags.map(String) : [];
		const ticketMeta = ticketMetaOf(meta);
		out.push({
			slug,
			title: String(meta.title || slug),
			start: String(meta.start ?? ''),
			end: String(meta.end ?? ''),
			series: seriesName(tags),
			tags,
			location: String(meta.location ?? ''),
			hidden: e.object.visibility !== 'public',
			unlisted: meta.force_unlisted === true,
			ticketMeta: Object.keys(ticketMeta).length ? ticketMeta : null
		});
	}
	return out.sort(
		(a, b) => (b.start || '').localeCompare(a.start || '') || a.slug.localeCompare(b.slug)
	);
}

/**
 * Las direcciones de evento ocupadas: las de los objetos `evento` (también borrados: se pueden
 * deshacer), sus direcciones viejas (`content_sources`) y las de este deploy (`bundle`).
 *
 * @param {D1Database} db
 * @param {Iterable<string>} [bundle]
 * @returns {Promise<Set<string>>}
 */
export async function takenEventSlugs(db, bundle = []) {
	const [objects, legacy] = await Promise.all([
		db.prepare('SELECT slug FROM objects WHERE type = ?1').bind(EVENT_TYPE).all(),
		db
			.prepare('SELECT legacy_slug FROM content_sources WHERE category = ?1')
			.bind(EVENT_CATEGORY)
			.all()
	]);
	return new Set([
		...bundle,
		...objects.results.map((r) => String(r.slug)),
		...legacy.results.map((r) => String(r.legacy_slug))
	]);
}

/**
 * @typedef {import('$lib/utils/sheetImport.js').ImportChoice & {
 *   source: string,
 *   slug: string,
 *   tickets?: TicketsForm | null
 * }} ImportRow
 *   `source`: el evento a duplicar ('' = de la plantilla); `tickets`: las entradas elegidas
 *   (`null` = las del original, con la General del «Valor» si la hay)
 */

/**
 * @typedef {object} CreatedDraft
 * @prop {number} id
 * @prop {string} slug
 * @prop {string} title
 * @prop {string} source
 * @prop {string[]} notes avisos para revisar (lugar distinto, sin imagen…)
 */

/**
 * Las entradas elegidas, aplicadas al texto del borrador. Tira (en castellano) si no son válidas.
 *
 * @param {string} content
 * @param {unknown} form
 */
function withTickets(content, form) {
	if (!form || typeof form !== 'object') throw new Error('Las entradas no llegaron bien.');
	const tickets = /** @type {TicketsForm} */ (form);
	/** @type {{ errors: string[] }} */
	let check;
	try {
		check = validateTicketsForm(tickets);
	} catch {
		throw new Error('Las entradas no llegaron bien. Recargá la página y volvé a elegirlas.');
	}
	if (check.errors.length) throw new Error(`Entradas: ${check.errors.join(' ')}`);
	const meta = parseDocument(splitMarkdown(content).frontmatter).toJS() ?? {};
	return applyTicketsToMarkdown(content, tickets, readTicketsForm(meta));
}

/**
 * Arma y guarda los borradores. Primero arma y valida TODAS las filas (si alguna tiene un
 * problema, no se guarda ninguna); después guarda de a una con `saveObject()`. Si un guardado
 * falla a mitad de camino (por ejemplo, alguien usó la dirección recién), los anteriores quedan
 * guardados y se informa cuál falló (`failed`).
 *
 * @param {D1Database} db
 * @param {{
 *   rows: ImportRow[],
 *   actor: string,
 *   superadmin?: boolean,
 *   today: string,
 *   taken: Set<string>,
 *   now?: number
 * }} input
 * @returns {Promise<
 *   | { ok: false, status: 400, rowErrors: Record<number, string> }
 *   | { ok: false, status: 409, conflicts: Record<number, string> }
 *   | { ok: true, created: CreatedDraft[], failed: { index: number, slug: string, message: string } | null }
 * >}
 */
export async function createImportedDrafts(
	db,
	{ rows, actor, superadmin = true, today, taken, now = Date.now() }
) {
	// Direcciones ocupadas: se propone otra (libre también dentro de la tanda).
	/** @type {Record<number, string>} */
	const conflicts = {};
	const batch = new Set(rows.map((r) => r.slug));
	rows.forEach((row, i) => {
		if (taken.has(row.slug))
			conflicts[i] = uniqueSlug(row.slug, (s) => taken.has(s) || batch.has(s));
	});
	if (Object.keys(conflicts).length) return { ok: false, status: 409, conflicts };

	const def = /** @type {import('$lib/server/objects/types/index.js').CoreType} */ (
		coreTypes.get(EVENT_TYPE)
	);
	/** Cada original se lee una vez (texto, objeto y lugar). */
	/** @type {Map<string, Promise<{ file: Awaited<ReturnType<typeof findDbPost>>, venue: Awaited<ReturnType<typeof eventVenue>> }>>} */
	const sources = new Map();
	/** @param {string} slug */
	const sourceOf = (slug) => {
		let p = sources.get(slug);
		if (!p) {
			p = (async () => {
				const file = await findDbPost(db, EVENT_CATEGORY, slug);
				const venue = file && !file.deleted ? await eventVenue(db, slug) : null;
				return { file, venue };
			})();
			sources.set(slug, p);
		}
		return p;
	};

	/** @type {Record<number, string>} */
	const rowErrors = {};
	/** @type {Array<{ index: number, row: ImportRow, title: string, data: Record<string, unknown>, edges: Record<string, unknown[]>, visibility: 'public' | 'hidden', notes: string[] }>} */
	const planned = [];
	for (const [i, row] of rows.entries()) {
		try {
			const src = row.source ? await sourceOf(row.source) : null;
			if (row.source && (!src?.file || src.file.deleted)) {
				rowErrors[i] =
					`No encontramos el evento “${row.source}” en la base. Elegí otro o “desde cero”.`;
				continue;
			}
			const raw = src?.file ? src.file.raw : template();
			const fromTemplate = !src?.file;
			const edited = Boolean(row.tickets);
			const built = buildImportedEvent(
				raw,
				{ ...row, price: edited ? '' : row.price },
				{ today, fromTemplate }
			);
			const notes = [...built.notes];
			let content = built.content;
			if (edited) content = withTickets(content, row.tickets);
			// La imagen propia del original está en el repo: no se copia (las imágenes todavía no
			// están en la base). Una compartida (src/lib/assets) sirve tal cual.
			if (!fromTemplate && isNumericFeatured(built.featured)) {
				const fm = splitMarkdown(content);
				content = joinMarkdown(
					applyFrontmatterChanges(fm.frontmatter, { featured: REMOVE }),
					fm.body
				);
				notes.push('La imagen del evento anterior no se copia: subila desde el editor del evento.');
			}
			const ticketErrors = ticketsFileErrors(content);
			if (ticketErrors.length) throw new Error(`Entradas: ${ticketErrors.join(' ')}`);

			const mapped = markdownToPost(EVENT_CATEGORY, row.slug, content);
			if (mapped.error) throw new Error(mapped.error);
			const fromText = { ...mapped.data };
			delete fromText.body_html;
			// El texto copiado se muestra como el original (`body_html`), igual que en el editor.
			const valid = validateData(def, {
				...fromText,
				...bodyHtmlFor(src?.file ?? null, fromText.body, superadmin)
			});
			if (!valid.ok) {
				throw new Error(`Revisá los datos: ${valid.errors.map((e) => e.message).join('; ')}`);
			}
			// Personas con perfil y etiquetas vivas van como edges (`persona`, `etiqueta`).
			const { data, edges = {} } = await dehydrateContent(db, EVENT_CATEGORY, valid.data);
			/** @type {Record<string, unknown[]>} */
			const allEdges = { ...edges };
			// «Sucede en»: el mismo lugar que el original, salvo que la planilla diga otro.
			const sourceFields = fromTemplate
				? { location: '', location_name: '' }
				: readEventFields(splitMarkdown(raw).frontmatter);
			const placeChanged = placeFields(row.place ?? '', sourceFields).changed;
			if (src?.venue && !placeChanged) {
				allEdges.lugar = [
					{
						to: src.venue.venue.id,
						data: src.venue.override ? { privacy: src.venue.override } : null
					}
				];
			}
			planned.push({
				index: i,
				row,
				title: mapped.title,
				data,
				edges: allEdges,
				visibility: mapped.visibility,
				notes
			});
		} catch (e) {
			rowErrors[i] = e instanceof Error ? e.message : String(e);
		}
	}
	if (Object.keys(rowErrors).length) return { ok: false, status: 400, rowErrors };

	/** @type {CreatedDraft[]} */
	const created = [];
	for (const p of planned) {
		try {
			const saved = await saveObject(
				db,
				{
					type: EVENT_TYPE,
					slug: p.row.slug,
					title: p.title,
					data: p.data,
					edges: /** @type {any} */ (p.edges),
					visibility: p.visibility
				},
				{ actor, now, also: (self) => [revisionStatement(db, self, 'panel')] }
			);
			created.push({
				id: saved.id,
				slug: saved.slug,
				title: saved.title,
				source: p.row.source,
				notes: p.notes
			});
		} catch (e) {
			const message =
				e instanceof ObjectError
					? [e.message, ...e.errors.map((x) => x.message)].join(' ')
					: e instanceof Error
						? e.message
						: String(e);
			return { ok: true, created, failed: { index: p.index, slug: p.row.slug, message } };
		}
	}
	return { ok: true, created, failed: null };
}
