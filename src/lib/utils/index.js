//@ts-nocheck
export const fetchMarkdownPosts = async () => {
	const allPostFiles = import.meta.glob('/src/routes/[slug]/posts/*.md');
	const iterablePostFiles = Object.entries(allPostFiles);
	const allPosts = await Promise.all(
		iterablePostFiles.map(async ([path, resolver]) => {
			const { metadata } = await resolver();
			const postPath = path.slice(25, -3);
			return { meta: metadata, path: postPath };
		})
	);
	return allPosts;
};