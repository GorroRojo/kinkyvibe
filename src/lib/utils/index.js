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
/** @typedef {AmiguesPostData & MaterialPostData & CalendarioPostData} AnyPostData */
export const fetchMarkdownPosts = async () => {
	/** @type {[string, (()=>Promise<any>)|any][]} */
	var allPosts = Object.entries(import.meta.glob('$lib/posts/*.md'));
	var allThumbs = import.meta.glob(
		['$lib/posts/media/*/*.jpeg', '$lib/posts/media/*/*.png', '$lib/posts/media/*/*.webp'],
		{ eager: true, as: 'url' }
	);

	/**
	 *
	 *
	 * @param {string} postSlug
	 * @param {number|string} assetID
	 * @return {*}
	 */
	function thumbURL(postSlug, assetID) {
		return allThumbs[
			Object.keys(allThumbs).find((path) => path.endsWith(postSlug + '/' + assetID + '.jpeg')) ?? ''
		];
	}
	let validatedPosts = await validateAll(allPosts);
	validatedPosts.forEach((post) => {
		if (post.meta.featured !== undefined) {
			post.meta.featured = thumbURL(post.path, post.meta.featured);
		}
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
	let featured;
	try {
		if (metadata.title === undefined) {
			throw new Error('title is missing in ' + path);
		} else if (metadata.summary === undefined) {
			throw new Error('description is missing in ' + path);
		} else if (metadata.tags === undefined) {
			throw new Error('tags is missing in ' + path);
		} else if (metadata.category === undefined) {
			throw new Error('category is missing in ' + path);
		} else if (metadata.authors === undefined) {
			throw new Error('author is missing in ' + path);
		}
		switch (metadata.category) {
			case 'amigues':
				if (metadata.pronoun === undefined) {
					throw new Error('pronoun is missing in ' + path);
				}
				if (metadata.link === undefined) {
					throw new Error('link is missing in ' + path);
				}
				// TODO validate link url, logo, photo, email, gender url, pronoun url, bday date
				break;
			case 'calendario':
				if (metadata.status === undefined) {
					throw new Error('status is missing in ' + path);
				} else if (!['abierto', 'anunciado', 'lleno'].includes(metadata.status)) {
					throw new Error('status is invalid in ' + path);
				}
				if (metadata.start === undefined) {
					throw new Error('start is missing in ' + path);
				} else if (metadata.end === undefined && metadata.duration === undefined) {
					throw new Error('end/duration is missing in ' + path);
				}
				// TODO validate link url?
				break;
			case 'material':
				if (metadata.type === undefined) {
					throw new Error('type is missing in ' + path);
				} else if (!['descargable', 'link', 'contenido'].includes(metadata.type)) {
					throw new Error('type is invalid in ' + path);
				}
				if (metadata.link === undefined) {
					throw new Error('link is missing in ' + path);
				} else {
					// TODO chequear que es un url valido?
				}
				if (metadata.access_date === undefined) {
					throw new Error('access_date is missing in ' + path);
				} else {
					// TODO chequear que es un date valido?
				}
				if (metadata.original_published_date === undefined) {
					throw new Error('original_published_date is missing in ' + path);
				} else {
					// TODO chequear que es un date valido?
				}
				break;
			default:
				throw new Error('category is invalid in ' + path);
		}
	} catch (err) {
		// @ts-ignore
		return { error: err.message, meta: metadata, path };
	}
	return { meta: { ...metadata, featured }, path };
}
