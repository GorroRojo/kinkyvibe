import '$lib/types.d.js';
import { dev } from '$app/environment';
import { isCurrent } from './allPosts';
import tagsFactory from './tags';
import { error } from '@sveltejs/kit';

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
 * @param {TagManager} [tagManager=tagsFactory()]
 * @returns {(tag: string)=>string}
 */
export function aliaserFactory(tagManager = tagsFactory()) {
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
 * Processes a post and returns relevant information.
 *
 * @param {ConstructorOfATypedSvelteComponent} postContent - The content of the post.
 * @param {string} postID - The ID of the post.
 * @param {AnyPostData} meta - The metadata associated with the post.
 * @param {boolean} [shallow=false] - Indicates whether to perform a shallow processing.
 * @param {TagManager} [tagManager] - The tag manager to use.
 * @return {Promise<ProcessedPost>} An object containing the processed post information.
 */
async function processPost(postContent, postID, meta, shallow = false, tagManager = defaultTagManager()) {
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

	const sortTags = cachedTagSorter(tagManager);
	const processedMeta = {
		...meta,
		tags: [...(meta.tags ?? [])]
			.map((t) => tagManager.get(t))
			.sort(sortTags)
			.map((t) => t.id),
		featured:
			meta.featured !== undefined
				? await thumbURL(meta.category, postID, meta.featured)
				: undefined,
		photo: meta.photo !== undefined ? await thumbURL(meta.category, postID, meta.photo) : undefined,
		logo: meta.logo !== undefined ? await thumbURL(meta.category, postID, meta.logo) : undefined,
		postID
	};
	const processedPost = {
		content: shallow ? undefined : postContent,
		meta: processedMeta,
		authorsProfiles,
		path: '/' + meta.category + '/' + postID
	};
	return processedPost;
}

/** @type {TagManager|undefined} */
let _defaultTagManager;
/** Tag manager shared by processPost (it only reads from it), built once instead of once per post. */
function defaultTagManager() {
	return (_defaultTagManager ??= tagsFactory());
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
 * Fetches markdown posts and performs validations and transformations.
 * @param {boolean} wiki - Whether or not the posts are from the wiki
 * @param {boolean} unlisted - Whether or not the posts shown are unlisted
 * @return {Promise<ProcessedPost[]>} An array of validated and transformed posts.
 */
export const fetchMarkdownPosts = async (wiki = false, unlisted = false) => {
	// Posts only change on deploy, so the processed list is computed once per
	// server instance (not in dev, so edited posts show up without a restart).
	// Callers get a fresh array and may sort it in place.
	const key = `${wiki}-${unlisted}`;
	let posts = dev ? undefined : postsCache.get(key);
	if (!posts) {
		posts = loadMarkdownPosts(wiki, unlisted);
		if (!dev) {
			postsCache.set(key, posts);
			posts.catch(() => postsCache.delete(key));
		}
	}
	return [...(await posts)];
};

/** @type {Map<string, Promise<ProcessedPost[]>>} */
const postsCache = new Map();

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
		allPosts = Object.entries(import.meta.glob('$lib/posts/calendario/*.md'));
		allPosts.push(...Object.entries(import.meta.glob('$lib/posts/amigues/*.md')));
		allPosts.push(...Object.entries(import.meta.glob('$lib/posts/material/*.md')));
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
		processedPosts.push(await processPost(postContent, postID, metadata, true));
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
 * Listed posts minus calendar events that already started. PostList hides those
 * unless the viewer turns on "show past events", in which case the page loads the
 * full list with fetchAllPostsClient() from $lib/utils/allPosts.
 * @return {Promise<ProcessedPost[]>}
 */
export const fetchCurrentPosts = async () => {
	const now = Date.now();
	return (await fetchMarkdownPosts()).filter((p) => isCurrent(p, now));
};

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
 * Posts shown under "Más cosas de…" on calendario/material/amigues pages.
 * @param {AnyPostData} meta - metadata of the post being viewed
 * @param {ProcessedPost[]} posts
 * @return {ProcessedPost[]}
 */
export const relatedPostsFor = (meta, posts) =>
	posts.filter(
		(p) =>
			meta.authors?.some(
				(/**@type string */ a) => p.meta.authors.includes(a) && p.meta.title !== meta.title
			) ||
			(meta.wiki && p.meta.tags.includes(meta.wiki)) ||
			(meta.category == 'wiki' && p.meta.tags.includes(meta.postID)) ||
			(meta.category == 'amigues' &&
				p.meta.authors.includes(meta.postID) &&
				p.meta.postID != meta.postID)
	);

/** @type {import('svelte/action').Action}  */
export const processContent = async (node) => {
	// @ts-ignore
	node.querySelectorAll('a.mention').forEach(async (/**@type {HTMLAnchorElement}*/ el) => {
		let p = document.createElement('small');
		let name = el.textContent?.slice(1);
		if (name === undefined) return;
		let post;
		try {
			post = await fetchPost('amigues', name, true);
		} catch (e) {
			return;
		}
		if (post.meta.pronoun == '' || !post.meta.pronoun || (post.meta.pronoun + '').split('/').pop() == 'evitar') return;
		p.className = 'p-pronoun';
		p.textContent =
			' ' + (post?.meta.pronoun + '').split('/').pop()?.split(',')[0].replaceAll('&', '/') + '';
		el.appendChild(p);
	});
};
