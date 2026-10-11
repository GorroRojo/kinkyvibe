/**
 * Server helpers for src/routes/(authed)/admin/eventos: authorization, the GitHub client (or its
 * dev mock) and the index of existing events.
 */
import { env } from '$env/dynamic/private';
import * as github from './github.js';
import { isAdmin } from '$lib/server/auth';
import { PREVIEW_BUILD } from '$lib/server/deploy.js';
import { parseEventDate, isNumericFeatured, AR_OFFSET } from '$lib/utils/eventDraft.js';
import { isMediaPath, isPublicMediaUrl } from '$lib/utils/media.js';
import {
	legacyAssetNames,
	legacyAssetURL,
	legacyMediaFolders,
	legacyNumberedURL
} from '$lib/utils/legacyMedia.js';

import { POSTS_DIR } from './images.js';

export { POSTS_DIR };

/**
 * The verified admin (see $lib/server/auth), or null. Form actions are NOT protected by the
 * layout's load, so every load/action on these pages calls this itself: loads use
 * `requireAdmin` (redirects), actions answer 403 with `fail` when this returns null.
 * @param {App.Locals} locals
 * @returns {{login: string, name: string, token: string} | null}
 */
export function getEventAdmin(locals) {
	const { user, user_token: token } = locals;
	if (!user || !token || !isAdmin(user)) return null;
	return { login: user.login, name: user.name || user.login, token };
}

/**
 * True only under `vite dev` with ADMIN_DEV_MOCK=1, i.e. `npm run dev:admin` (Vite mode "admin"
 * loads .env.admin). Always false in production builds.
 */
export function isMockMode() {
	return import.meta.env.DEV && env.ADMIN_DEV_MOCK === '1';
}

/**
 * True when the admin pages don't talk to GitHub: `npm run dev:admin` (the mock) or a preview
 * deploy (demo mode, $lib/server/demo). Then post files are read and saved through
 * getRepoClient() instead of the GitHub contents API.
 */
export function usesLocalRepo() {
	return isMockMode() || PREVIEW_BUILD;
}

/**
 * The GitHub client. Under `npm run dev:admin` (vite dev + ADMIN_DEV_MOCK=1) it returns a mock
 * that reads the local checkout and writes "commits" to a temp folder. `import.meta.env.DEV` is replaced by the literal
 * `false` in `vite build`, so the mock branch (and the mock module) is removed from production.
 * On a preview deploy (PREVIEW_BUILD, also a build-time constant) it returns the demo client:
 * "commits" go to the preview's D1 (`demo_files`), never to GitHub, whoever is logged in.
 * Whichever it is, it goes through withContentDb ($lib/server/contenido/repo.js): events,
 * material, amigues profiles and wiki pages are always read from and saved to the database; only
 * what still lives in the repo (images) reaches this client.
 * @returns {Promise<typeof github>}
 */
export async function getRepoClient() {
	const { withContentDb } = await import('../contenido/repo.js');
	if (import.meta.env.DEV && env.ADMIN_DEV_MOCK === '1') {
		// @ts-ignore
		return withContentDb({ ...github, ...(await import('./mock.js')) });
	}
	if (PREVIEW_BUILD) {
		const { client } = await import('../demo/index.js');
		return withContentDb(
			/** @type {typeof github} */ (/** @type {unknown} */ ({ ...github, ...client }))
		);
	}
	return withContentDb(github);
}

/* ------------------------------------------------------------------------------------------ */

/** Los archivos que había en src/lib/assets («serie.webp»), ordenados ($lib/utils/legacyMedia.js). */
export function assetNames() {
	return legacyAssetNames();
}

/**
 * URL of an event's featured image: the library image, or the copy in the library of the old
 * image (numbered in its media folder, or a file of src/lib/assets; $lib/utils/legacyMedia.js).
 * @param {string} slug
 * @param {string|number|undefined} featured
 */
export function featuredURL(slug, featured) {
	if (featured === undefined || featured === null || featured === '') return undefined;
	if (isMediaPath(featured) || isPublicMediaUrl(featured)) return String(featured);
	if (isNumericFeatured(featured)) return legacyNumberedURL('calendario', slug, featured);
	return legacyAssetURL(String(featured));
}

/**
 * @typedef {object} EventSummary
 * @prop {string} slug
 * @prop {string} title
 * @prop {string} start
 * @prop {string} end
 * @prop {string} status
 * @prop {string} location
 * @prop {boolean} unlisted
 * @prop {boolean} unpublished
 * @prop {boolean} [draft] borrador de la agenda (`borrador: true`, ver drafts.js)
 * @prop {string} [thumb]
 */

/** @param {any} v */
function siteDate(v) {
	const { date, time } = parseEventDate(v);
	return date ? `${date}T${time || '00:00'}${AR_OFFSET}` : '';
}

/**
 * Los eventos de la base (también los ocultos, que el panel ve; no los borrados), newest first.
 * @returns {Promise<EventSummary[]>}
 */
export async function listEvents() {
	const { activeContentDB, allDbEventObjects } = await import('../contenido/repo.js');
	const { eventToMeta } = await import('../contenido/eventos.js');
	const { imageKeysByObject } = await import('../media/library.js');
	const db = activeContentDB();
	if (!db) return [];
	// La imagen de la biblioteca de cada evento (edge `portada`), si tiene; si no, la del repo.
	const covers = await imageKeysByObject(db, 'evento', 'portada').catch(() => new Map());
	/** @type {EventSummary[]} */
	const events = [];
	// Solo la metadata: sin armar el texto de cada evento.
	for (const [slug, e] of await allDbEventObjects(db)) {
		if (e.deleted) continue;
		const meta = eventToMeta(e.object);
		const cover = covers.get(e.object.id);
		events.push(summarize(slug, cover ? { ...meta, featured: `/media/${cover}` } : meta));
	}
	return events.sort((a, b) => (b.start || '').localeCompare(a.start || ''));
}

/**
 * @param {string} slug
 * @param {any} meta
 * @returns {EventSummary}
 */
function summarize(slug, meta) {
	return {
		slug,
		title: String(meta.title ?? slug),
		start: siteDate(meta.start),
		end: siteDate(meta.end),
		status: String(meta.status ?? ''),
		location: String(meta.location ?? ''),
		unlisted: meta.force_unlisted === true,
		unpublished: meta.force_unpublished === true,
		draft: meta.borrador === true,
		thumb: featuredURL(slug, meta.featured)
	};
}

/**
 * Direcciones que un evento nuevo no puede usar aunque la base no las tenga: las de las carpetas de
 * medios viejas (sus imágenes siguen en la biblioteca con ese nombre: un evento nuevo con esa
 * dirección heredaría la imagen numerada de otro).
 */
export function takenSlugsInBundle() {
	return legacyMediaFolders('calendario');
}
