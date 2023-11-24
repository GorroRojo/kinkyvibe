export async function load({ fetch }) {
	const response = await fetch('../api?category=calendario');
	return {posts: await response.json()};
}
