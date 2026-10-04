/**
 * Borradores de eventos: un evento nuevo no listado (`force_unlisted: true`), «anunciado» y con la
 * marca `borrador: true`, que después se completa y se confirma. Es el mismo borrador que crea la importación de la planilla
 * (`buildImportedEvent` en sheetImport.js), por el mismo camino de guardado (`getRepoClient()`:
 * GitHub, el mock de `npm run dev:admin` o la capa demo de los previews).
 *
 * - `takenSlugsOnRepo`: las direcciones ocupadas en el repo ahora (dos listados);
 * - `commitDraftEvents`: arma los archivos de varios borradores (copiados de un evento anterior o
 *   de la plantilla, con la imagen del original) y los guarda en un commit. Lo usan la importación
 *   y la carga rápida de la agenda;
 * - `createQuickDraft`: la carga rápida de la agenda (un borrador en un día, duplicando un evento
 *   o de cero);
 * - `confirmDraft`: «Confirmar» un borrador: pasa a publicado (listado) y pierde la marca
 *   `borrador: true`, con la misma detección de conflictos que una fila de la agenda
 *   (`applyAgendaChange`), y queda en Actividad. Solo los que tienen la marca: un evento no
 *   listado a propósito nunca se publica desde acá;
 * - `duplicableEvents`: los eventos que se ofrecen para duplicar (ver quickDraft.js).
 */
import { parseDocument } from 'yaml';
import { POSTS_DIR, takenSlugsInBundle } from './index.js';
import { gitBlobSha, publishNote } from './agenda.js';
import { FileChangedError } from './github.js';
import { listPanelEvents } from './panel.js';
import { logAdminAction } from '$lib/server/admin/audit.js';
import { getDB } from '$lib/server/db';
import { siteTags } from '$lib/server/series/index.js';
import {
	agendaRowFromMeta,
	agendaValues,
	applyAgendaChange,
	readAgendaValues
} from '$lib/utils/agenda.js';
import { eventMissing, missingInputFromMeta } from '$lib/utils/eventMissing.js';
import eventTemplate from '$lib/posts/calendario/_event_template.md?raw';
import {
	NEW_EVENT_TEMPLATE,
	REMOVE,
	applyFrontmatterChanges,
	isNumericFeatured,
	joinMarkdown,
	readEventFields,
	splitMarkdown,
	todayInArgentina,
	validateSlug
} from '$lib/utils/eventDraft.js';
import { seriesTagIds } from '$lib/utils/series.js';
import { DRAFT_KEY, buildImportedEvent, proposeSlug } from '$lib/utils/sheetImport.js';
import { duplicateCandidates, quickDraftChoice } from '$lib/utils/quickDraft.js';
import { seriesGoalMap } from '$lib/utils/salesGoal.js';
import { withInheritedGoal } from '$lib/utils/salesGoalFile.js';

const MEDIA_DIR = `${POSTS_DIR}/media`;
/** @param {string} slug */
export const eventPath = (slug) => `${POSTS_DIR}/${slug}.md`;
/** @param {string} slug */
const mediaPath = (slug) => `${MEDIA_DIR}/${slug}`;

/** @typedef {Awaited<ReturnType<typeof import('./index.js').getRepoClient>>} RepoClient */
/** @typedef {{ token: string, name: string }} EventAdmin */

/** La plantilla de eventos del repo (o la de respaldo si no se puede leer). */
export function draftTemplate() {
	try {
		readEventFields(splitMarkdown(eventTemplate).frontmatter);
		return eventTemplate;
	} catch (e) {
		return NEW_EVENT_TEMPLATE;
	}
}

/**
 * Las direcciones ocupadas en el repo ahora (archivos y carpetas de imágenes), con dos listados.
 * @param {RepoClient} client
 * @param {string} token
 * @returns {Promise<Set<string>>}
 */
