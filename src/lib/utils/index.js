/** @typedef {{
 * 		title: string,
 * 		summary: string,
 * 		tags: string[] | string,
 * 		category: "material" | "calendario" | "amigues",
 * 		authors: string[] | string,
 * 		featured?: number | string,
 * 		published_date?: Date,
 * 		updated_date?: Date,
 * 		force_unlisted?: boolean,
 * 		force_unpublished?: boolean
 * }} PostData
 */
/** @typedef {PostData & {
 * 		type: 'descargable' | 'link' | 'contenido',
 * 		link: URL,
 * 		access_date: Date,
 * 		original_published_date: Date
 * }} MaterialPostData
 */
/** @typedef {PostData & {
 *		status: 'abierto' | 'anunciado' | 'lleno',
 * 		start: string,
 * 		end?: string,
 * 		duration?: Date,
 * 		location?: string,
 * 		link?: URL
 * 		link_text?: string
 * }} CalendarioPostData */
/** @typedef {PostData & {
 * 		pronoun: string | URL,
 * 		link: URL,
 * 		logo?: URL | number,
 * 		photo?: URL | number,
 * 		email?: string,
 * 		location?: string,
 * 		tel?: string,
 * 		job_title?: string,
 * 		job_role?: string,
 * 		gender_identity?: string | URL,
 * 		bday?: Date,
 * }} AmiguesPostData */
// TODO affiliation, education, experience, skill
// import tagConfig from '$lib/posts/_tags.md'

/** @typedef {AmiguesPostData & MaterialPostData & CalendarioPostData} AnyPostData */

export const fetchTags = async () => {
	/** @type {*} */
	var { metadata: tagsConfig } = await Object.entries(
		import.meta.glob('$lib/posts/_tags.md')
	)[0][1]();
	return tagsConfig;
};

export const fetchMarkdownPosts = async () => {
	/** @type {[string, (()=>Promise<any>)|any][]} */
	var allPosts = Object.entries(import.meta.glob('$lib/posts/*.md'));
	var allThumbs = import.meta.glob(
		['$lib/posts/media/*/*.jpeg', '$lib/posts/media/*/*.png', '$lib/posts/media/*/*.webp'],
		{ eager: true, as: 'url' }
	);

	/**
	 * @param {string} postSlug
	 * @param {number|string} assetID
	 * @return {*}
	 */
	function thumbURL(postSlug, assetID) {
		let regex = new RegExp(`${postSlug}/${assetID}.\\w+`);
		return allThumbs[Object.keys(allThumbs).find((path) => regex.test(path)) ?? ''];
	}

	let validatedPosts = await validateAll(allPosts);
	const tagsConfig = await fetchTags();
	validatedPosts = validatedPosts.map((post) => {
		let { featured, tags } = post.meta;
		if (featured && (featured + '').length < 3) {
			featured = thumbURL(post.path, featured);
		}
		tags = [...tags].sort();
		// TODO filter tags config to only relevant config
		return { ...post, meta: { ...post.meta, featured, tags, tagsConfig}  };
	});
	// TODO performance, i'm looping way way way too many times
	return validatedPosts;
};

/**
 * @param {[string, ()=>Promise<{
 * 		metadata:AnyPostData
 * }>][]} posts
 * @return {Promise<{meta: AnyPostData, path:string}[]>}
 */
async function validateAll(posts) {
	/** @type {[string,{metadata:AnyPostData}][]} */
	const raw = await Promise.all(posts.map(async ([path, resolver]) => [path, await resolver()]));
	const validated = raw
		.filter(([path, { metadata }]) => metadata && !metadata.force_unlisted && !(path[15] == '_'))
		.map((p) => validatePost(p));
	return validated;
}

/**
 * @param {[string,{metadata:AnyPostData}]} post
 * @return {{error?: any, meta: AnyPostData, path: string}}
 */
function validatePost(post) {
	const path = post[0].slice(15, -3);
	const { metadata } = post[1];
	let missing = validateMissingData(metadata);
	if (missing) return { error: missing, meta: metadata, path };
	return { meta: metadata, path };
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
