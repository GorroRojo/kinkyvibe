/**
 * Server helpers for src/routes/(authed)/admin/eventos: authorization, the GitHub client (or its
 * dev mock) and the index of existing events.
 */
import { env } from '$env/dynamic/private';
import * as github from './github.js';
import { isAdmin } from '$lib/server/auth';
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
 * The GitHub client. Under `npm run dev:admin` (vite dev + ADMIN_DEV_MOCK=1) it returns a mock
 * that reads the local checkout and writes "commits" to a temp folder. `import.meta.env.DEV` is replaced by the literal
 * `false` in `vite build`, so the mock branch (and the mock module) is removed from production.
 * @returns {Promise<typeof github>}
 */
export async function getRepoClient() {
	if (import.meta.env.DEV && env.ADMIN_DEV_MOCK === '1') {
		// @ts-ignore
		return await import('./mock.js');
	}
	return github;
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
export function listEvents() {
	if (!cache || import.meta.env.DEV) cache = loadEvents();
	return cache;
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
		events.push({
			slug,
			title: String(meta.title ?? slug),
			start: siteDate(meta.start),
			end: siteDate(meta.end),
			status: String(meta.status ?? ''),
			location: String(meta.location ?? ''),
			unlisted: meta.force_unlisted === true,
			unpublished: meta.force_unpublished === true,
			thumb: featuredURL(slug, meta.featured)
		});
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
