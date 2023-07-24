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

/** @type {import('svelte/store').Writable<{category:'amigues'|'calendario'|'material'|undefined, path: string}>} */
export const currentPostData = writable();

/** @type {import('svelte/store').Writable<(tag: string)=>(string)>} */
export const alias = writable((tag) => '');

/** @type {import('svelte/store').Writable<(a:string,b:string)=>string|void>} */
export const togglePositiveTagFilterFn = writable((a, b) => '');

/** @type import('svelte/store').Writable<{groups:Group[], tags:Record<string,TagProps>}> */
export const tagsConfig = writable();

/** @type import('svelte/store').Writable<{display_type: 'list'|'grid'}> */
export const userConfig = writable({display_type: 'list'});

if (browser) {
    try {
        userConfig.set(JSON.parse(localStorage.getItem('kinkyconfig') ?? '[object Object]' /** forcing an error without breaking typing */));
    } catch {
        // 
    } finally {
        userConfig.subscribe((v) => localStorage.setItem('kinkyconfig', JSON.stringify(v)));
    }
}
