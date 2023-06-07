//@ts-nocheck

export async function load({ fetch }) {
	try {
		return {posts: await (await fetch('../api?category=material')).json()};
	} catch (err) {
		return { isError: true, err };
	} 
}
