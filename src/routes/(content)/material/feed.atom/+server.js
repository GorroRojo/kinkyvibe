import { sectionFeed } from '$lib/server/feeds.js';

/** @type {import('./$types').RequestHandler} */
export const GET = ({ platform }) => sectionFeed(platform, 'material', 'atom');
