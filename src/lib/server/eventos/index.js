/**
 * Server helpers for src/routes/(authed)/admin/eventos: authorization, the GitHub client (or its
 * dev mock) and the index of existing events.
 */
import { env } from '$env/dynamic/private';
import * as github from './github.js';
import { isAdmin } from '$lib/server/auth';
import { PREVIEW_BUILD } from '$lib/server/deploy.js';
import { parseEventDate, isNumericFeatured, AR_OFFSET } from '$lib/utils/eventDraft.js';
import { isMediaPath } from '$lib/utils/media.js';

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
 * True when the admin pages don't talk to GitHub: `npm run dev:admin` (the mock) or a Cloudflare
 * Pages preview (demo mode, $lib/server/demo). Then post files are read and saved through
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
 * Whichever it is, it goes through withContentDb ($lib/server/contenido/repo.js): events and
 * material are always read from and saved to the database; only what still lives in the repo
 * (images, amigues .md, the wiki) reaches this client.
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

/** Los .md de eventos del repo (solo sus nombres: ver {@link takenSlugsInBundle}). */
const mdModules = import.meta.glob('/src/lib/posts/calendario/*.md', { import: 'metadata' });
/** @type {Record<string, string>} */
const mediaFiles = import.meta.glob(
	'/src/lib/posts/calendario/media/*/*.{jpeg,jfif,jpg,png,webp}',
	{
		eager: true,
		import: 'default'
	}
);
/** @type {Record<string, string>} */
const assetFiles = import.meta.glob('/src/lib/assets/*.{jpeg,jfif,jpg,png,webp}', {
	eager: true,
	import: 'default'
});

/** Los archivos de src/lib/assets de este deploy («serie.webp»), ordenados. */
export function assetNames() {
	return Object.keys(assetFiles)
		.map((p) => p.slice(p.lastIndexOf('/') + 1))
		.sort((a, b) => a.localeCompare(b));
}

/** Same lookup order as thumbURL in $lib/utils. */
const FORMATS = ['jpeg', 'jfif', 'jpg', 'png', 'webp'];

/**
 * URL of an event's featured image, as bundled in this deploy.
 * @param {string} slug
 * @param {string|number|undefined} featured
 */
export function featuredURL(slug, featured) {
	if (featured === undefined || featured === null || featured === '') return undefined;
	if (isMediaPath(featured)) return String(featured);
	if (isNumericFeatured(featured)) {
		for (const f of FORMATS) {
			const url = mediaFiles[`/src/lib/posts/calendario/media/${slug}/${featured}.${f}`];
			if (url) return url;
		}
		return undefined;
	}
	return assetFiles[`/src/lib/assets/${featured}`];
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
		thumb: featuredURL(slug, meta.featured)
	};
}

/**
 * Slugs taken in this deploy: event files (the .md kept in the repo as a backup: their address is
 * not reused) and media folders.
 */
export function takenSlugsInBundle() {
	const slugs = new Set();
	for (const path of Object.keys(mdModules)) slugs.add(path.split('/').pop()?.replace(/\.md$/, ''));
	for (const path of Object.keys(mediaFiles)) slugs.add(path.split('/').slice(-2)[0]);
	return [...slugs];
}
