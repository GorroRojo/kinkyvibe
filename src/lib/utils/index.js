import '$lib/types.d.js';

export const fetchTags = async () => {
	//@ts-expect-error
	var { metadata: tagsConfig } = /** @type {{groups: Group[], tags:*}} */ await Object.entries(
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
	return { ...tagsConfig, groups: aliasedGroups };
};

export const fetchGlossary = async () => {
	//@ts-expect-error
	var { metadata: glossary } = /** @type {{terminos:string[]}} */ await Object.entries(
		import.meta.glob('$lib/posts/_glossary.md')
	)[0][1]();
	return glossary;
}

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
 *
 * @param {string} postSlug
 * @param {string | number} assetID
 * @param {Record<string,any> | false} allThumbs
 */
export const thumbURL = (postSlug, assetID, allThumbs = false) => {
	if (!allThumbs) {
		allThumbs = import.meta.glob(
			[
				'$lib/posts/media/*/*.jpeg',
				'$lib/posts/media/*/*.jfif',
				'$lib/posts/media/*/*.jpg',
				'$lib/posts/media/*/*.png',
				'$lib/posts/media/*/*.webp'
			],
			{ eager: true, as: 'url' }
		);
	}
	let regex = new RegExp(`/${postSlug}/${assetID}.\\w+`);
	return allThumbs[Object.keys(allThumbs).find((path) => regex.test(path)) ?? ''];
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
			Object.hasOwn(tagsConfig.tags, result) &&
			Object.hasOwn(tagsConfig.tags[result], 'aliasOf')
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
 * Fetches markdown posts and performs validations and transformations.
 *
 * @return {Array} An array of validated and transformed posts.
 */
export const fetchMarkdownPosts = async () => {
	/** @type {[string, (()=>Promise<any>)|any][]} */
	var allPosts = Object.entries(import.meta.glob('$lib/posts/*.md'));
	var allThumbs = import.meta.glob(
		[
			'$lib/posts/media/*/*.jpeg',
			'$lib/posts/media/*/*.jfif',
			'$lib/posts/media/*/*.jpg',
			'$lib/posts/media/*/*.png',
			'$lib/posts/media/*/*.webp'
		],
		{ eager: true, as: 'url' }
	);

	let validatedPosts = await validateAll(allPosts);
	const tagsConfig = await fetchTags();
	const alias = aliaserFactory(tagsConfig);
	validatedPosts = validatedPosts.map((post) => {
		let { featured, tags } = post.meta;
		if (featured && (featured + '').length < 3) {
			featured = thumbURL(post.path, featured, allThumbs);
		}
		if (Array.isArray(tags)) tags = tags.map(alias);
		tags = [...tags].sort();
		return { ...post, meta: { ...post.meta, featured, tags, tagsConfig } };
	});
	// TODO performance, i'm looping way way way too many times
	return [...validatedPosts];
};

/**
 * @param {[string, ()=>Promise<{
 * 		metadata:AnyPostData
 * }>][]} posts
 * @return {Promise<{meta: AnyPostData, path:string}[]>}
 */
async function validateAll(posts) {
	/** @type {[string,{metadata:AnyPostData,default?:{render:()=>{html:string,css:{code:string}}}}][]} */
	const raw = await Promise.all(posts.map(async ([path, resolver]) => [path, await resolver()]));
	const validated = raw
		.filter(([path, post]) => post.metadata && !post.metadata.force_unlisted && !(path[15] == '_'))
		.map((p) => validatePost(p));
	return validated;
}

/**
 * @param {[string,{metadata:AnyPostData, default?: {render: ()=>{html:string,css:{code:string}}}}]} post
 * @return {{error?: any, default?: {render: function}, meta: AnyPostData, path: string}}
 */
function validatePost(post) {
	const path = post[0].slice(15, -3);
	const { metadata } = post[1];
	let missing = validateMissingData(metadata);
	if (missing) return { error: missing, meta: metadata, default: post[1].default, path };
	return { meta: metadata, default: post[1].default, path };
}

/**
 *
 *
 * @param {AnyPostData} data
 * @return {*}
 */
function validateMissingData(data) {
	try {
		if (data.title === undefined) {
			throw new Error('title is missing');
		} else if (data.summary === undefined) {
			throw new Error('description is missing');
		} else if (data.tags === undefined) {
			throw new Error('tags is missing');
		} else if (data.category === undefined) {
			throw new Error('category is missing');
		} else if (data.authors === undefined) {
			throw new Error('author is missing');
		}
		switch (data.category) {
			case 'amigues':
				if (data.pronoun === undefined) {
					throw new Error('pronoun is missing');
				}
				if (data.link === undefined) {
					throw new Error('link is missing');
				}
				// TODO validate link url, logo, photo, email, gender url, pronoun url, bday date
				break;
			case 'calendario':
				if (data.status === undefined) {
					throw new Error('status is missing');
				} else if (!['abierto', 'anunciado', 'lleno'].includes(data.status)) {
					throw new Error('status is invalid');
				}
				if (data.start === undefined) {
					throw new Error('start is missing');
				} else if (data.end === undefined && data.duration === undefined) {
					throw new Error('end/duration is missing');
				}
				// TODO validate link url?
				break;
			case 'material':
				if (data.type === undefined) {
					throw new Error('type is missing');
				} else if (!['descargable', 'link', 'contenido'].includes(data.type)) {
					throw new Error('type is invalid');
				}
				if (data.link === undefined) {
					throw new Error('link is missing');
				} else {
					// TODO chequear que es un url valido?
				}
				if (data.access_date === undefined) {
					throw new Error('access_date is missing');
				} else {
					// TODO chequear que es un date valido?
				}
				if (data.original_published_date === undefined) {
					throw new Error('original_published_date is missing');
				} else {
					// TODO chequear que es un date valido?
				}
				break;
			default:
				throw new Error('category is invalid');
		}
	} catch (err) {
		// @ts-ignore
		return { error: err.message };
	}
	return false;
}
