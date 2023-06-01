//@ts-nocheck
export async function load({ fetch }) {
	const response = await fetch('../api');
	const posts = await response.json();
    const filtered_posts = posts
    .filter((post) => post.meta.category == 'calendario')
    
	return {posts:filtered_posts};
}
