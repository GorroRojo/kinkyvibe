//@ts-nocheck

export async function load({ fetch }) {
	let response;
	let posts;
	try {
		response = await fetch('../api');
		posts = await response.json();
		return {
			posts: posts
				.filter((post) => post.meta.category == 'material')
				.map((post) => ({
					title: post.meta.title,
					href: '/' + post.path,
					tags: post.meta.tags,
					src: post.meta.featured,
					path: post.path,
					date: post.meta.date
						? new Intl.DateTimeFormat('es-AR').format(new Date(post.meta.date))
						: '',
					authors: post.meta.authors
				}))
		};
	} catch (err) {
		return { isError: true, err };
	} 
}
