// export const prerender = true;
// export const csr = false;
// TODO fix prerender and csr blocking the build
export const load = ({ url }) => {
	return { currentRoute: url.pathname };
};