export async function takenSlugsOnRepo(client, token) {
	const [mdList, mediaList] = await Promise.all([
		client.listTree(token, POSTS_DIR),
		client.listTree(token, MEDIA_DIR)
	]);
	return new Set([
		...mdList.filter((e) => e.path.endsWith('.md')).map((e) => e.path.replace(/\.md$/, '')),
		...mediaList.map((e) => e.path)
	]);
}

/**
 * @typedef {import('$lib/utils/sheetImport.js').ImportChoice & { source: string, slug: string }} DraftRow
 * `source`: el slug del evento a duplicar ('' = de la plantilla); `slug`: la dirección nueva (ya
 * libre: quien llama lo comprobó).
 */

/**
 * @typedef {object} CreatedDraft
 * @prop {string} slug
 * @prop {string} title
 * @prop {string} source
 * @prop {string[]} notes avisos para revisar (lugar distinto, sin imagen…)
 * @prop {string} content el archivo nuevo
 */

/**
 * Arma los borradores y los guarda en un commit. Cada evento a duplicar se lee una vez; las
 * imágenes numéricas del original se copian (el mismo blob, sin subirlas de nuevo). Los errores
 * del repo (sin permiso, `PathExistsError` si alguien usó la dirección recién) los maneja quien
 * llama.
 *
 * @param {{
 *   client: RepoClient,
 *   admin: EventAdmin,
 *   rows: DraftRow[],
 *   today?: string,
 *   describe: (created: CreatedDraft[]) => { message: string, pr: import('./github.js').PublishOptions }
 * }} input
 * @returns {Promise<
 *   | { ok: false, rowErrors: Record<number, string> }
 *   | { ok: true, created: CreatedDraft[], files: string[], commit: Awaited<ReturnType<RepoClient['commitFiles']>> }
 * >}
 */
export async function commitDraftEvents({
	client,
	admin,
	rows,
	today = todayInArgentina(),
	describe
}) {
	const sources = [...new Set(rows.map((r) => r.source).filter(Boolean))];
	const raws = await Promise.all(sources.map((s) => client.getFile(admin.token, eventPath(s))));
	/** @type {Map<string, string>} */
	const sourceRaw = new Map();
	sources.forEach((s, i) => {
		const raw = raws[i];
		if (raw !== null) sourceRaw.set(s, raw);
	});

	// Meta de venta: una edición nueva de una serie con meta por defecto se lleva esa meta (copiada:
	// cambiarla después en la serie no toca este evento). Ver $lib/utils/salesGoal.js.
	const tags = siteTags();
	const seriesGoals = seriesGoalMap(seriesTagIds(tags), (id) => tags.get(id));
	/** @type {Record<number, string>} */
	const rowErrors = {};
	/** @type {import('./github.js').CommitFile[]} */
	const files = [];
	/** @type {CreatedDraft[]} */
	const created = [];
	/** @type {Array<{index: number, slug: string, source: string, featured: string}>} */
	const images = [];
	rows.forEach((row, i) => {
		const raw = row.source ? sourceRaw.get(row.source) : draftTemplate();
		if (!raw) {
			rowErrors[i] =
				`No encontramos el evento “${row.source}” en GitHub. Elegí otro o “desde cero”.`;
			return;
		}
		try {
			const built = buildImportedEvent(raw, row, { today, fromTemplate: !row.source });
			built.content = withInheritedGoal(built.content, seriesGoals);
			files.push({ path: eventPath(row.slug), content: built.content });
			created.push({
				slug: row.slug,
				title: row.title,
				source: row.source,
				notes: built.notes,
				content: built.content
			});
			if (row.source && isNumericFeatured(built.featured))
				images.push({
					index: created.length - 1,
					slug: row.slug,
					source: row.source,
					featured: built.featured
				});
		} catch (e) {
			rowErrors[i] = e instanceof Error ? e.message : String(e);
		}
	});
	if (Object.keys(rowErrors).length) return { ok: false, rowErrors };

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

	const { message, pr } = describe(created);
	const commit = await client.commitFiles(admin.token, {
		files,
		message,
		mustNotExist: rows.flatMap((r) => [eventPath(r.slug), mediaPath(r.slug)]),
		pr
	});
	return { ok: true, created, files: files.map((f) => f.path), commit };
}

