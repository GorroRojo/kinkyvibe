/** @type {import('@sveltejs/kit').ParamMatcher} */
export function match(param) {
	return ["amigues", "calendario", "material", "wiki"].includes(param);
}