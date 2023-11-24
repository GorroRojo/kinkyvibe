export async function load({ fetch }) {
	try {
		const posts = await (await fetch('../api')).json();
		return { posts };
	} catch (err) {
		return { isError: true, err };
	}
}
