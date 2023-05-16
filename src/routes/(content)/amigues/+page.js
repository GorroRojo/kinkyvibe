//@ts-nocheck
export async function load({ fetch }) {
	const response = await fetch('../api');
	const posts = await response.json();
	return {
		posts: posts
			.filter((post) => post.meta.category == 'amigues')
			.map((post) => ({
				title: post.meta.title,
				href: '/' + post.path,
				tags: post.meta.tags,
				src: post.meta.thumbnail_url,
				path: post.path,
				date: post.meta.date
					? new Intl.DateTimeFormat('es-AR').format(new Date(post.meta.date))
					: '',
				authors: post.meta.authors
			}))
	};
}
