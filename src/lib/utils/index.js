import '$lib/types.d.js';
import { isCurrent, relatedPostsFor } from './allPosts';
import { currentSiteTags } from './siteTags.js';
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
 * Processes a post and returns relevant information. Exported for the posts stored in the
 * database ($lib/server/contenido/posts.js), so they become the same ProcessedPost as a .md.
 *
 * @param {ConstructorOfATypedSvelteComponent|undefined} postContent - The content of the post.
 * @param {string} postID - The ID of the post.
 * @param {AnyPostData} meta - The metadata associated with the post.
 * @param {boolean} [shallow=false] - Without the content component. (The authors' profiles come
 *   from the database: `authorProfilePosts` in $lib/server/amigues/asPost.js.)
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
	const processedPost = {
		content: shallow ? undefined : postContent,
		meta: processedMeta,
		authorsProfiles: [],
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
 * Splits related posts for a page load: the ones PostList shows by default are
 * sent, past events are only counted (the page fetches them if they're shown).
 * @param {ProcessedPost[]} related
 */
export const currentRelated = (related) => {
	const now = Date.now();
	const relatedPosts = related.filter((p) => isCurrent(p, now));
	return { relatedPosts, relatedPastCount: related.length - relatedPosts.length };
};
