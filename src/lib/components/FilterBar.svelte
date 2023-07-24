<script>
	import '$lib/types.d.js';
	import {
		filteredTags,
		visibleTags,
		tagsConfig,
		togglePositiveTagFilterFn,
		userConfig
	} from '$lib/utils/stores';
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
		page.subscribe((p) => {
			if ($page.url.searchParams.has('tags')) {
				if ($page.url.searchParams.get('tags') != '') {
					//@ts-ignore
					filteredTags.set($page.url.searchParams.get('tags')?.split(','));
				}
			} else filteredTags.set([]);
		});
	});

	/**
	 * @param {boolean} checked
	 * @param {string} tag
	 */
	// function togglePositiveTagFilter(checked, tag) {
	// 	if (checked) {
	// 		filteredTags.update((fTags) => [...fTags, tag]);
	// 	} else {
	// 		filteredTags.update((fTags) => [
	// 			...fTags.slice(0, fTags.indexOf(tag)),
	// 			...fTags.slice(fTags.indexOf(tag) + 1)
	// 		]);
	// 	}
	// 	$page.url.searchParams.set('tags', $filteredTags.join(','));
	// 	goto(`?${$page.url.searchParams.toString()}`, { noScroll: true });
	// }

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
	<div id="display-type" class="option-group">
		<label>
			<input
				type="radio"
				name="display-type"
				id="display-type-list"
				bind:group={$userConfig.display_type}
				value="list"
			/>Lista
		</label>
		<label>
			<input
				type="radio"
				name="display-type"
				id="display-type-grid"
				bind:group={$userConfig.display_type}
				value="grid"
			/>Grilla
		</label>
	</div>
	<div class="tagfilters">
		{#each [...filteredGroups, { sub: [], members: orphanTags, name: 'misc' }] as group (group.name)}
			<div
				class="tag-group-container"
				animate:betterflip={{ duration: 0 }}
				in:scale={{ duration: 500 /*@ts-ignore*/ }}
			>
				<TagGroup
					{group}
					onInput={(evt, tag) => $togglePositiveTagFilterFn(evt.target?.checked, tag)}
				/>
			</div>
		{/each}
	</div>
</div>

<style lang="scss">
	.option-group {
		display: flex;
		gap: 0.2em;
		align-items: center;
		justify-content: center;

		width: auto;
		min-width: 0;
		height: auto;
		min-height: 0;
		/* margin-bottom: 1em; */
		background: white;
		border-radius: 0.5em;
		outline: 2px solid var(--1);
		label {
			display: flex;
			align-items: center;
			gap: 0.5em;
			cursor: pointer;
			color: var(--1);
			padding: 0.5em;
			border-radius: 0.5em;
			flex: 1 1;
			transition: 200ms;
			outline: 2px solid transparent;
			&:has(input:checked) {
				background: var(--1);
				outline: 2px solid var(--1);
				color: white;
			}
		}
		input {
			display: none;
		}
	}
	.filterbar {
		display: flex;
		flex-direction: column;
		/* flex-wrap: wrap; */
		width: 100%;
		/* height: 10rem; */
		--gap: 0.7em;
		gap: var(--gap);
		justify-content: center;
		align-items: center;
		column-gap: calc(var(--gap) * 0.8);
		--tag-color: var(--1, indigo);
		max-width: min(100%, 100dvw);
		/* container-type: inline-size; */
	}
	.tagfilters {
		gap: var(--gap);
		display: flex;
		flex-direction: row;
		flex-wrap: wrap;
		justify-content: center;
		max-width: min(100dvw, 100%);
	}
	.tag-group-container {
		display: flex;
		flex-direction: column;
		justify-content: center;
		max-width: 100%;
	}
	@container (min-width: 1300px) {
		.tagfilters {
			flex-direction: column;
		}
		.groupname {
			width: 100%;
		}
	}
	@media screen and (min-width: 1300px) {
	}
</style>
