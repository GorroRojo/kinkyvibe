export async function load({ fetch }) {
	try {
		const posts = await (await fetch('../api?category=material')).json();
		const wiki = await (await fetch('../api?wiki')).json();
		return { posts, wiki };
	} catch (err) {
		return { isError: true, err };
	}
}
