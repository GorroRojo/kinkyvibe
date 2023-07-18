import { writable } from 'svelte/store';
import '$lib/types.d.js';
export const view_date = writable(new Date());
export const month_change_direction = writable(1);

/** @type {import('svelte/store').Writable<string[]>} */
export const filteredTags = writable([]);
/** @type {import('svelte/store').Writable<string[]>} */
export const visibleTags = writable([]);
/** @type {import('svelte/store').Writable<string[]>} */
export const allTags = writable([]);

/** @type {import('svelte/store').Writable<{category:'amigues'|'calendario'|'material'|'', path: string}>} */
export const currentPostData = writable(''); 


/** @type import('svelte/store').Writable<{groups:Group[], tags:Record<string,TagProps>}> */
export const tagsConfig = writable();
