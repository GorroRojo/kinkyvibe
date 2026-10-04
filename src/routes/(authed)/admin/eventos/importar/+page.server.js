/**
 * Importar eventos desde la planilla: cada fila elegida es un borrador (no listado, `borrador`)
 * guardado en la BASE como objeto `evento` (saveObject, con historial y sus relaciones como edges;
 * ver $lib/server/eventos/importarBase.js). Nada va a GitHub ni a un `.md`. Sin base no se importa.
 * (El modo «interruptor `contenido_db` apagado → no importa» se fue con el interruptor: el
 * contenido sale siempre de la base.)
 */
import { error, fail } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/auth';
import { eventLinkProblem } from '$lib/utils/eventLink.js';
import { logAdminAction } from '$lib/server/admin/audit.js';
import { getDB } from '$lib/server/db';
import { getEventAdmin, takenSlugsInBundle } from '$lib/server/eventos';
import { panelAuthor } from '$lib/server/contenido/author.js';
import {
	IMPORT_CHUNK,
	IMPORT_MAX_ROWS,
	createImportedDrafts,
	importSources,
	takenEventSlugs
} from '$lib/server/eventos/importarBase.js';
import { siteTags } from '$lib/server/series/index.js';
import { normalizeLink } from '$lib/utils/sheetImport.js';
import { seriesTagIds } from '$lib/utils/series.js';
import { isValidDate, isValidTime, todayInArgentina, validateSlug } from '$lib/utils/eventDraft.js';

const NO_PERMISSION =
	'No tenés permiso para cargar eventos. Probá cerrar sesión y volver a entrar.';
const NO_DB = 'Sin base de datos: no se puede importar.';
const MAX_ROWS = IMPORT_MAX_ROWS;
/** Cuánto puede diferir `importAt` (lo pone la página) de la hora del servidor. */
const IMPORT_AT_WINDOW_MS = 24 * 60 * 60 * 1000;

/** @param {unknown} e */
function describeError(e) {
	return e instanceof Error ? e.message : String(e);
}

/** El nombre de la serie de unas etiquetas ('' si no son de ninguna). */
function seriesNamer() {
	try {
		const tags = siteTags();
		const series = new Set(seriesTagIds(tags));
		return (/** @type {string[]} */ list) => {
			const id = list.map((t) => tags.get(t)?.id ?? t).find((t) => series.has(t));
			return id ? String(tags.get(id)?.visible_name ?? id) : '';
		};
	} catch {
		return () => '';
	}
}

/** @type {import('./$types').PageServerLoad} */
export async function load({ locals, url, platform }) {
	requireAdmin(locals, url);
	if (!getEventAdmin(locals)) throw error(403, NO_PERMISSION);
	const db = getDB(platform);
	// `dbOn`: hay base (el contenido sale siempre de ahí; ya no hay interruptor `contenido_db`).
	const dbOn = Boolean(db);
	const base = { today: todayInArgentina(), maxRows: MAX_ROWS, chunk: IMPORT_CHUNK, dbOn };
	if (!db) return { ...base, events: [], takenSlugs: takenSlugsInBundle() };
	return {
		...base,
		events: await importSources(db, { seriesName: seriesNamer() }),
		takenSlugs: [...(await takenEventSlugs(db, takenSlugsInBundle()))]
	};
}

/**
 * @typedef {import('$lib/server/eventos/importarBase.js').ImportRow} RowInput
 */

/**
 * @param {unknown} raw
 * @returns {RowInput}
 */
function readRow(raw) {
	/** @type {any} */
	const r = raw && typeof raw === 'object' ? raw : {};
	/** @param {unknown} v */
	const s = (v) => (typeof v === 'string' ? v.trim() : '');
	const tickets = r.tickets && typeof r.tickets === 'object' && !Array.isArray(r.tickets);
	return {
		title: s(r.title),
		date: s(r.date),
		startTime: s(r.startTime),
		endTime: s(r.endTime),
		place: s(r.place),
		link: normalizeLink(s(r.link)),
		price: s(r.price).slice(0, 200),
		source: s(r.source),
		slug: s(r.slug),
		tickets: tickets ? r.tickets : null
	};
}

/** @param {RowInput} row @returns {string|null} */
function rowProblem(row) {
	if (!row.title) return 'Falta el título.';
	if (!isValidDate(row.date)) return 'Falta la fecha o no es válida.';
	if (!isValidTime(row.startTime)) return 'Falta la hora de inicio.';
	if (row.endTime && !isValidTime(row.endTime)) return 'La hora de fin no es válida.';
	const linkProblem = row.link ? eventLinkProblem(row.link) : null;
	if (linkProblem) return `El link de inscripción ${linkProblem}.`;
	if (row.source && validateSlug(row.source)) return 'El evento anterior elegido no existe.';
	return validateSlug(row.slug);
}

