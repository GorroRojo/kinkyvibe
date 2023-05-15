//@ts-nocheck
// import { error } from '@sveltejs/kit';
// export const prerender = true;

export const fetchMarkdownPosts = async () => {
	var allPosts = Object.entries(import.meta.glob('$lib/posts/*.md'));
	var allThumbs = import.meta.glob(
		['$lib/posts/media/*/*.jpeg', '$lib/posts/media/*/*.png', '$lib/posts/media/*/*.webp'],
		{ eager: true, as: 'url' }
	);
	function thumbURL(post, assetID) {
		return allThumbs[
			Object.keys(allThumbs).find((path) => path.endsWith(post + '/' + assetID + '.jpeg'))
		];
	}
	allPosts = await Promise.all(allPosts.map(async ([path, resolver]) => [path, await resolver()]));
	allPosts = allPosts
		.filter((a) => a)
		.map(([path, { metadata }]) => {
			const postPath = path.slice(15, -3);
			let thumbnail_url;
			if (metadata.thumbnail_url !== undefined) {
				thumbnail_url = thumbURL(postPath, metadata.thumbnail_url);
			}
			return { meta: { ...metadata, thumbnail_url }, path: postPath };
		});
	return allPosts;
};