/**
 * La fila de la agenda de un borrador recién creado (todavía no está en el deploy), con lo que le
 * falta.
 * @param {string} slug
 * @param {string} content
 */
export function draftAgendaRow(slug, content) {
	const { frontmatter } = splitMarkdown(content);
	const meta = parseDocument(frontmatter).toJS() ?? {};
	return {
		...agendaRowFromMeta(slug, readEventFields(frontmatter)),
		thumb: '',
		sellsTickets: Array.isArray(meta.tickets) && meta.tickets.length > 0,
		draft: meta[DRAFT_KEY] === true,
		missing: eventMissing(missingInputFromMeta(meta))
	};
}

/**
 * Carga rápida desde la agenda: un borrador en un día, duplicando un evento (`source`) o de cero
 * (solo el título). La dirección se elige sola (libre en el repo y en el deploy).
 *
 * @param {{
 *   client: RepoClient,
 *   admin: EventAdmin,
 *   source: string,
 *   title?: string,
 *   date: string,
 *   startTime?: string,
 *   endTime?: string
 * }} input
 * @returns {Promise<
 *   | { ok: false, status: number, message: string }
 *   | { ok: true, slug: string, title: string, notes: string[], row: ReturnType<typeof draftAgendaRow>, commitUrl: string, publish: import('./github.js').PublishResult | null }
 * >}
 */
export async function createQuickDraft({ client, admin, source, title, date, startTime, endTime }) {
	/** @type {{ slug: string, title: string, start?: string, end?: string } | null} */
	let src = null;
	if (source) {
		if (validateSlug(source)) return { ok: false, status: 400, message: 'Ese evento no existe.' };
		const raw = await client.getFile(admin.token, eventPath(source));
		if (raw === null) return { ok: false, status: 404, message: 'No encontramos ese evento.' };
		const f = readEventFields(splitMarkdown(raw).frontmatter);
		src = { slug: source, title: f.title || source, start: f.start, end: f.end };
	}
	const picked = quickDraftChoice({ source: src, title, date, startTime, endTime });
	if (!picked.ok) return { ok: false, status: 400, message: picked.error };
	const choice = picked.choice;
	const taken = await takenSlugsOnRepo(client, admin.token);
	const inBundle = new Set(takenSlugsInBundle());
	const slug = proposeSlug(
		choice.source || null,
		choice.title,
		choice.date,
		(s) => taken.has(s) || inBundle.has(s)
	);
	const r = await commitDraftEvents({
		client,
		admin,
		rows: [{ ...choice, slug, place: '', link: '', price: '' }],
		describe: () => ({
			message: `[admin] ${admin.name} cargó el borrador calendario/${slug} desde la agenda`,
			pr: {
				action: 'carga un borrador desde la agenda',
				title: `Borrador: ${choice.title}`,
				who: admin.name,
				kind: 'importar',
				slug
			}
		})
	});
	if (!r.ok) return { ok: false, status: 404, message: Object.values(r.rowErrors)[0] };
	const [made] = r.created;
	return {
		ok: true,
		slug,
		title: made.title,
		notes: made.notes,
		row: draftAgendaRow(slug, made.content),
		commitUrl: r.commit.url,
		publish: r.commit.pr ?? null
	};
}

/**
 * «Confirmar» un borrador: pasa de no listado a publicado (aparece en el calendario y en las
 * listas) y se le saca la marca `borrador: true`, con la misma detección de conflictos que una fila
 * de la agenda. El resto del archivo no se toca (el `status` sigue siendo el que era). Queda en
 * Actividad. Sin la marca (un evento no listado a propósito), 409 y no se toca nada.
 *
 * @param {{
 *   platform: App.Platform | undefined,
 *   locals: App.Locals,
 *   client: RepoClient,
 *   admin: EventAdmin,
 *   slug: string,
 *   before?: Record<string, unknown> | null
 * }} input
 */