/**
 * «Crear borradores», de a tandas de {@link IMPORT_CHUNK} filas (hasta {@link MAX_ROWS} en total).
 * La página primero manda todas las tandas con `dryRun=1` (solo revisa: no guarda nada) y, si
 * ninguna tiene problemas, las vuelve a mandar para guardar. Campos:
 *
 * - `rows`: las filas de esta tanda (JSON);
 * - `allSlugs`: las direcciones de TODA la importación (JSON), para encontrar filas repetidas entre
 *   tandas y proponer direcciones libres;
 * - `importAt`: un número (ms) que la página elige al empezar a guardar y repite en cada tanda.
 *   Es el `now` de todos los guardados: una tanda reintentada no duplica eventos (ver
 *   `createImportedDrafts`).
 *
 * Los índices de `rowErrors` y `conflicts` son de la tanda.
 */
/** @type {import('./$types').Actions} */
export const actions = {
	crear: async ({ locals, request, platform }) => {
		const admin = getEventAdmin(locals);
		if (!admin) return fail(403, { error: NO_PERMISSION });

		/** @type {RowInput[]} */
		let rows;
		/** @type {string[]} */
		let allSlugs;
		let dryRun = false;
		/** @type {number | null} */
		let importAt = null;
		try {
			const form = await request.formData();
			const parsed = JSON.parse(String(form.get('rows') ?? '[]'));
			if (!Array.isArray(parsed)) throw new Error();
			rows = parsed.map(readRow);
			const slugs = form.has('allSlugs') ? JSON.parse(String(form.get('allSlugs'))) : null;
			if (slugs !== null && !Array.isArray(slugs)) throw new Error();
			allSlugs = slugs ? slugs.map((/** @type {unknown} */ x) => String(x ?? '').trim()) : [];
			dryRun = form.get('dryRun') === '1';
			const at = String(form.get('importAt') ?? '').trim();
			if (at) importAt = Number(at);
		} catch (e) {
			return fail(400, {
				error: 'No llegaron bien las filas. Recargá la página y probá de nuevo.'
			});
		}
		if (!allSlugs.length) allSlugs = rows.map((r) => r.slug);
		if (!rows.length) return fail(400, { error: 'No elegiste ninguna fila para importar.' });
		if (allSlugs.length > MAX_ROWS) {
			return fail(400, {
				error: `Podés importar hasta ${MAX_ROWS} eventos por vez. Destildá algunos.`
			});
		}
		if (rows.length > IMPORT_CHUNK) {
			return fail(400, {
				error: `Llegaron más de ${IMPORT_CHUNK} filas juntas. Recargá la página y probá de nuevo.`
			});
		}
		const now = Date.now();
		// Sin `importAt` (un solo pedido), la hora del servidor.
		if (importAt === null) importAt = now;
		else if (!dryRun) {
			if (!Number.isSafeInteger(importAt) || Math.abs(now - importAt) > IMPORT_AT_WINDOW_MS) {
				return fail(400, {
					error: 'No llegaron bien las filas. Recargá la página y probá de nuevo.'
				});
			}
		}

		/** @type {Record<number, string>} */
		const rowErrors = {};
		const seen = new Set();
		rows.forEach((row, i) => {
			const problem = rowProblem(row);
			if (problem) rowErrors[i] = problem;
			else if (seen.has(row.slug) || allSlugs.filter((x) => x === row.slug).length > 1)
				rowErrors[i] = 'Dos filas tienen la misma dirección.';
			seen.add(row.slug);
		});
		if (Object.keys(rowErrors).length) {
			return fail(400, {
				error: 'Hay filas con problemas: corregilas y volvé a intentar.',
				rowErrors
			});
		}

		const db = getDB(platform);
		if (!db) return fail(503, { error: NO_DB });

		// Quién guarda: el login de GitHub de le admin (como todo lo que el panel guarda en la base).
		const author = panelAuthor();
		try {
			const r = await createImportedDrafts(db, {
				rows,
				actor: author?.login || admin.login,
				superadmin: author ? author.superadmin : true,
				today: todayInArgentina(),
				taken: await takenEventSlugs(db, takenSlugsInBundle()),
				now: dryRun ? now : importAt,
				dryRun,
				allSlugs
			});
			if (!r.ok && r.status === 409) {
				return fail(409, {
					error:
						'Algunas direcciones ya existen en el sitio. Te propusimos otras: revisalas y volvé a intentar.',
					conflicts: r.conflicts
				});
			}
			if (!r.ok) {
				return fail(400, {
					error: 'Hay filas con problemas: corregilas y volvé a intentar.',
					rowErrors: r.rowErrors
				});
			}
			if (dryRun) return { success: true, checked: rows.length, created: [], failed: null };
			const fresh = r.created.filter((c) => !c.again);
			const n = fresh.length;
			if (n) {
				await logAdminAction(db, locals, {
					action: 'event.import',
					targetType: 'event',
					targetId: n === 1 ? fresh[0].slug : null,
					summary: `Importó ${n} ${n === 1 ? 'borrador' : 'borradores'} desde la planilla`,
					detail: { slugs: fresh.map((c) => c.slug), base: true }
				});
			}
			return {
				success: true,
				created: r.created.map((c) => ({ ...c, url: `/calendario/${c.slug}` })),
				failed: r.failed
					? {
							...r.failed,
							title: rows[r.failed.index]?.title ?? r.failed.slug,
							pending: rows.length - r.created.length - 1
						}
					: null
			};
		} catch (e) {
			return fail(500, { error: 'No se pudo guardar en la base: ' + describeError(e) });
		}
	}
};
