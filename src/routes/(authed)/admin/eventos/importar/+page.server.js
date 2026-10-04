/**
 * Importar eventos desde la planilla: cada fila elegida es un borrador (no listado, `borrador`)
 * guardado en la BASE como objeto `evento` (saveObject, con historial y sus relaciones como edges;
 * ver $lib/server/eventos/importarBase.js). Nada va a GitHub ni a un `.md`. Con el interruptor
 * `contenido_db` apagado no se importa: el sitio y el panel todavía leen los `.md`, y un borrador
 * guardado en la base no se vería en ningún lado.
 */
import { error, fail } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/auth';
import { eventLinkProblem } from '$lib/utils/eventLink.js';
import { logAdminAction } from '$lib/server/admin/audit.js';
import { getDB } from '$lib/server/db';
import { contenidoDbEnabled } from '$lib/server/flags.js';
import { getEventAdmin, takenSlugsInBundle } from '$lib/server/eventos';
import { panelAuthor } from '$lib/server/contenido/author.js';
import {
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
const DB_OFF =
	'Importar guarda los borradores en la base, y el contenido todavía sale de los archivos: prendé «Contenido desde la base» (Ajustes → Interruptores) para importar.';
const MAX_ROWS = IMPORT_MAX_ROWS;

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
	const dbOn = Boolean(db) && (await contenidoDbEnabled(platform));
	const base = { today: todayInArgentina(), maxRows: MAX_ROWS, dbOn };
	if (!db || !dbOn) return { ...base, events: [], takenSlugs: takenSlugsInBundle() };
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

/** @type {import('./$types').Actions} */
export const actions = {
	crear: async ({ locals, request, platform }) => {
		const admin = getEventAdmin(locals);
		if (!admin) return fail(403, { error: NO_PERMISSION });

		/** @type {RowInput[]} */
		let rows;
		try {
			const parsed = JSON.parse(String((await request.formData()).get('rows') ?? '[]'));
			if (!Array.isArray(parsed)) throw new Error();
			rows = parsed.map(readRow);
		} catch (e) {
			return fail(400, {
				error: 'No llegaron bien las filas. Recargá la página y probá de nuevo.'
			});
		}
		if (!rows.length) return fail(400, { error: 'No elegiste ninguna fila para importar.' });
		if (rows.length > MAX_ROWS) {
			return fail(400, {
				error: `Podés importar hasta ${MAX_ROWS} eventos por vez. Destildá algunos.`
			});
		}

		/** @type {Record<number, string>} */
		const rowErrors = {};
		const seen = new Set();
		rows.forEach((row, i) => {
			const problem = rowProblem(row);
			if (problem) rowErrors[i] = problem;
			else if (seen.has(row.slug)) rowErrors[i] = 'Dos filas tienen la misma dirección.';
			seen.add(row.slug);
		});
		if (Object.keys(rowErrors).length) {
			return fail(400, {
				error: 'Hay filas con problemas: corregilas y volvé a intentar.',
				rowErrors
			});
		}

		const db = getDB(platform);
		if (!db || !(await contenidoDbEnabled(platform))) return fail(409, { error: DB_OFF });

		// Quién guarda: el login de GitHub de le admin (como todo lo que el panel guarda en la base).
		const author = panelAuthor();
		try {
			const r = await createImportedDrafts(db, {
				rows,
				actor: author?.login || admin.login,
				superadmin: author ? author.superadmin : true,
				today: todayInArgentina(),
				taken: await takenEventSlugs(db, takenSlugsInBundle())
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
			const n = r.created.length;
			if (n) {
				await logAdminAction(db, locals, {
					action: 'event.import',
					targetType: 'event',
					targetId: n === 1 ? r.created[0].slug : null,
					summary: `Importó ${n} ${n === 1 ? 'borrador' : 'borradores'} desde la planilla`,
					detail: { slugs: r.created.map((c) => c.slug), base: true }
				});
			}
			return {
				success: true,
				created: r.created.map((c) => ({ ...c, url: `/calendario/${c.slug}` })),
				failed: r.failed
					? {
							...r.failed,
							title: rows[r.failed.index]?.title ?? r.failed.slug,
							pending: rows.length - n - 1
						}
					: null
			};
		} catch (e) {
			return fail(500, { error: 'No se pudo guardar en la base: ' + describeError(e) });
		}
	}
};
