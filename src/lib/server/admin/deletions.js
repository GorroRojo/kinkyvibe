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
 * Sin imports de SvelteKit: el cliente del repo, el estado de los PRs y la base llegan como
 * parámetros, así se prueba con fakes. Las rutas están en ./deletionRoutes.js.
 */
import { profileSlugFor } from '$lib/utils/organizers.js';
import { postFilePath } from '$lib/utils/postPaths.js';
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
		list: '/admin/material',
		page: '/material',
		targetType: 'post',
		action: 'material'
	},
	amigues: {
		one: 'perfil',
		the: 'el perfil',
		list: '/admin/amigues',
		page: '/amigues',
		targetType: 'post',
		action: 'amigues'
	}
});

/** @typedef {keyof typeof DELETABLE} DeletableKind */

/** @param {unknown} kind @returns {kind is DeletableKind} */
export const isDeletable = (kind) => typeof kind === 'string' && Object.hasOwn(DELETABLE, kind);

/**
 * Dónde vive lo que se borra. Hoy todo es un archivo del repo ('repo').
 *
 * COSTURA para los perfiles de la base (#137, interruptor `perfiles_publicos`): esta función
 * va a devolver 'objects' para `amigues` y ese borrado va a ir por saveObject({ deleted: true })
 * (borrado suave y recuperable de la capa de objetos, #124) en lugar de un PR. Falta el camino
 * de las rutas, deshacer y «Recuperar» para eso; mientras tanto el botón "Borrar" solo aparece
 * en el editor del .md (no en el de la base).
 * @param {DeletableKind} _kind
 * @returns {'repo' | 'objects'}
 */
export function deleteBackend(_kind) {
	return 'repo';
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
 * @returns {Promise<{ mode: 'cancelled' | 'restored', deletion: Deletion, publish: PublishResult | null }>}
 */
export async function undoDeletion(client, db, actor, id, { pulls = null, now = Date.now() } = {}) {
	const d = await getDeletion(db, id);
	if (!d) throw new UndoError('No encontramos ese borrado.');
	if (d.status !== 'borrado')
		throw new UndoError(
			d.status === 'deshecho' ? 'Ese borrado ya se deshizo.' : 'Esa publicación ya se recuperó.'
		);
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
