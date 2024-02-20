/* eslint-disable no-unused-vars */
import { writable } from 'svelte/store';
import { browser } from '$app/environment';
import '$lib/types.d.js';
import tagsFactory from './tags';
export const view_date = writable(new Date());
export const month_change_direction = writable(1);

/** @type {import('svelte/store').Writable<string[]>} */
export const filteredTags = writable([]);
/** @type {import('svelte/store').Writable<string[]>} */
export const visibleTags = writable([]);
/** @type {import('svelte/store').Writable<string[]>} */
export const allTags = writable([]);
/** @type {import('svelte/store').Writable<Set<string>>} */
export const redundantTags = writable(new Set());

/** @type {import('svelte/store').Writable<{category:'amigues'|'calendario'|'material'|'wiki'|undefined, path: string}>} */
export const currentPostData = writable();

/** @type {import('svelte/store').Writable<(a:boolean,b:string)=>string|void>} */
export const togglePositiveTagFilterFn = writable((a, b) => '');

/**@type {import('svelte/store').Writable<TagManager>} */
export const tagManager = writable(tagsFactory());

/** @type import('svelte/store').Writable<{display_type: 'list'|'grid', show_past_events: boolean}> */
export const userConfig = writable({ display_type: 'list', show_past_events: false });

/**@type {import('svelte/store').Writable<TagManager>} */
export const wikiTagManager = writable(tagsFactory());

/**@type {import('svelte/store').Writable<string>} */
export const query = writable('');

if (browser) {
	try {
		userConfig.set(
			JSON.parse(
				localStorage.getItem('kinkyconfig') ??
					'[object Object]' /** forcing an error without breaking typing */
			)
		);
	} catch {
		//
	} finally {
		userConfig.subscribe((v) => localStorage.setItem('kinkyconfig', JSON.stringify(v)));
	}
}
