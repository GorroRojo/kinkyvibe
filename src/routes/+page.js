//@ts-nocheck
export async function load({ fetch }) {
	const response = await fetch('/api');
	let posts, err;
	try {
		posts = await response.json();
	} catch (e) {
		err = e;
	}
	return { posts, err };
}
