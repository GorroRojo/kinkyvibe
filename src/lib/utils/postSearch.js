/**
 * Pure helpers for the PostList search (tag picker + free text).
 * Kept free of Svelte/SvelteKit imports so they can be unit tested.
 */

/**
 * Lowercases and strips diacritics so "Córdoba" matches "cordoba".
 * @param {*} s
 * @returns {string}
 */
export function normalizeText(s) {
	return (s ?? '').toString().normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

/**
 * Resolves an alias (or unknown id) to its canonical tag id.
 * @param {TagManager} tm
 * @param {string} id
 * @returns {string}
 */
export function canonicalTag(tm, id) {
	return tm.get(id)?.id ?? id;
}

/**
 * Canonical ids of a post's tags plus all their ancestors.
 * @param {TagManager} tm
 * @param {string[]} tags
 * @returns {Set<string>}
 */
export function expandTags(tm, tags = []) {
	const res = new Set();
	for (const t of tags) {
		const tag = tm.get(t);
		const id = tag?.id ?? t;
		res.add(id);
		for (const p of tag?.getAllParents?.() ?? []) res.add(canonicalTag(tm, p));
	}
	res.delete('root');
	return res;
}

/**
 * @param {TagManager} tm
 * @param {*} post
 * @returns {string}
 */
function haystack(tm, post) {
	const meta = post?.meta ?? {};
	return normalizeText(
		[
			meta.title,
			meta.summary,
			...(meta.authors ?? []),
			...(meta.tags ?? []).map((/**@type string*/ t) => tm.get(t)?.visible_name ?? t)
		].join(' ')
	);
}

/**
 * Filters posts by selected tags (AND, hierarchy-aware, alias-aware) and
 * free text (every word must appear in title, summary, authors or tag names).
 * @template {{meta: {tags?: string[], title?: string, summary?: string, authors?: string[]}}} P
 * @param {P[]} posts
 * @param {{tags?: string[], text?: string}} search
 * @param {TagManager} tm
 * @returns {P[]}
 */
export function filterPosts(posts, { tags = [], text = '' }, tm) {
	const wanted = [...new Set(tags.map((t) => canonicalTag(tm, t)))];
	const words = normalizeText(text).split(/\s+/).filter(Boolean);
	if (wanted.length == 0 && words.length == 0) return posts;
	return posts.filter((post) => {
		if (wanted.length > 0) {
			const expanded = expandTags(tm, post.meta?.tags);
			if (!wanted.every((t) => expanded.has(t))) return false;
		}
		if (words.length > 0) {
			const hay = haystack(tm, post);
			if (!words.every((w) => hay.includes(w))) return false;
		}
		return true;
	});
}

/**
 * Map of canonical tag id -> alias names (from `aka` and `aliasOf` entries).
 * @param {TagManager} tm
 * @returns {Map<string, string[]>}
 */
export function aliasIndex(tm) {
	/** @type {Map<string, string[]>} */
	const res = new Map();
	const add = (/**@type string*/ id, /**@type string*/ alias) => {
		const list = res.get(id) ?? [];
		if (alias != id && !list.includes(alias)) list.push(alias);
		res.set(id, list);
	};
	for (const [id, tag] of tm.entries()) {
		if (tag?.aliasOf) add(tag.aliasOf, id);
		for (const a of tag?.aka ?? []) add(id, a);
	}
	return res;
}

/**
 * @typedef {Object} TagSuggestion
 * @prop {string} id canonical tag id
 * @prop {string} name visible name
 * @prop {number} count posts (among the current tag-filtered ones) that would remain
 * @prop {string} [alias] alias that matched the query, when it wasn't the name
 * @prop {number} score lower is better
 */

/**
 * Tags present in `posts` (including ancestors of their tags), with counts,
 * matching `text` by name or alias, ordered by relevance.
 * `posts` should already be filtered by the currently selected tags.
 * @param {Array<{meta: {tags?: string[]}}>} posts
 * @param {{selected?: string[], text?: string, limit?: number, aliases?: Map<string,string[]>}} opts
 * @param {TagManager} tm
 * @returns {TagSuggestion[]}
 */
export function suggestTags(posts, { selected = [], text = '', limit = 12, aliases }, tm) {
	const sel = new Set(selected.map((t) => canonicalTag(tm, t)));
	/** @type {Map<string, number>} */
	const counts = new Map();
	for (const post of posts) {
		for (const id of expandTags(tm, post.meta?.tags)) {
			counts.set(id, (counts.get(id) ?? 0) + 1);
		}
	}
	const q = normalizeText(text);
	const aliasMap = aliases ?? aliasIndex(tm);
	/** @type {TagSuggestion[]} */
	const res = [];
	for (const [id, count] of counts) {
		if (sel.has(id)) continue;
		// A tag every post already has would not narrow anything down.
		if (posts.length > 1 && count == posts.length) continue;
		const name = tm.get(id)?.visible_name ?? id;
		if (q == '') {
			// Without a query, specific tags go first and broad groups
			// (lugar, idioma, tipo de material...) last.
			const tag = tm.get(id);
			const score = tag?.parents?.includes('root') ? 1 : tag?.children?.length ? 0.5 : 0;
			res.push({ id, name, count, score });
			continue;
		}
		let best = Infinity;
		/** @type {string|undefined} */
		let alias;
		for (const candidate of [name, id, ...(aliasMap.get(id) ?? [])]) {
			const n = normalizeText(candidate);
			let score = Infinity;
			if (n == q) score = 0;
			else if (n.startsWith(q)) score = 1;
			else if (n.split(/[\s/\-]+/).some((w) => w.startsWith(q))) score = 2;
			else if (n.includes(q)) score = 3;
			// aliases rank slightly below the tag's own name
			if (candidate != name && candidate != id) score += 0.5;
			if (score < best) {
				best = score;
				alias = candidate != name && candidate != id ? candidate : undefined;
			}
		}
		if (best < Infinity) res.push({ id, name, count, alias, score: best });
	}
	res.sort((a, b) => a.score - b.score || b.count - a.count || a.name.localeCompare(b.name, 'es'));
	return res.slice(0, limit);
}

/**
 * Reads `?tags=a,b&q=texto` (param names configurable) from a URL.
 * @param {URL} url
 * @param {{tags?: string, q?: string}} [names]
 * @returns {{tags: string[], text: string}}
 */
export function readSearchParams(url, names = {}) {
	const { tags = 'tags', q = 'q' } = names;
	return {
		tags: (url.searchParams.get(tags) ?? '')
			.split(',')
			.map((t) => t.trim())
			.filter(Boolean),
		text: url.searchParams.get(q) ?? ''
	};
}

/**
 * Returns a copy of `url` with the search state written into it
 * (empty values remove the param).
 * @param {URL} url
 * @param {{tags: string[], text: string}} state
 * @param {{tags?: string, q?: string}} [names]
 * @returns {URL}
 */
export function writeSearchParams(url, { tags, text }, names = {}) {
	const { tags: tagsName = 'tags', q = 'q' } = names;
	const next = new URL(url);
	if (tags.length > 0) next.searchParams.set(tagsName, tags.join(','));
	else next.searchParams.delete(tagsName);
	if (text.trim() != '') next.searchParams.set(q, text);
	else next.searchParams.delete(q);
	// keep the list readable: ?tags=a,b instead of ?tags=a%2Cb
	next.search = next.search.replace(/%2C/gi, ',');
	return next;
}
