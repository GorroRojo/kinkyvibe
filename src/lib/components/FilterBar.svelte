<script>
	import '$lib/types.d.js';
	import { filteredTags, visibleTags, tagsConfig } from '$lib/utils/stores';
	import { groupMap } from '$lib/utils/index.js';
	import { fade, scale } from 'svelte/transition';
	import TagGroup from './TagGroup.svelte';
	import { onMount } from 'svelte';
	// @ts-ignore
	import { page } from '$app/stores';
	// @ts-ignore
	import { goto } from '$app/navigation';
	import { cubicOut } from 'svelte/easing';

	/**@param {HTMLElement} node
	 * @param {{from:DOMRect, to:DOMRect}} ends
	 * @param {any} params
	 * @returns {{
	 *  delay?: number,
	 *  duration?: number,
	 *  easing?: (t: number) => number,
	 *  css?: (t: number, u: number) => string,
	 *  tick?: (t: number, u: number) => void
	 * }}
	 */
	function betterflip(node, { from, to }, params) {
		const style = getComputedStyle(node);
		const transform = style.transform === 'none' ? '' : style.transform;

		const [ox, oy] = style.transformOrigin.split(' ').map(parseFloat);
		const dx = from.left + (from.width * ox) / to.width - (to.left + ox);
		const dy = from.top + (from.height * oy) / to.height - (to.top + oy);
		//@ts-ignore
		const { delay = 0, duration = (d) => Math.sqrt(d) * 120, easing = cubicOut } = params;

		return {
			delay,
			duration: typeof duration === 'function' ? duration(Math.sqrt(dx * dx + dy * dy)) : duration,
			easing,
			css: (t, u) => {
				const x = u * dx;
				const y = u * dy;
				// @ts-ignore
				const sx = t + (u * from.width) / to.width;
				// @ts-ignore
				const sy = t + (u * from.height) / to.height;

				return `transform: ${transform} translate(${x}px,${y}px)`; //${x}px, ${y}px)`; // scale(${sx}, ${sy});`;
			}
		};
	}

	/**@type Group[] */
	let filteredGroups = filterGroups($tagsConfig.groups, $visibleTags);
	/**@type string[]*/
	let orphanTags = [];
	onMount(() => {
		visibleTags.subscribe((v) => {
			orphanTags = getOrphanTags(v);
			filteredGroups = filterGroups($tagsConfig.groups, v);
		});
		// @ts-ignore
		page.subscribe((p)=>{
			if ($page.url.searchParams.has('tags')) {
				if ($page.url.searchParams.get('tags') != ''){
					//@ts-ignore
					filteredTags.set($page.url.searchParams.get('tags')?.split(','))
				}
			} else filteredTags.set([])
		})
	});

	/**
	 * @param {boolean} checked
	 * @param {string} tag
	 */
	function togglePositiveTagFilter(checked, tag) {
		if (checked) {
			filteredTags.update((fTags) => [...fTags, tag]);
		} else {
			filteredTags.update((fTags) => [
				...fTags.slice(0, fTags.indexOf(tag)),
				...fTags.slice(fTags.indexOf(tag) + 1)
			]);
		}
		$page.url.searchParams.set('tags', $filteredTags.join(','));
		goto(`?${$page.url.searchParams.toString()}`, {noScroll:true});
		// if ($filteredTags.length > 0) {
		// } else {
		// 	$page.url.searchParams.delete('tags');
		// 	if ($page.url.searchParams.entries.length == 0) {
		// 		goto('');
		// 	} else {
		// 		goto(`?${$page.url.searchParams.toString()}`);
		// 	}
		// }
	}

	/**
	 * @param {string[]} tags
	 * @returns string[]
	 */
	function getOrphanTags(tags) {
		return tags.filter((v) => !getAllMembersAndNames($tagsConfig.groups).includes(v));
	}

	/** @param {Group[]|Group} groups
	 * @returns {string[]}
	 */
	function getAllMembersAndNames(groups) {
		if (Array.isArray(groups)) {
			// console.log(groups);
			//@ts-ignore
			return groups.reduce((prev, g) => [...prev, ...getAllMembersAndNames(g)], []);
		} else {
			let accumulated = [groups.name];
			if (groups.members) {
				accumulated.push(...groups.members);
			}
			if (groups.sub) {
				accumulated.push(...getAllMembersAndNames(groups.sub));
			}
			return accumulated;
		}
	}

	/**
	 * @param {Group[]} groups
	 * @param {string[]} tags
	 * @returns Group[]
	 */
	function filterGroups(groups, tags) {
		return groups
			.map((group) =>
				groupMap(group, (g) => {
					if (g.members && g.members.length > 0) {
						return { ...g, members: g.members.filter((t) => tags.includes(t)) };
					} else if ((g.sub && g.sub.length > 0) || $visibleTags.includes(g.name)) {
						return { ...g };
					} else {
						return false;
					}
				})
			)
			.filter(isVisible);
	}

	/** @param {Group} group @returns boolean */
	function isVisible(group) {
		return (
			$visibleTags.includes(group.name) ||
			(group.members && group.members.length > 0) ||
			(group.sub && group.sub.length > 0 && group.sub.some(isVisible))
		);
	}
</script>

<div class="filterbar">
	{#each [...filteredGroups, { sub: [], members: orphanTags, name: 'misc' }] as group (group.name)}
		<div animate:betterflip={{ duration: 0 }} in:scale={{ duration: 500 /*@ts-ignore*/ }}>
			<TagGroup {group} onInput={(evt, tag) => togglePositiveTagFilter(evt.target?.checked, tag)} />
		</div>
	{/each}
</div>

<style>
	.filterbar {
		display: flex;
		flex-wrap: wrap;
		width: 100%;
		/* height: 10rem; */
		justify-content: center;
		align-items: center;
		--gap: 0.7em;
		gap: var(--gap);
		column-gap: calc(var(--gap) * 0.8);
		--tag-color: var(--1, indigo);
	}
	.filterbar div {
		display: flex;
		flex-direction: column;
		justify-content: center;
	}
</style>
