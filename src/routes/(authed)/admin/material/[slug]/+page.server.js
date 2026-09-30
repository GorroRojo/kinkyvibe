import { editorActions, editLoad } from '$lib/server/admin/contentRoutes.js';

export const load = editLoad('material');

/** @type {import('./$types').Actions} */
export const actions = editorActions('material');
