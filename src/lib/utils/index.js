import '$lib/types.d.js';
import tagsFactory from './tags';

/**
 *
 * @returns {Promise<{terminos:(ProcessedTag&{name:string})[]}>}
 */
export const fetchGlossary = async () => {
	//@ts-expect-error
	var { metadata: glossary } = /** @type {{terminos:string[]}} */ await Object.entries(
		import.meta.glob('$lib/posts/_glossary.md')
	)[0][1]();
	return glossary;
};

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
			try {
				let thumb = await import(`$lib/posts/${category}/media/${postID}/${assetID}.${format}`);
				return thumb.default;
			} catch (e) {
				continue;
			}
		}
		return undefined;
	} else {
		let [filename, format] = assetID.split('.');
		try {
			let thumb = await import(`$lib/assets/${filename}.${format}`);
			return thumb.default;
		} catch (e) {
			return undefined;
		}
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
	let { default: postContent, metadata: meta } = await import(`../posts/${category}/${postID}.md`);
	if (meta?.force_unpublished) throw Error('Post is unpublished');
	return await processPost(postContent, postID, meta, shallow);
};

/**
 * Processes a post and returns relevant information.
 *
 * @param {ConstructorOfATypedSvelteComponent} postContent - The content of the post.
 * @param {string} postID - The ID of the post.
 * @param {AnyPostData} meta - The metadata associated with the post.
 * @param {boolean} [shallow=false] - Indicates whether to perform a shallow processing.
 * @param {TagManager} [tagManager=tagsFactory()] - The tag manager to use.
 * @return {Promise<ProcessedPost>} An object containing the processed post information.
 */
async function processPost(postContent, postID, meta, shallow = false, tagManager = tagsFactory()) {
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

	/**
	 * @param {ProcessedTag} tag
	 * @return {string[][]}
	 */
	const ancestry = (tag) => {
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
		return (
			tagManager.tagIDs().indexOf(aAncestry[0][0]) - tagManager.tagIDs().indexOf(bAncestry[0][0])
		);
	}
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

/**
 * Fetches markdown posts and performs validations and transformations.
 * @param {boolean} wiki - Whether or not the posts are from the wiki
 * @param {boolean} unlisted - Whether or not the posts shown are unlisted
 * @return {Promise<ProcessedPost[]>} An array of validated and transformed posts.
 */
export const fetchMarkdownPosts = async (wiki = false, unlisted = false) => {
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
			(!unlisted && metadata.force_unlisted) ||
			(unlisted && !metadata.force_unlisted)
		) {
			continue;
		}
		const tagManager = tagsFactory();
		processedPosts.push(await processPost(postContent, postID, metadata, true, tagManager));
	}
	processedPosts.sort((a,b)=> {
		/** @param {ProcessedPost} x @returns number */
		let f = (x) => (new Date(x.meta?.start ?? x.meta?.updated_date ?? x.meta?.published_date)).getTime()
		return f(b) - f(a)
	})
	return [...processedPosts];
};

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
		if (post.meta.pronoun == '' || !post.meta.pronoun) return;
		p.className = 'p-pronoun';
		p.textContent =
			' ' + (post?.meta.pronoun + '').split('/').pop()?.split(',')[0].replaceAll('&', '/') + '';
		el.appendChild(p);
	});
};
