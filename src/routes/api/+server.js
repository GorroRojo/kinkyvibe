// @ts-nocheck
import { error, json } from '@sveltejs/kit';
import { fetchMarkdownPosts } from '$lib/utils';

export async function GET() {
	var allPosts;
	await fetchMarkdownPosts().then((posts)=>{
		allPosts=posts
	}).catch((err)=>{
		error(err);
	});
	const sortedPosts = allPosts.sort((a, b) => {
		return new Date(b.meta.date) - new Date(a.meta.date);
	});
	return json(sortedPosts);
}
