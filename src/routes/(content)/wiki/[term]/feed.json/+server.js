import { tagFeed } from '$lib/server/feeds.js';

/** @type {import('./$types').RequestHandler} */
export const GET = ({ platform, params }) => tagFeed(platform, params.term, 'json');
