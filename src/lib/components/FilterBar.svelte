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
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { cubicOut } from 'svelte/easing';

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
	let view_filters = true;
	// $: view_filters = $filteredTags.length > 0 || view_filters;
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
	<!-- <label id="view_filters">
		<input
			type="checkbox"
			name="view_filters"
			disabled={$filteredTags.length > 0}
			bind:checked={view_filters}
		/> Ver filtros
	</label> --> 
	{#if $filteredTags.length > 0}
		<div class="tag-group-container">
			<button
				on:click={() => {
					$filteredTags = [];
					$page.url.searchParams.delete('tags');
					window.history.replaceState('', '', $page.url);
				}}>Despejar filtros</button
			>
		</div>
	{/if}
	{#if view_filters || $filteredTags.length > 0}
		<div class="tagfilters">
			{#each [...filteredGroups, { sub: [], members: orphanTags, name: 'misc', noname: true }] as group (group.name)}
				<div class="tag-group-container" in:scale={{ duration: 500 /*@ts-ignore*/ }}>
					<TagGroup {group} />
				</div>
			{/each}
		</div>
	{/if}
</div>

<style lang="scss">
	#view_filters {
		display: block;
		width: 100%;
		max-width: 50rem;
		margin-inline: auto;
		font-size: var(--step-0);
		text-align: center;
		margin-block: 0.4em;
	}
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
		--gap: 1em;
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
			max-width: 20rem;
		}
		.groupname {
			width: 100%;
		}
	}
	@media screen and (min-width: 1300px) {
	}
</style>
