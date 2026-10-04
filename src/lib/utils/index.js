import '$lib/types.d.js';
import { dev } from '$app/environment';
import { isCurrent, relatedPostsFor } from './allPosts';
import { addMentionPronouns, pronounLabel } from './mentions';
import { currentSiteTags, fileSiteTags, siteTagsFromDb } from './siteTags.js';
import { error } from '@sveltejs/kit';
import { isMediaPath } from './media.js';

export { relatedPostsFor };

/**Calls fn for the group and every subgroup and returns the resulting group.
 * @param {Group} group
 * @param {(group: Group)=>Group|false} fn
 * @returns {any}
 */
export function groupMap(group, fn) {
	let mappedSubs = [];
	let mappedGroup = fn(group);
	if (mappedGroup === false) return false;
	if (group.sub && group.sub.length > 0) {
		for (const sub of group.sub) {
			const neoSub = groupMap(sub, fn);
			if (neoSub != false) mappedSubs.push(neoSub);
		}
		return {
			...mappedGroup,
			sub: mappedSubs,
			members: mappedGroup.members ?? []
		};
	} else {
		return { ...mappedGroup, members: mappedGroup.members ?? [], sub: [] };
	}
}

// Image URLs are resolved from eager globs (a plain path -> URL map) instead of
// probing up to five `import()`s per image: no async round trips, and no
// wrapper JS chunk per image in the client build.
/** @type {Record<string, string>} */
const mediaURLs = import.meta.glob('../posts/*/media/*/*.{jpeg,jfif,jpg,png,webp}', {
	eager: true,
	import: 'default'
});
/** @type {Record<string, string>} */
const assetURLs = import.meta.glob('../assets/*.*', { eager: true, import: 'default' });

/**
 * @param {"calendario"|"amigues"|"material"|"wiki"} category
 * @param {string} postID
 * @param {string} assetID
 */
export const thumbURL = async (category, postID, assetID) => {
	// Una imagen de la biblioteca (R2, docs/imagenes.md): ya es su dirección.
	if (isMediaPath(assetID)) return String(assetID);
	//check if string is an integer
	let formats = ['jpeg', 'jfif', 'jpg', 'png', 'webp'];
	if (('' + assetID).match(/^\d+$/)) {
		for (const format of formats) {
			const url = mediaURLs[`../posts/${category}/media/${postID}/${assetID}.${format}`];
			if (url !== undefined) return url;
		}
		return undefined;
	} else {
		let [filename, format] = assetID.split('.');
		return assetURLs[`../assets/${filename}.${format}`];
	}
};

/**
 * URL of a file in a post's media folder, by file name ("5.webp", "spoiler.webp"), or undefined.
 * Used by profile bodies stored in the database (their mdsvex image imports name the file).
 * @param {"calendario"|"amigues"|"material"|"wiki"} category
 * @param {string} postID
 * @param {string} file
 * @returns {string|undefined}
 */
export const mediaURL = (category, postID, file) =>
	/^[\w.-]+$/.test(file) ? mediaURLs[`../posts/${category}/media/${postID}/${file}`] : undefined;

/**
 * @param {TagManager} [tagManager] por defecto, el árbol en uso (archivo o base, siteTags.js)
 * @returns {(tag: string)=>string}
 */
export function aliaserFactory(tagManager = currentSiteTags()) {
	return (tag) => tagManager.get(tag)?.id ?? tag;
}

/**
 * Fetches a post from the specified category and post id.
 *
 * @param {"calendario"|"amigues"|"material"|"wiki"} category - The category of the post.
 * @param {string} postID - The id of the post.
 * @param {boolean} [shallow=false]
 * @return {Promise<ProcessedPost>} - The content and metadata of the post.
 */
export const fetchPost = async (category, postID, shallow = false) => {
	// templates (_*.md) are not posts
	if (postID.startsWith('_')) throw error(404, 'Not found');
	let postContent, meta;
	try {
		({ default: postContent, metadata: meta } = await import(`../posts/${category}/${postID}.md`));
	} catch (e) {
		throw error(404, 'Not found');
	}
	if (!meta || meta.force_unpublished) throw error(404, 'Not found');
	return await processPost(postContent, postID, meta, shallow);
};

/**
 * Processes a post and returns relevant information. Exported for the posts stored in the
 * database ($lib/server/contenido/posts.js), so they become the same ProcessedPost as a .md.
 *
 * @param {ConstructorOfATypedSvelteComponent|undefined} postContent - The content of the post.
 * @param {string} postID - The ID of the post.
 * @param {AnyPostData} meta - The metadata associated with the post.
 * @param {boolean} [shallow=false] - Indicates whether to perform a shallow processing.
 * @param {TagManager} [tagManager] - The tag manager to use.
 * @return {Promise<ProcessedPost>} An object containing the processed post information.
 */
