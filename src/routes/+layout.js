import { fetchTags } from "$lib/utils";
/** @type {import("./$types").LayoutLoad} */
export const load = async ({ url }) => {
	const tagsConfig = await fetchTags();
	return { currentRoute: url.pathname, tagsConfig };
};
