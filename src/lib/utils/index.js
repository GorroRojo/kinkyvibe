import '$lib/types.d.js';

/**
 *
 * @returns {Promise<{tags:Record<string,*>, groups:Group[]}>}
 */
export const fetchTags = async () => {
	//@ts-expect-error
	var { metadata: tagsConfig } =
		/** @type {{metadata:{groups: Group[], tags:*}}} */ await Object.entries(
			import.meta.glob('$lib/posts/_tags.md')
		)[0][1]();
	let alias = aliaserFactory(tagsConfig);
	let aliasedGroups = tagsConfig.groups.map((/**@type Group*/ group) =>
		groupMap(group, (g) => {
			const name = alias(g.name);
			const members = g.members?.map(alias);
			if (members) return { ...g, name, members };
			else return { ...g, name, members: [] };
		})
	);
	/** @type {Record<string,Record<string,string>>} */
	let coloredGroupedTags = {};
	aliasedGroups.forEach((/**@type{Group}*/ group) =>
		groupMap(group, (g) => {
			if (g.sub) {
				g.sub.forEach((s) => {
					if (!s.color) {
						s.color = g.color;
					}
					s.parent = g.parent ? g.parent + '/' + g.name : g.name;
				});
			}
			if (g.color != undefined) {
				if (g.members) {
					[g.name, ...g.members].forEach((m) => {
						if (coloredGroupedTags[m]) {
							// @ts-ignore
							coloredGroupedTags[m].color = g.color;
							coloredGroupedTags[m].group = g.parent ? g.parent + '/' + g.name : g.name;
						} else {
							coloredGroupedTags[m] = {
								// @ts-ignore
								color: g.color,
								group: g.parent ? g.parent + '/' + g.name : g.name
							};
						}
					});
				}
			}
			return g;
		})
	);
	return {
		...tagsConfig,
		tags: Object.fromEntries([
			...Object.entries(tagsConfig.tags),
			...Object.entries(coloredGroupedTags)
		]),
		groups: aliasedGroups
	};
};

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
 * @param {string | number} assetID
 */
export const thumbURL = async (category, postID, assetID) => {
	for (const format of ['jpeg', 'jfif', 'jpg', 'png', 'webp']) {
		try {
			let thumb = await import(`$lib/posts/${category}/media/${postID}/${assetID}.${format}`);
			return thumb.default;
		} catch (e) {
			continue;
		}
	}
	return undefined;
};

/**
 * @param {*} tagsConfig
 * @returns {(tag: string)=>string}
 */
export function aliaserFactory(tagsConfig) {
	return (tag) => {
		let result = tag;
		let max = 20;
		while (
			Object.keys(tagsConfig.tags).includes(result) &&
			Object.keys(tagsConfig.tags[result]).includes('aliasOf')
		) {
			result = tagsConfig.tags[tag].aliasOf;
			if (max-- < 0) {
				console.error('too many aliases: ' + tag);
				break;
			}
			max--;
		}
		return result;
	};
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
 * @param {{tags:Record<string,*>,groups:Group[]}} [tagsConfig=false] - The tags configuration.
 * @param {(tag:string)=>string} [alias] - The alias function.
 * @return {Promise<ProcessedPost>} An object containing the processed post information.
 */
async function processPost(
	postContent,
	postID,
	meta,
	shallow = false,
	tagsConfig = { tags: [], groups: [] },
	alias = aliaserFactory(tagsConfig)
) {
	if (tagsConfig.groups.length == 0) tagsConfig = await fetchTags();
	let authorsProfiles = [];
	/**@type {ProcessedPost[]} */
	let relatedPosts = [];
	if (!shallow) {
		for (const author of meta?.authors ?? []) {
			const authorID = author == 'KinkyVibe' ? 'nosotres' : author.replaceAll(' ', '-');
			if (authorID !== postID) {
				try {
					const authorProfile = await fetchPost('amigues', authorID, true);
					authorsProfiles.push(authorProfile);
				} catch (e) {
					continue;
				}
			}
		}
		relatedPosts = (await fetchMarkdownPosts()).filter(
			(p) =>
				meta.authors?.some(
					(/**@type string */ a) => p.meta.authors.includes(a) && p.meta.title !== meta.title
				) ||
				(meta.wiki && p.meta.tags.includes(meta.wiki)) ||
				(meta.category == 'wiki' && p.meta.tags.includes(postID)) ||
				(meta.category == 'amigues' && p.meta.authors.includes(postID) && p.meta.postID != postID)
		);
	}
	/** @type {(termino:string, groups?: Group[])=>Array<Group>}*/
	function getGroups(termino, groups = tagsConfig.groups) {
		let matches = [];
		for (let group of groups) {
			if (group.name == termino) matches.push({ ...group });
			else if (group.sub) {
				const sub = getGroups(termino, group.sub);
				if (sub) matches.push(...sub);
			}
		}
		return matches.filter((i) => i);
	}
	const processedMeta = {
		...meta,
		tags: Array.isArray(meta.tags)
			? [...meta.tags]
					.map(alias)
					.sort((a, b) => getGroups(a)?.[0]?.name.localeCompare(getGroups(b)?.[0]?.name))
			: [alias(meta.tags)],
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
		relatedPosts,
		path: '/' + meta.category + '/' + postID
	};
	return processedPost;
}

/**
 * Fetches markdown posts and performs validations and transformations.
 * @param {boolean} wiki - Whether or not the posts are from the wiki
 * @return {Promise<ProcessedPost[]>} An array of validated and transformed posts.
 */
export const fetchMarkdownPosts = async (wiki = false) => {
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
	const tagsConfig = await fetchTags();
	const alias = aliaserFactory(tagsConfig);
	for (const [rawPath, constructor] of allPosts) {
		const postID = rawPath.split('/').slice(-1)[0].split('.md')[0];
		if (postID.startsWith('_')) continue;
		const { metadata, default: postContent } = await constructor();
		if (!metadata || metadata.force_unlisted) continue;

		processedPosts.push(await processPost(postContent, postID, metadata, true, tagsConfig, alias));
	}

	return [...processedPosts];
};

/** @type {import('svelte/action').Action}  */
export const processContent = async (node) => {
	// @ts-ignore
	node.querySelectorAll('a.mention').forEach(async (/**@type {HTMLAnchorElement}*/ el) => {
		let p = document.createElement('small');
		let name = el.textContent?.slice(1);
		if (name === undefined) return;
		else if (name == 'KinkyVibe') name = 'nosotres';
		let post;
		try {
			post = await fetchPost('amigues', name, true);
		} catch (e) {
			return;
		}
		p.className = 'p-pronoun';
		p.textContent =
			' ' + (post?.meta.pronoun + '').split('/').pop()?.split(',')[0].replaceAll('&', '/') + '';
		el.appendChild(p);
	});
};
