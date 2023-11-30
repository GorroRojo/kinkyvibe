/**
 * @return {Promise<{posts: ProcessedPost[]}>} 
 */
export async function load({ fetch }) {
	const response = await fetch('../api?category=calendario');
	return { /**@type {ProcessedPost[]}*/posts: await response.json() };
}
