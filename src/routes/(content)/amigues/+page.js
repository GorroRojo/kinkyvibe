//@ts-nocheck
export async function load({ fetch }) {
	const response = await fetch('../api');
	const posts = await response.json();
	return {
		posts: posts
			.filter((post) => post.meta.category == 'amigues')
	};
}
