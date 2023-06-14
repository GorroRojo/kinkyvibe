//@ts-nocheck

export async function load({ fetch }) {
	try {
		const posts = await (await fetch('../api?category=material')).json();
		const tagsConfig = await (await fetch('../api?getTags')).json();
		return { posts, tagsConfig };
	} catch (err) {
		return { isError: true, err };
	}
}
