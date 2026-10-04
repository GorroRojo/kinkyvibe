/**
 * Borrar desde el panel (eventos, material y amigues), con deshacer y «Recuperar».
 *
 * Las publicaciones son archivos .md del repo: borrar es un cambio de contenido más, por el mismo
 * camino que guardar (`commitFiles` de $lib/server/eventos/github.js: un PR `contenido/*` que se
 * mergea solo). El commit saca el .md y toda su carpeta de imágenes.
 *
 * Nunca se pierde nada: ANTES de commitear se guarda en D1 (`panel_deletions`, migración 0021) el
 * texto del .md, su sha y la lista de imágenes con sus shas. Deshacer:
 * - si el PR del borrado todavía no se mergeó, se cierra (no se publica nada);
 * - si ya se mergeó (o no hay PR: mock y modo demo), se restaura con otro PR que vuelve a poner
 *   el .md y las imágenes (los blobs siguen en el historial del repo, no se vuelven a subir).
 *
 * Los perfiles de amigues viven solo en la base («solo base»: los creados en el panel o por las
 * cuentas y también las fichas importadas de un .md) y no pasan por GitHub: borrar es el borrado suave del objeto (`deleted_at` con
 * saveObject(), con su revisión en `object_revisions`) y deshacer lo vuelve atrás, igual que los
 * eventos. La fila de `panel_deletions` (con `path` = `objeto:perfil:<id>`) va en la misma tanda,
 * así «Recuperar» de Actividad sirve para los dos. Ver {@link deleteDbProfile}.
 *
 * Sin imports de SvelteKit: el cliente del repo, el estado de los PRs y la base llegan como
 * parámetros, así se prueba con fakes. Las rutas están en ./deletionRoutes.js.
 */
import { profileSlugFor } from '$lib/utils/organizers.js';
import { parsePersonas } from '$lib/utils/personas.js';
import { postFilePath } from '$lib/utils/postPaths.js';
import { MEMBER_EDGE, PROFILE_TYPE } from '../cuentas/perfiles.js';
import { revisionStatement } from '../contenido/revisions.js';
import { VersionConflictError } from '../objects/errors.js';
import { saveObject } from '../objects/save.js';
import { logAdminAction } from './audit.js';
import { contentMediaDir, gitBlobSha } from './posts.js';

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */
/** @typedef {import('../eventos/github.js').CommitFile} CommitFile */
/** @typedef {import('../eventos/github.js').PublishResult} PublishResult */
/**
 * @typedef {Pick<typeof import('../eventos/github.js'), 'getFile' | 'listTree' | 'commitFiles'>} DeleteClient
 */

/** Lo que se puede borrar desde el panel, con cómo se llama en los textos. */
export const DELETABLE = Object.freeze({
	calendario: {
		one: 'evento',
		the: 'el evento',
		list: '/admin/eventos',
		page: '/calendario',
		targetType: 'event',
		action: 'event'
	},
	material: {
		one: 'material',
		the: 'el material',
		list: '/admin/contenido/material',
		page: '/material',
		targetType: 'post',
		action: 'material'
	},
	amigues: {
		one: 'perfil',
		the: 'el perfil',
		list: '/admin/comunidad/perfiles',
		page: '/amigues',
		targetType: 'post',
		action: 'amigues'
	}
});

/** @typedef {keyof typeof DELETABLE} DeletableKind */

/** @param {unknown} kind @returns {kind is DeletableKind} */
export const isDeletable = (kind) => typeof kind === 'string' && Object.hasOwn(DELETABLE, kind);

/**
 * Dónde vive lo que se borra: un perfil de amigues vive solo en la base ('objects': también las
 * fichas importadas de un .md, «solo base»); los eventos y el material pasan por el cliente del
 * repo ('repo'), que los guarda en la base (`withContentDb`).
 * @param {DeletableKind} kind
 * @param {{ legacySlug: string | null } | null} [profile] el perfil de la base con esa dirección
 * @returns {'repo' | 'objects'}
 */
