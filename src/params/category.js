import { isCategory } from '$lib/utils/postPaths.js';

/** @type {import('@sveltejs/kit').ParamMatcher} */
export function match(param) {
	return isCategory(param);
}
