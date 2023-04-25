//@ts-nocheck
// import { error } from '@sveltejs/kit';
// export const prerender = true;


export const fetchMarkdownPosts = async () => {
	var allPosts = Object.entries(import.meta.glob('$lib/posts/*.md'));
	var allThumbs = import.meta.glob([
		'$lib/posts/media/*/*.jpeg',
		'$lib/posts/media/*/*.png',
		'$lib/posts/media/*/*.webp'
	], {eager: true, as: 'url'})
	function thumbURL(post,assetID) {
		return allThumbs[Object.keys(allThumbs).find(path=>path.endsWith(post+'/'+assetID+'.jpeg'))]
	}
	allPosts = await Promise.all(
		allPosts.map(async ([path, resolver]) => {
			const { metadata } = await resolver();
			const postPath = path.slice(15, -3);
			let thumbnail_url;
			if (metadata.thumbnail_url !== undefined) {
				// await import(`../posts/media/${postPath}/${metadata.thumbnail_url}.jpeg`);
				// thumbnail_url = new URL(`../posts/media/${postPath}/${metadata.thumbnail_url}.jpeg`, import.meta.url).href
				thumbnail_url = thumbURL(postPath, metadata.thumbnail_url)
				console.log(thumbnail_url);
				
				// console.log(metadata.thumbnail_url+'] END ')
			// 		.then((thumb) => {
			// 			metadata.thumbnail_url = thumb;
			// 		})
			// 		.catch((err) => {
			// 			error(err);
			// 		});
			// 	// .catch((err) => {
			// 	// });
			}
			return { meta: {...metadata, thumbnail_url}, path: postPath };
		})
	);
	return allPosts;
};
