import { listLoad, visibilityAction } from '$lib/server/admin/contentRoutes.js';

/** @type {import('./$types').PageServerLoad} */
export const load = listLoad('material');

/** @type {import('./$types').Actions} */
export const actions = { visibilidad: visibilityAction('material') };
