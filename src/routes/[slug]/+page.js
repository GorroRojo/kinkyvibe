//@ts-nocheck
export async function load({ params }) {
	try {
		const post = await import(`/src/lib/posts/${params.slug}.md`);
		const { title, date } = post.metadata;
		const content = post.default;

		return { content, title, date };
	} catch (e) {
		return { content: e + '\nparams.slug: ' + params.slug, title: 'Error', date: '', error: true };
	}
}
