<script>
	// import { setContext } from 'svelte';
	import '$lib/types.d.js';
	import { filteredTags, visibleTags, tagsConfig } from '$lib/utils/stores';
	import { groupMap } from '$lib/utils/index.js';
	import { flip } from 'svelte/animate';
	import { fade, scale } from 'svelte/transition';
	import TagGroup from './TagGroup.svelte';
	import { onMount } from 'svelte';
	import { json } from '@sveltejs/kit';
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
				const sx = t + (u * from.width) / to.width;
				const sy = t + (u * from.height) / to.height;

				return `transform: ${transform} translate(${x}px,${y}px)`//${x}px, ${y}px)`; // scale(${sx}, ${sy});`;
			}
		};
	}


	/**@type Group[] */
	let filteredGroups = filterGroups($tagsConfig.groups, $visibleTags);
	// $: console.log('changed', filteredGroups);
	/**@type string[]*/
	let orphanTags = [];
	// console.log(orphanTags)
	// console.log($visibleTags)
	onMount(() => {
		// console.log(filteredGroups);
		visibleTags.subscribe((v) => {
			orphanTags = getOrphanTags(v);
			filteredGroups = filterGroups($tagsConfig.groups, v);
			console.log('before', orphanTags);
			console.log('after', orphanTags);
			// alert(JSON.stringify(filteredGroups))
		});
	});

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

	// function isTagVisible(/**@type {string}*/ tag) {
	// 	return $visibleTags.includes(aliasTag(tag));
	// }

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

<!-- <br />
filtered groups<br />
{#each filteredGroups as group}
	## {group.name} ##<br />
	{#if group.members} - {JSON.stringify(group.members)}<br />{/if}
	{#if group.sub} - {JSON.stringify(group.sub)}<br />{/if}
{/each}
<br />orphan tags<br />
{orphanTags} -->

<div class="filterbar">
	{#each [...filteredGroups, { sub: [], members: orphanTags, name: 'misc' }] as group (group.name)}
		<div animate:betterflip={{ duration: 0 }} in:scale={{duration: 500}}>
			<TagGroup {group} />
		</div>
	{/each}
</div>

<style>
	.filterbar {
		display: flex;
		flex-wrap: wrap;
		width: 100%;
		justify-content: center;
		align-items: flex-start;
		--gap: 0.7em;
		gap: var(--gap);
		column-gap: calc(var(--gap) * 0.8);
		--tag-color: var(--1, indigo);
	}
	.filterbar div {
		height: 4em;
		display: flex;
		flex-direction: column;
		justify-content: center;
	}
</style>
