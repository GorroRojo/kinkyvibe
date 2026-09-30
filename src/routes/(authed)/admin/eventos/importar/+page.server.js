import { error, fail } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/auth';
import { logAdminAction } from '$lib/server/admin/audit.js';
import { getDB } from '$lib/server/db';
import {
	POSTS_DIR,
	getEventAdmin,
	getRepoClient,
	isMockMode,
	listEvents,
	takenSlugsInBundle
} from '$lib/server/eventos';
import { GitHubError, PathExistsError } from '$lib/server/eventos/github.js';
import eventTemplate from '$lib/posts/calendario/_event_template.md?raw';
import {
	NEW_EVENT_TEMPLATE,
	isNumericFeatured,
	isValidDate,
	isValidTime,
	readEventFields,
	splitMarkdown,
	todayInArgentina,
	uniqueSlug,
	validateSlug
} from '$lib/utils/eventDraft.js';
import { buildImportedEvent } from '$lib/utils/sheetImport.js';

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
const MEDIA_DIR = `${POSTS_DIR}/media`;

/** @param {string} slug */
const eventPath = (slug) => `${POSTS_DIR}/${slug}.md`;
/** @param {string} slug */
const mediaPath = (slug) => `${MEDIA_DIR}/${slug}`;

/** @param {unknown} e */
function describeError(e) {
	return e instanceof Error ? e.message : String(e);
}

function template() {
	try {
		readEventFields(splitMarkdown(eventTemplate).frontmatter);
		return eventTemplate;
	} catch (e) {
		return NEW_EVENT_TEMPLATE;
	}
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
	if (row.link && !/^https?:\/\/\S+$/.test(row.link))
		return 'El link tiene que empezar con https://';
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
			const [mdList, mediaList] = await Promise.all([
				client.listTree(admin.token, POSTS_DIR),
				client.listTree(admin.token, MEDIA_DIR)
			]);
			const taken = new Set([
				...mdList.filter((e) => e.path.endsWith('.md')).map((e) => e.path.replace(/\.md$/, '')),
				...mediaList.map((e) => e.path)
			]);
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

			// The events to duplicate, read from GitHub (each one once).
			const sources = [...new Set(rows.map((r) => r.source).filter(Boolean))];
			const raws = await Promise.all(sources.map((s) => client.getFile(admin.token, eventPath(s))));
			/** @type {Map<string, string>} */
			const sourceRaw = new Map();
			sources.forEach((s, i) => {
				const raw = raws[i];
				if (raw !== null) sourceRaw.set(s, raw);
			});

			const today = todayInArgentina();
			/** @type {import('$lib/server/eventos/github.js').CommitFile[]} */
			const files = [];
			/** @type {Array<{slug: string, title: string, source: string, notes: string[]}>} */
			const created = [];
			/** @type {Array<{index: number, slug: string, source: string, featured: string}>} */
			const images = [];
			rows.forEach((row, i) => {
				const raw = row.source ? sourceRaw.get(row.source) : template();
				if (!raw) {
					rowErrors[
						i
					] = `No encontramos el evento “${row.source}” en GitHub. Elegí otro o “desde cero”.`;
					return;
				}
				try {
					const built = buildImportedEvent(raw, row, { today, fromTemplate: !row.source });
					files.push({ path: eventPath(row.slug), content: built.content });
					created.push({
						slug: row.slug,
						title: row.title,
						source: row.source,
						notes: built.notes
					});
					if (row.source && isNumericFeatured(built.featured))
						images.push({
							index: created.length - 1,
							slug: row.slug,
							source: row.source,
							featured: built.featured
						});
				} catch (e) {
					rowErrors[i] = describeError(e);
				}
			});
			if (Object.keys(rowErrors).length) {
				return fail(400, {
					error: 'Hay filas con problemas: corregilas y volvé a intentar.',
					rowErrors
				});
			}

			// Numeric featured images live in the source's media folder: copy them (same blob).
			if (images.length) {
				const media = await client.listTree(admin.token, MEDIA_DIR, { recursive: true });
				const bySource = new Map(media.map((e) => [e.path, e.sha]));
				for (const img of images) {
					const id = String(img.featured).trim();
					const name = ['jpeg', 'jfif', 'jpg', 'png', 'webp']
						.map((ext) => `${id}.${ext}`)
						.find((n) => bySource.has(`${img.source}/${n}`));
					if (name) {
						files.push({
							path: `${mediaPath(img.slug)}/${name}`,
							sha: bySource.get(`${img.source}/${name}`)
						});
					} else {
						created[img.index].notes.push(
							'No encontramos la imagen del evento anterior: quedó sin imagen.'
						);
					}
				}
			}

			const n = created.length;
			const commit = await client.commitFiles(admin.token, {
				files,
				message: `[admin] ${admin.name} importó ${n} ${
					n === 1 ? 'borrador' : 'borradores'
				} desde la planilla`,
				mustNotExist: rows.flatMap((r) => [eventPath(r.slug), mediaPath(r.slug)])
			});
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
				created: created.map((c) => ({ ...c, url: `/calendario/${c.slug}` })),
				files: files.map((f) => f.path),
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
