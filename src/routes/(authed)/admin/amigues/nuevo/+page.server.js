import { editorActions, newLoad } from '$lib/server/admin/contentRoutes.js';

/** @type {import('./$types').PageServerLoad} */
export const load = newLoad('amigues');

/** @type {import('./$types').Actions} */
export const actions = editorActions('amigues');