export async function processPost(
	postContent,
	postID,
	meta,
	shallow = false,
	tagManager = currentSiteTags()
) {
	let authorsProfiles = [];
	/**@type {ProcessedPost[]} */
	if (!shallow) {
		for (const author of meta?.authors ?? []) {
			const authorID = author.replaceAll(' ', '-');
			if (authorID !== postID) {
				try {
					const authorProfile = await fetchPost('amigues', authorID, true);
					authorsProfiles.push(authorProfile);
				} catch (e) {
					continue;
				}
			}
		}
	}

	const processedMeta = {
		...meta,
		tags: canonicalTags(meta.tags ?? [], tagManager),
		featured:
			meta.featured !== undefined
				? await thumbURL(meta.category, postID, meta.featured)
				: undefined,
		photo: meta.photo !== undefined ? await thumbURL(meta.category, postID, meta.photo) : undefined,
		logo: meta.logo !== undefined ? await thumbURL(meta.category, postID, meta.logo) : undefined,
		postID
	};
	writtenTags.set(processedMeta, [...(meta.tags ?? [])]);
	const processedPost = {
		content: shallow ? undefined : postContent,
		meta: processedMeta,
		authorsProfiles,
		path: '/' + meta.category + '/' + postID
	};
	return processedPost;
}

/**
 * Tags as the site shows them: each alias resolved to its tag id, sorted like the tag tree.
 * Shared by the .md posts and the profiles stored in the database. By default, the tag tree in
 * use (the database; the file only as a fallback: $lib/utils/siteTags.js).
 * @param {readonly string[]} tags
 * @param {TagManager} [tagManager]
 * @returns {string[]}
 */
export function canonicalTags(tags, tagManager = currentSiteTags()) {
	const sortTags = cachedTagSorter(tagManager);
	return [...tags]
		.map((t) => tagManager.get(t))
		.sort(sortTags)
		.map((t) => t.id);
}

/**
 * The tags each processed post had in its file (before canonicalTags), so the cached list can be
 * re-tagged with another tag tree without reading the posts again.
 * @type {WeakMap<object, string[]>}
 */
const writtenTags = new WeakMap();

/**
 * The same posts with their tags cleaned up with `tagManager` (new post and meta objects; the
 * rest is shared).
 * @param {readonly ProcessedPost[]} posts
 * @param {TagManager} tagManager
 * @returns {ProcessedPost[]}
 */
export function retagPosts(posts, tagManager) {
	return posts.map((p) => {
		const written = writtenTags.get(p.meta) ?? p.meta.tags ?? [];
		const meta = { ...p.meta, tags: canonicalTags(written, tagManager) };
		writtenTags.set(meta, written);
		return { ...p, meta };
	});
}

/** @type {WeakMap<TagManager, (a: ProcessedTag, b: ProcessedTag) => number>} */
const tagSorterCache = new WeakMap();
/** @param {TagManager} tagManager */
function cachedTagSorter(tagManager) {
	let sorter = tagSorterCache.get(tagManager);
	if (!sorter) {
		sorter = tagSorter(tagManager);
		tagSorterCache.set(tagManager, sorter);
	}
	return sorter;
}

/**
 * @param {TagManager} tagManager
 */
export function tagSorter(tagManager) {
	/** @type {Map<string, string[][]>} */
	const ancestryCache = new Map();
	/** @type {Map<string, number>} */
	const tagIndex = new Map();
	tagManager.tagIDs().forEach((id, i) => {
		if (!tagIndex.has(id)) tagIndex.set(id, i);
	});
	/**
	 * @param {ProcessedTag} tag
	 * @return {string[][]}
	 */
	const ancestry = (tag) => {
		const cached = ancestryCache.get(tag.id);
		if (cached) return cached;
		let branches = [];
		let tagParents = tag.parents?.filter((p) => p != 'root') ?? [];
		for (let p of tagParents) {
			let subbranch = [];
			let grandparents = ancestry(tagManager.get(p));
			if (grandparents.length > 0) {
				for (let g of grandparents) {
					subbranch.push([...g, p]);
				}
			} else {
				subbranch.push([p]);
			}
			branches.push(...subbranch);
		}
		ancestryCache.set(tag.id, branches);
		return branches;
	};
	/**
	 * @param {ProcessedTag} a
	 * @param {ProcessedTag} b
	 * @returns {number}
	 */
	function sortTags(a, b) {
		let aAncestry = ancestry(a).map((br) => [...br.flat(), a.id]);
		let bAncestry = ancestry(b).map((br) => [...br.flat(), b.id]);
		if (aAncestry.length == 0) aAncestry = [[a.id]];
		if (bAncestry.length == 0) bAncestry = [[b.id]];
		return (tagIndex.get(aAncestry[0][0]) ?? -1) - (tagIndex.get(bAncestry[0][0]) ?? -1);
	}
	return sortTags;
}

