import { editorActions, editLoad } from '$lib/server/admin/contentRoutes.js';

export const load = editLoad('amigues');

/** @type {import('./$types').Actions} */
export const actions = editorActions('amigues');
