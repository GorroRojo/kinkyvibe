import { fetchMarkdownPosts } from '$lib/utils';
import { json } from '@sveltejs/kit';
import * as ics from 'ics';

/**
 * Converts a string to an array representing the date and time.
 *
 * @param {string} s - The string to convert.
 * @return {import('ics').DateArray} An array representing the date and time with the following format: [year, month, day, hours, minutes].
 */
function stringToDateArray(s) {
    let d = new Date(s)
    return [d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes()]
}
/** @type {import('./$types').RequestHandler} */
export async function GET() {
	/**@type ics.EventAttributes[] */
	let events = [];
	let eventPosts = (await fetchMarkdownPosts()).filter((p) => p.meta.category == 'calendario');
	for (let post of eventPosts) {
		/**@type ics.EventAttributes */
		let event = {
			start: stringToDateArray(post.meta.start),
			end: stringToDateArray(post.meta.end ?? post.meta.start + post.meta.duration),
			title: post.meta.title,
			url: 'https://kinkyvibe.com' + post.path,
            description: post.meta.summary
		};
		events.push(event);
	}
	return new Response(ics.createEvents(events).value);
}