/**
 * Fetches markdown posts and performs validations and transformations: the amigues profiles (or
 * the wiki). Events and material are not read from their .md any more: they come from the
 * database (`sitePosts` in $lib/server/contenido/posts.js).
 * @param {boolean} wiki - Whether or not the posts are from the wiki
 * @param {boolean} unlisted - Whether or not the posts shown are unlisted
 * @return {Promise<ProcessedPost[]>} An array of validated and transformed posts.
 */
export const fetchMarkdownPosts = async (wiki = false, unlisted = false) => {
	// Posts only change on deploy, so the processed list is computed once per
	// server instance (not in dev, so edited posts show up without a restart).
	// Callers get a fresh array and may sort it in place.
	// The list is processed with the file's tag tree; when the database's tree is in use, the
	// tags are cleaned up again with it (once per tree: retaggedCache).
	const key = `${wiki}-${unlisted}`;
	let posts = dev ? undefined : postsCache.get(key);
	if (!posts) {
		posts = loadMarkdownPosts(wiki, unlisted);
		if (!dev) {
			postsCache.set(key, posts);
			posts.catch(() => postsCache.delete(key));
		}
	}
	if (!siteTagsFromDb()) return [...(await posts)];
	const tree = currentSiteTags();
	let byKey = retaggedCache.get(tree);
	if (!byKey) retaggedCache.set(tree, (byKey = new Map()));
	let retagged = dev ? undefined : byKey.get(key);
	if (!retagged) {
		retagged = retagPosts(await posts, tree);
		if (!dev) byKey.set(key, retagged);
	}
	return [...retagged];
};

/** @type {Map<string, Promise<ProcessedPost[]>>} */
const postsCache = new Map();
/** @type {WeakMap<TagManager, Map<string, ProcessedPost[]>>} */
const retaggedCache = new WeakMap();

/**
 * @param {boolean} wiki
 * @param {boolean} unlisted
 * @return {Promise<ProcessedPost[]>}
 */
async function loadMarkdownPosts(wiki, unlisted) {
	/** @type {[string, (()=>Promise<any>)|any][]} */
	var allPosts;
	if (wiki) {
		allPosts = Object.entries(import.meta.glob('$lib/posts/wiki/*.md'));
	} else {
		// Los eventos y el material salen solo de la base ($lib/server/contenido/posts.js,
		// `sitePosts`): sus .md quedan en el repo como respaldo, pero el sitio no los lee.
		allPosts = Object.entries(import.meta.glob('$lib/posts/amigues/*.md'));
	}
	let processedPosts = [];
	for (const [rawPath, constructor] of allPosts) {
		const postID = rawPath.split('/').slice(-1)[0].split('.md')[0];
		if (postID.startsWith('_')) continue;
		const { metadata, default: postContent } = await constructor();
		if (
			!metadata ||
			metadata.force_unpublished ||
			(!unlisted && metadata.force_unlisted) ||
			(unlisted && !metadata.force_unlisted)
		) {
			continue;
		}
		// The file's tree here: the cached list is the same whatever the switch says (see above).
		processedPosts.push(await processPost(postContent, postID, metadata, true, fileSiteTags()));
	}
	processedPosts.sort((a, b) => {
		/** @param {ProcessedPost} x @returns number */
		let f = (x) =>
			new Date(x.meta?.start ?? x.meta?.updated_date ?? x.meta?.published_date).getTime();
		return f(b) - f(a);
	});
	return processedPosts;
}

/**
 * Splits related posts for a page load: the ones PostList shows by default are
 * sent, past events are only counted (the page fetches them if they're shown).
 * @param {ProcessedPost[]} related
 */
export const currentRelated = (related) => {
	const now = Date.now();
	const relatedPosts = related.filter((p) => isCurrent(p, now));
	return { relatedPosts, relatedPastCount: related.length - relatedPosts.length };
};

/**
 * Svelte action adding pronouns after @mentions, looking each profile up with fetchPost.
 * Pages that get `pronouns` from their server load should use addMentionPronouns from
 * $lib/utils/mentions instead, so they don't pull this module into the client.
 * @param {HTMLElement} node
 */
export const processContent = (node) =>
	addMentionPronouns(node, async (name) =>
		pronounLabel((await fetchPost('amigues', name, true)).meta.pronoun)
	);
