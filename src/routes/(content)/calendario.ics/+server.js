import { fetchMarkdownPosts } from '$lib/utils';
import * as ics from 'ics';
import { eventEnd } from '$lib/utils/dates.js';

/**
 * Converts a string to an array representing the date and time.
 *
 * @param {string|Date} s - The string to convert.
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
		// one event with a missing/invalid start would make createEvents() fail for the whole feed
		if (isNaN(new Date(post.meta.start).getTime())) continue;
		const organizer = post.meta.tags.includes('KinkyVibe')
			? 'KinkyVibe'
			: post.meta.authors?.[0] ?? 'KinkyVibe';
		const postPath = 'https://kinkyvibe.ar' + post.path;
		/**@type ics.EventAttributes */
		let event = {
			// stable UID so subscribed calendars update events instead of re-creating them
			uid: post.meta.postID + '@kinkyvibe.ar',
			start: stringToDateArray(post.meta.start),
			end: stringToDateArray(eventEnd(post.meta.start, post.meta.end)),
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