export async function confirmDraft({ platform, locals, client, admin, slug, before = null }) {
	if (validateSlug(slug)) return { status: 400, ok: false, message: 'Evento inválido.' };
	const path = eventPath(slug);
	let raw;
	try {
		raw = await client.getFile(admin.token, path);
	} catch (e) {
		return {
			status: 502,
			ok: false,
			message: 'No pudimos leer el evento: ' + (e instanceof Error ? e.message : String(e))
		};
	}
	if (raw === null) return { status: 404, ok: false, message: 'No encontramos ese evento.' };
	/** @type {string} */
	let content;
	/** @type {import('$lib/utils/agenda.js').AgendaRow} */
	let current;
	try {
		const { frontmatter } = splitMarkdown(raw);
		const meta = parseDocument(frontmatter).toJS() ?? {};
		current = { ...agendaRowFromMeta(slug, readEventFields(frontmatter)), slug };
		// Solo los borradores del panel: un evento no listado a propósito no se publica desde acá.
		if (meta[DRAFT_KEY] !== true) {
			return {
				status: 409,
				ok: false,
				message:
					'No es un borrador del panel (no tiene la marca «borrador»): si querés publicarlo, hacelo desde el editor.',
				current
			};
		}
		const seen = readAgendaValues(before ?? agendaValues(current));
		const r = applyAgendaChange(raw, { before: seen, after: { ...seen, state: 'publicado' } });
		if (r.conflicts.length || current.state === 'cancelado') {
			return {
				status: 409,
				ok: false,
				message:
					'Alguien cambió el estado de este evento mientras tanto. Actualizamos lo que se ve: revisalo.',
				current
			};
		}
		const fm = splitMarkdown(r.content);
		content = joinMarkdown(
			applyFrontmatterChanges(fm.frontmatter, { [DRAFT_KEY]: REMOVE }),
			fm.body
		);
	} catch (e) {
		return {
			status: 422,
			ok: false,
			message: 'Las propiedades de este evento tienen un formato raro: confirmalo desde el editor.'
		};
	}
	/** @type {Awaited<ReturnType<RepoClient['commitFiles']>>} */
	let commit;
	try {
		commit = await client.commitFiles(admin.token, {
			files: [{ path, content }],
			message: `[admin] ${admin.name} confirmó calendario/${slug} (deja de ser borrador)`,
			unchanged: [{ path, sha: await gitBlobSha(raw) }],
			pr: { action: 'confirma un borrador', who: admin.name }
		});
	} catch (e) {
		return {
			status: e instanceof FileChangedError ? 409 : 502,
			ok: false,
			message:
				e instanceof FileChangedError
					? 'El evento cambió justo mientras confirmabas. Probá de nuevo.'
					: 'No se pudo guardar: ' + (e instanceof Error ? e.message : String(e))
		};
	}
	await logAdminAction(getDB(platform), locals, {
		action: 'event.confirm',
		targetType: 'event',
		targetId: slug,
		summary: `Confirmó calendario/${slug}: ahora aparece en el calendario`,
		detail: { commit: commit.url ?? null }
	});
	return {
		status: 200,
		ok: true,
		message: `Confirmado: ya aparece en el calendario.${publishNote(commit.pr)}`,
		current: { ...current, state: /** @type {const} */ ('publicado') },
		commitUrl: commit.url,
		publish: commit.pr ?? null
	};
}

/**
 * Los eventos que se ofrecen para duplicar, ya ordenados (ver `duplicateCandidates`): todos los
 * del deploy, con el nombre de su serie.
 */
export async function duplicableEvents() {
	const tags = siteTags();
	const series = new Set(seriesTagIds(tags));
	const events = await listPanelEvents();
	return duplicateCandidates(
		events.map((e) => {
			const id = e.tags.map((t) => tags.get(t)?.id ?? t).find((t) => series.has(t));
			return {
				slug: e.slug,
				title: e.title,
				start: e.start,
				end: e.end,
				unpublished: e.unpublished,
				series: id ? String(tags.get(id)?.visible_name ?? id) : ''
			};
		})
	);
}
