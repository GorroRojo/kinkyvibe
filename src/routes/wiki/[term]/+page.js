import {
	thumbURL,
	fetchMarkdownPosts,
	processMetadata,
	fetchTags,
	aliaserFactory
} from '$lib/utils/index.js';
import { redirect } from '@sveltejs/kit';
export const prerender = 'auto';
/** @type {import("./$types").PageLoad} */
export async function load({ params }) {
	/** @type {{metadata: AnyPostData, default: *}} */
	let post;
	const tagsConfig = await fetchTags();
	/**@type {(tag:string)=>string[]}*/
	function getParents(tag) {
		/**@type {string[]}*/
		let parents = [];
		tagsConfig.groups.forEach((/** @type {Group} */ g) => {
			parents = [...parents, ...findTagAndReturnParents(tag, g)];
		});
		return parents;
	}
	try {
		post = await import(`../../../lib/wiki/${params.term}.md`);
		const content = post.default;
		const alias = aliaserFactory(tagsConfig);
		const { meta } = await processMetadata(
			{ path: params.term, meta: post.metadata },
			alias,
			tagsConfig
		);
		let posts = (await fetchMarkdownPosts()).filter(
			(p) => meta.wiki && p.meta.tags.includes(meta.wiki)
		);
		return {
			content,
			...meta,
			posts
		};
	} catch (e) {
		// return { content: e + '\nparams.term: ' + params.term, title: 'Error', date: '', error: true };
	}
	try {
		let posts = (await fetchMarkdownPosts()).filter(
			(p) =>
				p.meta.tags.includes(params.term) ||
				p.meta.tags.some((/**@type {string}*/ t) => getParents(t)?.includes(params.term))
		);
		return {
			title: params.term.replaceAll('-', ' '),
			posts,
			error: true
		}
		
	} catch (e) {
		return { content: e + '\nparams.term: ' + params.term, title: 'Error', date: '', error: true };
	}
}

/**
 * Finds a specific tag within a group and returns its parents.
 * @param {string} tag - The tag to search for.
 * @param {Group} group - The group object to search within.
 * @param {string[]} [parents=[]] - An array of parent names (optional, defaults to an empty array).
 * @returns {string[]} - An array containing the names of the parents of the tag.
 */
function findTagAndReturnParents(tag, group, parents = []) {
	if (group.name == tag) return parents;
	if (group.members.includes(tag)) return [...parents, group.name];
	/**@type {string[]}*/
	let deeper = [];
	group.sub.forEach((sub) => {
		deeper.push(...findTagAndReturnParents(tag, sub, [...parents, group.name]));
	});
	return deeper;
}
