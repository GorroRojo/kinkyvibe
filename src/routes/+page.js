//@ts-nocheck
export async function load({ fetch }) {
	const response = await fetch('/api');
	let posts, err;
	try {
		posts = await response.json();
	} catch (e) {
		err = e;
	}
	return { posts: posts.map((post) => ({
		title: post.meta.title,
		href: '/' + post.path,
		tags: post.meta.tags,
		src: post.meta.thumbnail_url,
		path: post.path,
		date: post.meta.date
			? new Intl.DateTimeFormat('es-AR').format(new Date(post.meta.date))
			: '',
		authors: post.meta.authors ?? [],
		category: post.meta.category
	})), err };
}
