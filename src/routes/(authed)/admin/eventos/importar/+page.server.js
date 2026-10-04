import { error, fail } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/auth';
import { eventLinkProblem } from '$lib/utils/eventLink.js';
import { logAdminAction } from '$lib/server/admin/audit.js';
import { getDB } from '$lib/server/db';
import {
	getEventAdmin,
	getRepoClient,
	isMockMode,
	listEvents,
	takenSlugsInBundle
} from '$lib/server/eventos';
import { GitHubError, PathExistsError } from '$lib/server/eventos/github.js';
import {
	isValidDate,
	isValidTime,
	todayInArgentina,
	uniqueSlug,
	validateSlug
} from '$lib/utils/eventDraft.js';
import { commitDraftEvents, takenSlugsOnRepo } from '$lib/server/eventos/drafts.js';

const NO_PERMISSION =
	'No tenés permiso para cargar eventos. Probá cerrar sesión y volver a entrar.';
/**
 * Rows per import. Each import makes one GitHub read per distinct source event plus a constant
 * handful (two slug listings, one media listing, the commit's ~5 calls), so 200 rows stay far
 * below the Workers Paid subrequest limit: 10,000 per request by default (Free: 50), per
 * https://developers.cloudflare.com/workers/platform/limits/ (checked 2026-09-29). Text files go
 * inline in the commit's tree and copied images reuse their blobs, so rows add no other calls.
 */
const MAX_ROWS = 200;

/** @param {unknown} e */
function describeError(e) {
	return e instanceof Error ? e.message : String(e);
}

/** @type {import('./$types').PageServerLoad} */
export async function load({ locals, url }) {
	requireAdmin(locals, url);
	if (!getEventAdmin(locals)) throw error(403, NO_PERMISSION);
	const events = (await listEvents()).map((e) => ({
		slug: e.slug,
		title: e.title,
		start: e.start,
		end: e.end
	}));
	return {
		events,
		takenSlugs: takenSlugsInBundle(),
		today: todayInArgentina(),
		maxRows: MAX_ROWS,
		mock: isMockMode()
	};
}

/**
 * @typedef {object} RowInput
 * @prop {string} title
 * @prop {string} date
 * @prop {string} startTime
 * @prop {string} endTime
 * @prop {string} place
 * @prop {string} link
 * @prop {string} price the "Valor" cell (one General price becomes the General ticket type)
 * @prop {string} source slug of the event to duplicate, or '' to start from the template
 * @prop {string} slug
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
	return {
		title: s(r.title),
		date: s(r.date),
		startTime: s(r.startTime),
		endTime: s(r.endTime),
		place: s(r.place),
		link: s(r.link),
		price: s(r.price).slice(0, 200),
		source: s(r.source),
		slug: s(r.slug)
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

		const client = await getRepoClient();
		try {
			// Which slugs are taken on GitHub right now (two listings, whatever the number of rows).
			const taken = await takenSlugsOnRepo(client, admin.token);
			/** @type {Record<number, string>} */
			const conflicts = {};
			const batch = new Set(rows.map((r) => r.slug));
			rows.forEach((row, i) => {
				if (taken.has(row.slug))
					conflicts[i] = uniqueSlug(row.slug, (s) => taken.has(s) || batch.has(s));
			});
			if (Object.keys(conflicts).length) {
				return fail(409, {
					error:
						'Algunas direcciones ya existen en el sitio. Te propusimos otras: revisalas y volvé a intentar.',
					conflicts
				});
			}

			// The same drafts as the agenda's quick add: read the sources, build, copy the images,
			// one commit.
			const r = await commitDraftEvents({
				client,
				admin,
				rows,
				today: todayInArgentina(),
				describe: (made) => {
					const n = made.length;
					return {
						message: `[admin] ${admin.name} importó ${n} ${
							n === 1 ? 'borrador' : 'borradores'
						} desde la planilla`,
						pr: {
							action: 'importa',
							title: `${n} ${n === 1 ? 'borrador' : 'borradores'} de eventos desde la planilla`,
							who: admin.name,
							kind: 'importar',
							slug: n === 1 ? made[0].slug : `${n}-eventos`
						}
					};
				}
			});
			if (!r.ok) {
				return fail(400, {
					error: 'Hay filas con problemas: corregilas y volvé a intentar.',
					rowErrors: r.rowErrors
				});
			}
			const { commit, files } = r;
			const created = r.created.map(({ content, ...c }) => c);
			const n = created.length;
			await logAdminAction(getDB(platform), locals, {
				action: 'event.import',
				targetType: 'event',
				targetId: n === 1 ? created[0].slug : null,
				summary: `Importó ${n} ${n === 1 ? 'borrador' : 'borradores'} desde la planilla`,
				detail: { slugs: created.map((c) => c.slug), commit: commit.url }
			});
			return {
				success: true,
				commitUrl: commit.url,
				publish: commit.pr ?? null,
				created: created.map((c) => ({ ...c, url: `/calendario/${c.slug}` })),
				files,
				mock: isMockMode()
			};
		} catch (e) {
			if (e instanceof PathExistsError) {
				return fail(409, {
					error:
						'Alguien cargó un evento con una de estas direcciones recién. Volvé a intentar para ver cuál.'
				});
			}
			const hint =
				e instanceof GitHubError && (e.status === 401 || e.status === 403)
					? ' Probá cerrar sesión y volver a entrar.'
					: '';
			return fail(502, { error: 'No se pudo guardar en GitHub: ' + describeError(e) + hint });
		}
	}
};
