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
		};
	} catch (err) {
		return { isError: true, err };
	} 
}
