import { editorActions, newLoad } from '$lib/server/admin/contentRoutes.js';

export const load = newLoad('material');

/** @type {import('./$types').Actions} */
export const actions = editorActions('material');
