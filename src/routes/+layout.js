// export const prerender = true;
// export const csr = false;
// TODO fix prerender and csr blocking the build
/**
 * 
 * @param {any} url 
 * @returns 
 */
export const load = ({ url }) => {
	return { currentRoute: url.pathname };
};
