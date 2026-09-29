// @ts-nocheck -- test code: loose fixtures, no need for strict JSDoc types
// Content integrity checks for src/lib/posts/**.md
//
// Pure Node code (fs + yaml) so it doesn't depend on SvelteKit internals.
// Each problem is reported as a stable string "<category>/<slug>: <code>: <detail>"
// so it can be stored in an allowlist (content-known-issues.json).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';

const here = path.dirname(fileURLToPath(import.meta.url));
export const POSTS_DIR = path.resolve(here, '../lib/posts');
export const ASSETS_DIR = path.resolve(here, '../lib/assets');
export const CATEGORIES = ['amigues', 'calendario', 'material', 'wiki'];
// Same list thumbURL() in src/lib/utils/index.js tries for numeric ids.
export const MEDIA_FORMATS = ['jpeg', 'jfif', 'jpg', 'png', 'webp'];
export const ALLOWED_STATUS = ['anunciado', 'abierto', 'agotadas', 'cancelado'];
const IMAGE_FIELDS = ['featured', 'photo', 'logo'];
const DATE_FIELDS = ['published_date', 'updated_date', 'opening_date', 'start', 'end'];

/**
 * @returns {{category: string, slug: string, file: string, source: string}[]}
 */
export function listPosts() {
	const posts = [];
	for (const category of CATEGORIES) {
		const dir = path.join(POSTS_DIR, category);
		for (const file of fs.readdirSync(dir).sort()) {
			if (!file.endsWith('.md') || file.startsWith('_')) continue;
			posts.push({
				category,
				slug: file.slice(0, -3),
				file: path.join(dir, file),
				source: fs.readFileSync(path.join(dir, file), 'utf8')
			});
		}
	}
	return posts;
}

/** @param {string} source */
export function extractFrontmatter(source) {
	const m = source.match(/^---\r?\n([\s\S]*?)\r?\n---\s*(\r?\n|$)/);
	return m ? m[1] : undefined;
}

/** A date string/Date that `new Date()` understands. */
function isValidDate(v) {
	if (v instanceof Date) return !isNaN(v.getTime());
	if (typeof v !== 'string' && typeof v !== 'number') return false;
	return !isNaN(new Date(String(v)).getTime());
}

/** Has an explicit UTC offset ("Z", "-03:00", "+0100") and a time component. */
function hasExplicitOffset(v) {
	return typeof v === 'string' && /T\d\d:\d\d(:\d\d(\.\d+)?)?(Z|[+-]\d\d:?\d\d)$/.test(v.trim());
}

/**
 * @param {string} category
 * @param {string} slug
 * @param {string|number} id
 */
export function imageResolves(category, slug, id) {
	const s = String(id);
	if (/^\d+$/.test(s)) {
		return MEDIA_FORMATS.some((ext) =>
			fs.existsSync(path.join(POSTS_DIR, category, 'media', slug, `${s}.${ext}`))
		);
	}
	return fs.existsSync(path.join(ASSETS_DIR, s));
}

/**
 * Runs every check and returns the list of problems.
 * @returns {{issues: string[], parsed: {category: string, slug: string, data: any}[]}}
 */
export function checkContent() {
	const posts = listPosts();
	const profiles = new Set(
		posts.filter((p) => p.category === 'amigues').map((p) => p.slug)
	);
	/** @type {string[]} */
	const issues = [];
	const parsed = [];
	for (const { category, slug, source } of posts) {
		const id = `${category}/${slug}`;
		const add = (/** @type {string} */ code, detail = '') =>
			issues.push(`${id}: ${code}${detail ? ': ' + detail : ''}`);

		const fm = extractFrontmatter(source);
		if (fm === undefined) {
			add('missing-frontmatter');
			continue;
		}
		let data;
		try {
			const doc = YAML.parseDocument(fm);
			if (doc.errors.length > 0) {
				// mdsvex parses frontmatter with the lenient js-yaml, so some of these still
				// render today; flag them anyway (a stricter parser or a CMS may choke on them)
				// and keep checking the recovered data.
				add('invalid-yaml', String(doc.errors[0].message).split('\n')[0]);
			}
			data = doc.toJS();
		} catch (e) {
			add('invalid-yaml', String(e.message).split('\n')[0]);
			continue;
		}
		if (!data || typeof data !== 'object') {
			add('empty-frontmatter');
			continue;
		}
		parsed.push({ category, slug, data });

		for (const field of ['title', 'category', 'layout']) {
			if (data[field] === undefined || data[field] === null || data[field] === '')
				add('missing-field', field);
		}
		if (data.category !== undefined && data.category !== category)
			add('category-mismatch', `${data.category} (folder: ${category})`);
		if (data.layout !== undefined && data.layout !== category)
			add('layout-mismatch', `${data.layout} (folder: ${category})`);

		for (const field of DATE_FIELDS) {
			if (data[field] !== undefined && data[field] !== null && !isValidDate(data[field]))
				add('invalid-date', `${field}=${JSON.stringify(data[field])}`);
		}

		// Listed posts show up in /sitemap.xml, /rss and the lists, which need a date.
		if (category !== 'wiki' && !data.force_unlisted && !data.force_unpublished) {
			if (!isValidDate(data.updated_date ?? data.published_date))
				add('listed-without-date', 'needs published_date or updated_date');
		}

		if (category === 'calendario') {
			if (data.start === undefined || data.start === null) {
				add('missing-field', 'start');
			} else if (!isValidDate(data.start)) {
				// already reported as invalid-date
			} else if (!hasExplicitOffset(data.start)) {
				add('start-without-offset', JSON.stringify(data.start));
			}
			if (data.end !== undefined && data.end !== null) {
				if (isValidDate(data.end) && !hasExplicitOffset(data.end))
					add('end-without-offset', JSON.stringify(data.end));
				if (
					isValidDate(data.start) &&
					isValidDate(data.end) &&
					new Date(String(data.end)).getTime() < new Date(String(data.start)).getTime()
				)
					add('end-before-start', `${data.start} > ${data.end}`);
			}
			if (data.status !== undefined && !ALLOWED_STATUS.includes(data.status))
				add('invalid-status', JSON.stringify(data.status));
		}

		for (const field of IMAGE_FIELDS) {
			const v = data[field];
			if (v === undefined || v === null || v === '') continue;
			if (!imageResolves(category, slug, v)) add('missing-image', `${field}=${v}`);
		}

		if (data.authors !== undefined && data.authors !== null) {
			if (!Array.isArray(data.authors)) {
				add('authors-not-a-list', JSON.stringify(data.authors));
			} else {
				for (const author of data.authors) {
					// Same normalization as fetchPost() in src/lib/utils/index.js
					const authorID = String(author).replaceAll(' ', '-');
					if (authorID !== slug && !profiles.has(authorID))
						add('unknown-author', String(author));
				}
			}
		}

		if (data.tags !== undefined && data.tags !== null) {
			if (!Array.isArray(data.tags)) add('tags-not-a-list', JSON.stringify(data.tags));
			else if (data.tags.some((t) => typeof t !== 'string' && typeof t !== 'number'))
				add('tags-invalid-entry', JSON.stringify(data.tags));
		}
	}
	return { issues, parsed };
}
