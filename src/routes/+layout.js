// export const prerender = true;
// export const csr = false;
// TODO fix prerender and csr blocking the build
/** @type {import("./$types").LayoutLoad} */
export const load = async ({ url, fetch }) => {
	const tagsConfig = await (await fetch('/api?getTags')).json();
	return { currentRoute: url.pathname, tagsConfig };
};
