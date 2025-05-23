import { fetchMarkdownPosts } from '$lib/utils';
import * as ics from 'ics';

/**
 * Converts a string to an array representing the date and time.
 *
 * @param {string} s - The string to convert.
 * @return {import('ics').DateArray} An array representing the date and time with the following format: [year, month, day, hours, minutes].
 */
function stringToDateArray(s) {
	let d = new Date(s);
	return [d.getFullYear(), d.getMonth() + 1, d.getDate(), d.getHours(), d.getMinutes()];
}
/** @type {import('./$types').RequestHandler} */
export async function GET() {
	/**@type ics.EventAttributes[] */
	let events = [];
	const allPosts = await fetchMarkdownPosts();
	const eventPosts = allPosts.filter((p) => p.meta.category == 'calendario');
	for (let post of eventPosts) {
		if (post.meta.status == 'cancelado') continue
		const organizer = post.meta.tags.includes('KinkyVibe') ? 'KinkyVibe' : post.meta.authors[0];
		const postPath = 'https://kinkyvibe.ar' + post.path;
		/**@type ics.EventAttributes */
		let event = {
			start: stringToDateArray(post.meta.start),
			end: stringToDateArray(post.meta.end ?? post.meta.start + post.meta.duration),
			title: post.meta.title,
			url: postPath,
			description: postPath + ' \n' + post.meta.summary,
			htmlContent: `<!DOCTYPE html><html><body><p><a href="${postPath}">${postPath}</a></p><p>${post.meta.summary}</p></body></html>`,
			location: post.meta.location ?? postPath,
			calName: 'KinkyVibe',
			organizer: {
				name: organizer,
				email:
					allPosts.find((p) => p.meta.postID == organizer)?.meta?.email ??
					'kinkyvibe@gmail.com'
			},
			// @ts-ignore
			status:
				// @ts-ignore
				{
					abierto: 'CONFIRMED',
					cancelado: 'CANCELLED',
					anunciado: 'TENTATIVE',
					agotadas: 'CONFIRMED'
				}[post.meta.status] ?? 'CONFIRMED' //TODO añadir email
		};
		events.push(event);
	}
	return new Response(ics.createEvents(events).value, {
		headers: { 'Content-Type': 'text/calendar' }
	});
}
