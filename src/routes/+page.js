//@ts-nocheck
export async function load({ fetch }) {
	const response = await fetch('/api');
	let posts;
	try {
		posts = await response.json();
	} catch (err) {
		posts = [err];
	}
	return { posts };
}
