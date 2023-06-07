//@ts-nocheck
export async function load({ fetch }) {
	const response = await fetch('../api?category=amigues');
	return { posts: await response.json() };
}
