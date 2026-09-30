import { editorActions, newLoad } from '$lib/server/admin/contentRoutes.js';

export const load = newLoad('amigues');

/** @type {import('./$types').Actions} */
export const actions = editorActions('amigues');
