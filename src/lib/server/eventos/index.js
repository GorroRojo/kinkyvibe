/**
 * Server helpers for src/routes/(authed)/admin/eventos: authorization, the GitHub client (or its
 * dev mock) and the index of existing events.
 */
import { env } from '$env/dynamic/private';
import * as github from './github.js';
import { isAdmin } from '$lib/server/auth';
import { PREVIEW_BUILD } from '$lib/server/deploy.js';
import { parseEventDate, isNumericFeatured, AR_OFFSET } from '$lib/utils/eventDraft.js';

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
 * Whichever it is, it goes through withContentDb ($lib/server/contenido/repo.js): with the
 * `contenido_db` switch on, the events stored in the database are read and saved there.
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

/** @type {Promise<EventSummary[]> | undefined} */
let cache;

/**
 * Events included in this deploy, newest first.
 * @returns {Promise<EventSummary[]>}
 */
export async function listEvents() {
	if (!cache || import.meta.env.DEV) cache = loadEvents();
	const events = PREVIEW_BUILD ? await withDemoEvents(await cache) : await cache;
	return withDbEvents(events);
}

/**
 * Interruptor `contenido_db`: los eventos que están en la base (también los ocultos y borrados,
 * que el panel ve) en lugar de su .md, y los que solo están en la base.
 * @param {EventSummary[]} events
 */
async function withDbEvents(events) {
	const { activeContentDB, allDbEvents } = await import('../contenido/repo.js');
	const { eventToMeta } = await import('../contenido/eventos.js');
	const db = await activeContentDB();
	if (!db) return events;
	const fromDb = await allDbEvents(db);
	if (!fromDb.size) return events;
	const bySlug = new Map(events.map((e) => [e.slug, e]));
	for (const [slug, e] of fromDb) {
		if (e.deleted) bySlug.delete(slug);
		else bySlug.set(slug, summarize(slug, eventToMeta(e.object)));
	}
	return [...bySlug.values()].sort((a, b) => (b.start || '').localeCompare(a.start || ''));
}

/**
 * Demo mode: the events of the deploy with what the demo layer created, edited or deleted.
 * @param {EventSummary[]} events
 */
async function withDemoEvents(events) {
	const { overlayPostMetas } = await import('../demo/index.js');
	const changed = await overlayPostMetas('calendario');
	if (!changed.length) return events;
	const bySlug = new Map(events.map((e) => [e.slug, e]));
	for (const { slug, meta } of changed) {
		if (meta) bySlug.set(slug, summarize(slug, meta));
		else bySlug.delete(slug);
	}
	return [...bySlug.values()].sort((a, b) => (b.start || '').localeCompare(a.start || ''));
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

async function loadEvents() {
	/** @type {EventSummary[]} */
	const events = [];
	for (const [path, load] of Object.entries(mdModules)) {
		const slug = path.split('/').pop()?.replace(/\.md$/, '') ?? '';
		if (!slug || slug.startsWith('_')) continue;
		/** @type {any} */
		let meta;
		try {
			meta = await load();
		} catch (e) {
			continue;
		}
		if (!meta) continue;
		events.push(summarize(slug, meta));
	}
	events.sort((a, b) => (b.start || '').localeCompare(a.start || ''));
	return events;
}

/** Slugs taken in this deploy: event files and media folders. */
export function takenSlugsInBundle() {
	const slugs = new Set();
	for (const path of Object.keys(mdModules)) slugs.add(path.split('/').pop()?.replace(/\.md$/, ''));
	for (const path of Object.keys(mediaFiles)) slugs.add(path.split('/').slice(-2)[0]);
	return [...slugs];
}
