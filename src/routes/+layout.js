export const prerender = true;
export const load = ({ url }) => {
	return { currentRoute: url.pathname };
};
// export const csr = false;