export function deleteBackend(kind, profile = null) {
	return kind === 'amigues' && profile ? 'objects' : 'repo';
}

/**
 * @typedef {object} EventOrders
 * @prop {number} sold entradas aprobadas
 * @prop {number} open compras en curso (pagando o esperando la transferencia, sin vencer)
 * @prop {number} refunded compras reembolsadas
 */

/**
 * Compras de un evento que impiden (o hacen pensar dos veces) borrarlo. Una consulta, por el
 * índice (event_slug, ticket_type, status).
 * @param {D1Database | null | undefined} db
 * @param {string} slug
 * @param {{ now?: number }} [opts]
 * @returns {Promise<EventOrders>}
 */
export async function eventOrders(db, slug, { now = Date.now() } = {}) {
	if (!db) return { sold: 0, open: 0, refunded: 0 };
	const row = await db
		.prepare(
			`SELECT
				SUM(CASE WHEN status = 'approved' THEN quantity ELSE 0 END) AS sold,
				SUM(CASE WHEN status IN ('pending', 'awaiting_transfer') AND expires_at > ?2
					THEN 1 ELSE 0 END) AS open,
				SUM(CASE WHEN status = 'refunded' THEN 1 ELSE 0 END) AS refunded
			FROM orders WHERE event_slug = ?1`
		)
		.bind(slug, now)
		.first();
	return {
		sold: Number(row?.sold ?? 0),
		open: Number(row?.open ?? 0),
		refunded: Number(row?.refunded ?? 0)
	};
}

/**
 * Cuántos eventos listan a este perfil como organizador (`authors:`), con el mismo criterio que
 * el sitio para encontrar el perfil (`profileSlugFor`).
 * @param {Record<string, number>} usage `authors:` → cantidad de eventos (authorUsage de content.js)
 * @param {string} slug
 */
export function organizedEvents(usage, slug) {
	let n = 0;
	for (const [author, count] of Object.entries(usage)) {
		if (profileSlugFor(author) === slug) n += count;
	}
	return n;
}

/** @param {number} n @param {string} one @param {string} many */
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/**
 * @typedef {object} DeletePlan
 * @prop {string[]} blockers no se puede borrar (con el motivo)
 * @prop {string[]} warnings lo que depende de esto: hay que escribir la dirección para confirmar
 * @prop {string[]} notes lo que también pasa (imágenes, la página pública)
 * @prop {boolean} needsTyping
 * @prop {string} alternative qué hacer en lugar de borrar, si está bloqueado
 */

/**
 * Qué impide borrar, qué depende de la publicación y qué más pasa. Pura.
 * @param {{
 *   kind: DeletableKind, slug: string, media: number,
 *   orders?: EventOrders, sellsTickets?: boolean, organizerOf?: number
 * }} input
 * @returns {DeletePlan}
 */
export function deletionPlan({ kind, slug, media, orders, sellsTickets = false, organizerOf = 0 }) {
	/** @type {string[]} */
	const blockers = [];
	/** @type {string[]} */
	const warnings = [];
	const k = DELETABLE[kind];
	const notes = [`La página ${k.page}/${slug} deja de existir cuando se publique el cambio.`];
	if (media > 0)
		notes.push(
			`También se borra su carpeta de imágenes (${plural(media, 'archivo', 'archivos')}).`
		);
	let alternative = '';
	if (kind === 'calendario' && orders) {
		if (orders.sold > 0)
			blockers.push(
				`Tiene ${plural(orders.sold, 'entrada vendida', 'entradas vendidas')}: las entradas, los mails y el ingreso dependen del evento.`
			);
		if (orders.open > 0)
			blockers.push(
				`Hay ${plural(orders.open, 'compra en curso', 'compras en curso')} (pagando o esperando la transferencia).`
			);
		if (blockers.length)
			alternative =
				'En lugar de borrarlo, podés cancelarlo (estado «cancelado») o dejarlo no listado desde Editar.';
		if (orders.refunded > 0)
			warnings.push(
				`Tiene ${plural(orders.refunded, 'compra reembolsada', 'compras reembolsadas')}: quedan en Ventas y Personas, pero sin la página del evento.`
			);
		if (sellsTickets && orders.sold === 0)
			warnings.push('Tiene venta de entradas configurada (todavía sin compras).');
	}
	if (kind === 'amigues' && organizerOf > 0)
		warnings.push(
			`Figura como organizador en ${plural(organizerOf, 'evento', 'eventos')}: ahí va a quedar el nombre sin link al perfil.`
		);
	return { blockers, warnings, notes, needsTyping: warnings.length > 0, alternative };
}

