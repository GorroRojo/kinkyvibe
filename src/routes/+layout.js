// export const prerender = true;
// export const csr = false;
// TODO fix prerender and csr blocking the build

/** @type {import("./$types").LayoutLoad} */
export const load = async ({ url }) => {
	return { currentRoute: url.pathname };
};
