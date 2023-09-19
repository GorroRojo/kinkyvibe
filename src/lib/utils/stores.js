/* eslint-disable no-unused-vars */
import { writable } from 'svelte/store';
import { browser } from '$app/environment';
import '$lib/types.d.js';
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

/** @type {import('svelte/store').Writable<(tag: string)=>(string)>} */
export const alias = writable((tag) => '');

/** @type {import('svelte/store').Writable<(a:boolean,b:string)=>string|void>} */
export const togglePositiveTagFilterFn = writable((a, b) => '');

/** @type import('svelte/store').Writable<{groups:Group[], tags:Record<string,TagProps>}> */
export const tagsConfig = writable();

/** @type import('svelte/store').Writable<{display_type: 'list'|'grid'}> */
export const userConfig = writable({ display_type: 'list' });

/** @type import('svelte/store').Writable<{terminos:{name:string,description:string,related?:string[]}[]}> */
export const glosario = writable({terminos:[]});

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