/**
 * ¿Confirmó lo que hacía falta? Con dependencias hay que escribir la dirección exacta.
 * @param {DeletePlan} plan
 * @param {string} slug
 * @param {string} typed
 */
export function confirmed(plan, slug, typed) {
	return !plan.needsTyping || typed.trim() === slug;
}

/**
 * El título del frontmatter (sin comillas), o el slug.
 * @param {string} raw
 * @param {string} slug
 */
export function postTitle(raw, slug) {
	const front = /^---\r?\n([\s\S]*?)\r?\n---/.exec(raw)?.[1] ?? '';
	const title = /^title:[ \t]*(.+)$/m.exec(front)?.[1]?.trim();
	return title ? title.replace(/^(['"])(.*)\1$/, '$2') : slug;
}

/**
 * Lo que hay en el repo de una publicación: el .md y los archivos de su carpeta de imágenes.
 * @param {DeleteClient} client
 * @param {string} token
 * @param {DeletableKind} kind
 * @param {string} slug
 * @returns {Promise<{path: string, raw: string, sha: string, title: string, media: Array<{path: string, sha: string}>} | null>}
 */
export async function readPostFiles(client, token, kind, slug) {
	const path = postFilePath(kind, slug);
	if (!path || slug.startsWith('_')) return null;
	const raw = await client.getFile(token, path);
	if (raw === null) return null;
	const dir = contentMediaDir(kind, slug);
	const media = (await client.listTree(token, dir, { recursive: true }))
		.filter((e) => e.type === 'blob')
		.map((e) => ({ path: `${dir}/${e.path}`, sha: e.sha }));
	return { path, raw, sha: await gitBlobSha(raw), title: postTitle(raw, slug), media };
}

/* ------------------------------------------------------------------------------------------ */
/*  D1: panel_deletions                                                                        */
/* ------------------------------------------------------------------------------------------ */

/**
 * @typedef {object} Deletion
 * @prop {number} id
 * @prop {DeletableKind} kind
 * @prop {string} slug
 * @prop {string} title
 * @prop {string} path
 * @prop {string} content
 * @prop {string} contentSha
 * @prop {Array<{path: string, sha: string}>} media
 * @prop {'borrado'|'deshecho'|'recuperado'} status
 * @prop {number | null} prNumber
 * @prop {string | null} prBranch
 * @prop {number} deletedAt
 * @prop {string} deletedBy
 * @prop {number | null} restoredAt
 * @prop {string | null} restoredBy
 * @prop {number | null} restorePr
 */

/** @param {any} r @returns {Deletion} */
function toDeletion(r) {
	let media = [];
	try {
		media = JSON.parse(String(r.media ?? '[]'));
	} catch {
		media = [];
	}
	return {
		id: Number(r.id),
		kind: r.kind,
		slug: String(r.slug),
		title: String(r.title),
		path: String(r.path),
		content: String(r.content),
		contentSha: String(r.content_sha),
		media: Array.isArray(media) ? media : [],
		status: r.status,
		prNumber: r.pr_number === null ? null : Number(r.pr_number),
		prBranch: r.pr_branch === null ? null : String(r.pr_branch),
		deletedAt: Number(r.deleted_at),
		deletedBy: String(r.deleted_by),
		restoredAt: r.restored_at === null ? null : Number(r.restored_at),
		restoredBy: r.restored_by === null ? null : String(r.restored_by),
		restorePr: r.restore_pr === null ? null : Number(r.restore_pr)
	};
}

/**
 * @param {D1Database} db
 * @param {number} id
 * @returns {Promise<Deletion | null>}
 */
export async function getDeletion(db, id) {
	const row = await db.prepare('SELECT * FROM panel_deletions WHERE id = ?1').bind(id).first();
	return row ? toDeletion(row) : null;
}

/**
 * Borrados que todavía se pueden recuperar, del más nuevo al más viejo (sin el texto completo).
 * @param {D1Database | null | undefined} db
 * @param {{ limit?: number }} [opts]
 * @returns {Promise<Array<Omit<Deletion, 'content' | 'media'> & { mediaCount: number }>>}
 */
export async function listRecoverable(db, { limit = 20 } = {}) {
	if (!db) return [];
	const { results } = await db
		.prepare(
			`SELECT id, kind, slug, title, path, content_sha, media, status, pr_number, pr_branch,
				deleted_at, deleted_by, restored_at, restored_by, restore_pr, '' AS content
			FROM panel_deletions WHERE status = 'borrado' ORDER BY deleted_at DESC LIMIT ?1`
		)
		.bind(limit)
		.all();
	return results.map((r) => {
		/** @type {Partial<Deletion>} */
		const d = toDeletion(r);
		const mediaCount = d.media?.length ?? 0;
		delete d.content;
		delete d.media;
		return { .../** @type {Omit<Deletion, 'content' | 'media'>} */ (d), mediaCount };
	});
}

/* ------------------------------------------------------------------------------------------ */
/*  Borrar y deshacer                                                                          */
/* ------------------------------------------------------------------------------------------ */

/**
 * @typedef {object} Actor
 * @prop {string} login
 * @prop {string} name
 * @prop {string} token
 * @prop {App.Locals | { user?: { id?: number, login?: string } | null }} locals para Actividad
 */

/** @param {string} who @param {string} verb @param {Deletion | {kind: string, slug: string}} d */
const message = (who, verb, d) => `[admin] ${who} ${verb} ${d.kind}/${d.slug}`;

/**
 * Borra una publicación: guarda la copia en D1, commitea (PR que se mergea solo, aparte de
 * cualquier otro: `stack: false`) y lo anota en Actividad. Si el commit falla, la copia se
 * descarta y el error sube (PendingChangeError, FileChangedError…).
 * @param {DeleteClient} client
 * @param {D1Database} db
 * @param {Actor} actor
 * @param {{kind: DeletableKind, slug: string, files: NonNullable<Awaited<ReturnType<typeof readPostFiles>>>}} input
 * @param {{ now?: number }} [opts]
 * @returns {Promise<{ id: number, publish: PublishResult | null, commit: string }>}
 */
export async function deletePost(
	client,
	db,
	actor,
	{ kind, slug, files },
	{ now = Date.now() } = {}
) {
	const inserted = await db
		.prepare(
			`INSERT INTO panel_deletions
				(kind, slug, title, path, content, content_sha, media, status, deleted_at, deleted_by)
			VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'borrado', ?8, ?9) RETURNING id`
		)
		.bind(
			kind,
			slug,
			files.title,
			files.path,
			files.raw,
			files.sha,
			JSON.stringify(files.media),
			now,
			actor.login
		)
		.first();
	const id = Number(inserted?.id);
	/** @type {Awaited<ReturnType<DeleteClient['commitFiles']>>} */
	let commit;
	try {
		commit = await client.commitFiles(actor.token, {
			files: [files.path, ...files.media.map((m) => m.path)].map((path) => ({
				path,
				delete: true
			})),
			message: message(actor.name, 'deleted', { kind, slug }),
			unchanged: [{ path: files.path, sha: files.sha }],
			pr: { action: 'borra', title: files.title, who: actor.name, stack: false }
		});
	} catch (e) {
		await db.prepare('DELETE FROM panel_deletions WHERE id = ?1').bind(id).run();
		throw e;
	}
	const publish = commit.pr ?? null;
	if (publish)
		await db
			.prepare('UPDATE panel_deletions SET pr_number = ?2, pr_branch = ?3 WHERE id = ?1')
			.bind(id, publish.number, publish.branch)
			.run();
	const k = DELETABLE[kind];
	await logAdminAction(
		db,
		actor.locals,
		{
			action: `${k.action}.delete`,
			targetType: k.targetType,
			targetId: kind === 'calendario' ? slug : `${kind}/${slug}`,
			summary: `Borró ${k.the} «${files.title}» (${kind}/${slug})`,
			detail: {
				deletion: id,
				commit: commit.url,
				pr: publish?.number ?? null,
				media: files.media.length
			}
		},
		{ now }
	);
	return { id, publish, commit: commit.url };
}

/** Thrown when a deletion can't be undone (already undone, or unknown). */
export class UndoError extends Error {}

/**
 * @typedef {object} PullOps cómo consultar y cerrar el PR del borrado (null en mock/demo)
 * @prop {(token: string, number: number) => Promise<{status: string} | null>} status
 * @prop {(token: string, pull: {number: number, branch: string}) => Promise<void>} close
 */

/** Estados de un PR de contenido que todavía no se publicó (ver contentPulls.js). */
const UNPUBLISHED = new Set(['pendiente', 'fallo', 'conflicto', 'abierto']);

/**
 * Deshace un borrado: cierra el PR si no se publicó; si ya se publicó, lo restaura con otro PR.
 * @param {DeleteClient} client
 * @param {D1Database} db
 * @param {Actor} actor
 * @param {number} id
 * @param {{ pulls?: PullOps | null, now?: number }} [opts]
 * @returns {Promise<{ mode: 'cancelled' | 'restored', deletion: Deletion, publish: PublishResult | null, immediate?: boolean }>}
 *   `immediate`: ya está (un perfil de la base), no hay nada que publicar
 */
export async function undoDeletion(client, db, actor, id, { pulls = null, now = Date.now() } = {}) {
	const d = await getDeletion(db, id);
	if (!d) throw new UndoError('No encontramos ese borrado.');
	if (d.status !== 'borrado')
		throw new UndoError(
			d.status === 'deshecho' ? 'Ese borrado ya se deshizo.' : 'Esa publicación ya se recuperó.'
		);
	// Un perfil que vive solo en la base: se deshace en la base (sin GitHub).
	const profileId = dbProfileIdOf(d.path);
	if (profileId !== null) return undoDbProfileDeletion(db, actor, d, profileId, { now });

	const k = DELETABLE[d.kind];
	const targetId = d.kind === 'calendario' ? d.slug : `${d.kind}/${d.slug}`;

	if (pulls && d.prNumber && d.prBranch) {
		let state = (await pulls.status(actor.token, d.prNumber))?.status ?? 'publicado';
		if (UNPUBLISHED.has(state)) {
			try {
				await pulls.close(actor.token, { number: d.prNumber, branch: d.prBranch });
				state = 'cerrado';
			} catch (e) {
				// Se mergeó justo ahora (GitHub no deja cerrar un PR mergeado): se mira de nuevo.
				state = (await pulls.status(actor.token, d.prNumber))?.status ?? 'publicado';
				if (UNPUBLISHED.has(state)) throw e;
			}
		}
		if (state === 'cerrado') {
			await db
				.prepare(
					`UPDATE panel_deletions SET status = 'deshecho', restored_at = ?2, restored_by = ?3
					WHERE id = ?1 AND status = 'borrado'`
				)
				.bind(id, now, actor.login)
				.run();
			await logAdminAction(
				db,
				actor.locals,
				{
					action: `${k.action}.undelete`,
					targetType: k.targetType,
					targetId,
					summary: `Deshizo el borrado de «${d.title}» antes de que se publicara (PR #${d.prNumber} cerrado)`,
					detail: { deletion: id, pr: d.prNumber }
				},
				{ now }
			);
			return { mode: 'cancelled', deletion: { ...d, status: 'deshecho' }, publish: null };
		}
	}

	// Ya publicado (o sin PR): otro PR que vuelve a poner el .md y sus imágenes.
	/** @type {CommitFile[]} */
	const files = [
		{ path: d.path, content: d.content },
		...d.media.map((m) => ({ path: m.path, sha: m.sha }))
	];
	const commit = await client.commitFiles(actor.token, {
		files,
		message: message(actor.name, 'restored', d),
		mustNotExist: [d.path],
		pr: { action: 'recupera', title: d.title, who: actor.name, stack: false }
	});
	const publish = commit.pr ?? null;
	await db
		.prepare(
			`UPDATE panel_deletions SET status = 'recuperado', restored_at = ?2, restored_by = ?3,
				restore_pr = ?4 WHERE id = ?1 AND status = 'borrado'`
		)
		.bind(id, now, actor.login, publish?.number ?? null)
		.run();
	await logAdminAction(
		db,
		actor.locals,
		{
			action: `${k.action}.restore`,
			targetType: k.targetType,
			targetId,
			summary: `Recuperó ${k.the} «${d.title}» (${d.kind}/${d.slug})`,
			detail: { deletion: id, commit: commit.url, pr: publish?.number ?? null }
		},
		{ now }
	);
	return { mode: 'restored', deletion: { ...d, status: 'recuperado' }, publish };
}

/* ------------------------------------------------------------------------------------------ */
/*  Perfiles que viven solo en la base (sin .md en el repo)                                    */
/* ------------------------------------------------------------------------------------------ */

/**
 * `panel_deletions.path` de un perfil de la base: no es una ruta del repo (no hay .md), así
 * deshacer sabe que no tiene que ir a GitHub. `content` guarda solo el id y la versión.
 */
const DB_PROFILE_PATH = /^objeto:perfil:([1-9]\d*)$/;

/** @param {number} id */
export const dbProfilePath = (id) => `objeto:perfil:${id}`;

/**
 * El id del perfil de la base de un borrado, o `null` si es un .md del repo.
 * @param {string} path
 */
export function dbProfileIdOf(path) {
	const m = DB_PROFILE_PATH.exec(path);
	return m ? Number(m[1]) : null;
}

/**
 * @typedef {object} DbProfileDependents
 * @prop {number} personaOf eventos y publicaciones que lo nombran en «Personas con rol»
 * @prop {number} venueOf eventos que lo tienen como lugar («Sucede en»)
 * @prop {number} members perfiles que figuran como integrantes (si es un proyecto)
 * @prop {number} memberOf proyectos en los que figura como integrante
 * @prop {number} managers cuentas que lo gestionan
 */

/**
 * Lo que apunta a un perfil de la base. Las relaciones no se tocan al borrar (borrar es suave y
 * se deshace): quienes leen ya se saltean los perfiles borrados (`visibleWhere`, `getEdges`,
 * `eventVenue`). Esto es solo para avisar antes de borrar.
 *
 * @param {D1Database} db
 * @param {{ id: number, slug: string }} profile
 * @param {readonly { category: string, meta: Record<string, any> }[]} metas eventos y material
 *   del panel (contentMetas de content.js)
 * @returns {Promise<DbProfileDependents>}
 */
export async function dbProfileDependents(db, profile, metas) {
	const row = await db
		.prepare(
			`SELECT
				(SELECT count(*) FROM edges e JOIN objects o ON o.id = e.from_id
					WHERE e.to_id = ?1 AND e.kind = 'lugar' AND o.type = 'evento'
						AND o.deleted_at IS NULL) AS venue_of,
				(SELECT count(*) FROM edges e JOIN objects o ON o.id = e.from_id
					WHERE e.to_id = ?1 AND e.kind = ?2 AND o.deleted_at IS NULL) AS members,
				(SELECT count(*) FROM edges e JOIN objects o ON o.id = e.to_id
					WHERE e.from_id = ?1 AND e.kind = ?2 AND o.deleted_at IS NULL) AS member_of,
				(SELECT count(*) FROM profile_managers pm JOIN accounts a ON a.id = pm.account_id
					WHERE pm.profile_id = ?1 AND a.deleted_at IS NULL) AS managers`
		)
		.bind(profile.id, MEMBER_EDGE)
		.first();
	let personaOf = 0;
	for (const p of metas) {
		if (p.category !== 'calendario' && p.category !== 'material') continue;
		if (parsePersonas(p.meta?.personas).some((e) => e.perfil === profile.slug)) personaOf++;
	}
	return {
		personaOf,
		venueOf: Number(row?.venue_of ?? 0),
		members: Number(row?.members ?? 0),
		memberOf: Number(row?.member_of ?? 0),
		managers: Number(row?.managers ?? 0)
	};
}

/**
 * El plan de borrado de un perfil de la base: nada lo bloquea (se deshace); lo que depende de él
 * pide escribir la dirección para confirmar, como en los .md. Pura.
 *
 * @param {{ slug: string, dependents: DbProfileDependents }} input
 * @returns {DeletePlan}
 */
export function dbProfileDeletionPlan({ slug, dependents: d }) {
	/** @type {string[]} */
	const warnings = [];
	if (d.personaOf > 0)
		warnings.push(
			`Figura en «Personas con rol» de ${plural(d.personaOf, 'evento o publicación', 'eventos o publicaciones')}: ahí deja de aparecer.`
		);
	if (d.venueOf > 0)
		warnings.push(
			`Es el lugar de ${plural(d.venueOf, 'evento', 'eventos')}: ahí deja de aparecer, y la página y los mails de las entradas muestran el «Dónde» en texto libre del evento, si tiene.`
		);
	if (d.members > 0)
		warnings.push(
			`Tiene ${plural(d.members, 'integrante', 'integrantes')}: dejan de figurar en este proyecto.`
		);
	if (d.memberOf > 0)
		warnings.push(
			`Figura como integrante de ${plural(d.memberOf, 'proyecto', 'proyectos')}: deja de aparecer ahí.`
		);
	if (d.managers > 0)
		warnings.push(
			`Lo ${d.managers === 1 ? 'gestiona 1 cuenta' : `gestionan ${d.managers} cuentas`}: deja de verse en su Mi rincón.`
		);
	return {
		blockers: [],
		warnings,
		notes: [
			`La página /amigues/${slug} deja de existir enseguida.`,
			'Las relaciones (lugar de eventos, personas con rol, integrantes) quedan guardadas: si lo deshacés, vuelven.'
		],
		needsTyping: warnings.length > 0,
		alternative: ''
	};
}

/**
 * Borra (suave) un perfil que vive solo en la base: `deleted_at` con saveObject(), con la
 * revisión en el historial y la fila de `panel_deletions` (para «Deshacer» y «Recuperar» en
 * Actividad) en la MISMA tanda. Sin GitHub. Las relaciones quedan (para deshacer).
 *
 * @param {D1Database} db
 * @param {{ login: string, locals: Actor['locals'] }} actor
 * @param {{ id: number, version: number, title: string, urlSlug: string }} profile como se leyó
 *   (si alguien guardó en el medio, VersionConflictError y no se borra nada)
 * @param {{ now?: number }} [opts]
 * @returns {Promise<{ id: number, publish: null, commit: null }>}
 */
export async function deleteDbProfile(db, actor, profile, { now = Date.now() } = {}) {
	const path = dbProfilePath(profile.id);
	const content = JSON.stringify({ object: profile.id, version: profile.version + 1 });
	const sha = await gitBlobSha(content);
	await saveObject(
		db,
		{ id: profile.id, type: PROFILE_TYPE, version: profile.version, deleted: true },
		{
			actor: actor.login,
			now,
			also: (self) => [
				revisionStatement(db, self, 'panel'),
				db
					.prepare(
						`INSERT INTO panel_deletions
							(kind, slug, title, path, content, content_sha, media, status, deleted_at, deleted_by)
						VALUES ('amigues', ?1, ?2, ?3, ?4, ?5, '[]', 'borrado', ?6, ?7)`
					)
					.bind(profile.urlSlug, profile.title, path, content, sha, now, actor.login)
			]
		}
	);
	const row = await db
		.prepare(
			`SELECT id FROM panel_deletions WHERE path = ?1 AND status = 'borrado'
			ORDER BY id DESC LIMIT 1`
		)
		.bind(path)
		.first();
	const id = Number(row?.id);
	await logAdminAction(
		db,
		actor.locals,
		{
			action: 'profile.delete',
			targetType: 'profile',
			targetId: profile.id,
			summary: `Borró el perfil «${profile.title}» (amigues/${profile.urlSlug}, solo en la base)`,
			detail: { deletion: id }
		},
		{ now }
	);
	return { id, publish: null, commit: null };
}

/**
 * Deshace el borrado `id` de un perfil de la base (la ficha del perfil en Comunidad › Cuentas, que
 * no pasa por GitHub ni necesita su token). Mismas reglas que {@link undoDeletion}; un borrado del
 * repo es un error.
 *
 * @param {D1Database} db
 * @param {{ login: string, locals: Actor['locals'] }} actor
 * @param {number} id
 * @param {{ now?: number }} [opts]
 */
export async function undoDbProfileDeletionById(db, actor, id, opts) {
	const d = await getDeletion(db, id);
	if (!d) throw new UndoError('No encontramos ese borrado.');
	if (d.status !== 'borrado')
		throw new UndoError(
			d.status === 'deshecho' ? 'Ese borrado ya se deshizo.' : 'Ese perfil ya se recuperó.'
		);
	const profileId = dbProfileIdOf(d.path);
	if (profileId === null) throw new UndoError('Ese borrado no es de un perfil de la base.');
	return undoDbProfileDeletion(db, actor, d, profileId, opts);
}

/**
 * Deshace el borrado de un perfil de la base: `deleted_at` vuelve a NULL con saveObject() (con la
 * revisión y el estado del borrado en la misma tanda). Sus relaciones nunca se fueron.
 *
 * @param {D1Database} db
 * @param {{ login: string, locals: Actor['locals'] }} actor
 * @param {Deletion} d el borrado (status 'borrado')
 * @param {number} profileId
 * @param {{ now?: number }} [opts]
 * @returns {Promise<{ mode: 'restored', deletion: Deletion, publish: null, immediate: true }>}
 */
async function undoDbProfileDeletion(db, actor, d, profileId, { now = Date.now() } = {}) {
	const row = await db
		.prepare('SELECT type, version, deleted_at FROM objects WHERE id = ?1')
		.bind(profileId)
		.first();
	if (!row || row.type !== PROFILE_TYPE) throw new UndoError('Ese perfil ya no existe en la base.');
	if (row.deleted_at == null) {
		// Alguien lo recuperó por otro camino: el borrado queda cerrado, sin tocar el perfil.
		await db
			.prepare(
				`UPDATE panel_deletions SET status = 'recuperado', restored_at = ?2, restored_by = ?3
				WHERE id = ?1 AND status = 'borrado'`
			)
			.bind(d.id, now, actor.login)
			.run();
		throw new UndoError('Ese perfil ya estaba recuperado.');
	}
	try {
		await saveObject(
			db,
			{ id: profileId, type: PROFILE_TYPE, version: Number(row.version), deleted: false },
			{
				actor: actor.login,
				now,
				also: (self) => [
					revisionStatement(db, self, 'deshacer'),
					db
						.prepare(
							`UPDATE panel_deletions SET status = 'recuperado', restored_at = ?2, restored_by = ?3
							WHERE id = ?1 AND status = 'borrado'`
						)
						.bind(d.id, now, actor.login)
				]
			}
		);
	} catch (e) {
		if (e instanceof VersionConflictError)
			throw new UndoError('El perfil cambió mientras tanto. Recargá y probá de nuevo.');
		throw e;
	}
	await logAdminAction(
		db,
		actor.locals,
		{
			action: 'profile.restore',
			targetType: 'profile',
			targetId: profileId,
			summary: `Recuperó el perfil «${d.title}» (amigues/${d.slug}, solo en la base)`,
			detail: { deletion: d.id }
		},
		{ now }
	);
	return {
		mode: 'restored',
		deletion: { ...d, status: 'recuperado' },
		publish: null,
		immediate: true
	};
}
