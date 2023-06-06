import { writable } from 'svelte/store';

export const view_date = writable(new Date());
export const month_change_direction = writable(1);