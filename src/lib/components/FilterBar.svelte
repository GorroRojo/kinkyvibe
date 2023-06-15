<script>
	// import { setContext } from 'svelte';
	import '$lib/types.d.js';
	import { filteredTags, visibleTags, tagsConfig } from '$lib/utils/stores';
	import { groupMap } from '$lib/utils/index.js';
	import { flip } from 'svelte/animate';
	import { fade } from 'svelte/transition';
	import TagGroup from './TagGroup.svelte';
	import { onMount } from 'svelte';
	import { json } from '@sveltejs/kit';

	/**@type Group[] */
	$: filteredGroups = filterGroups($tagsConfig.groups, $visibleTags);

	/**@type string[]*/
	let orphanTags = [];
	// console.log(orphanTags)
	// console.log($visibleTags)
	onMount(() => {
		console.log(filteredGroups);
		visibleTags.subscribe((v) => {
			orphanTags = getOrphanTags(v);
			filteredGroups = filterGroups($tagsConfig.groups, v)
		});
	});

	/**
	 * @param {string[]} tags
	 * @returns string[]
	 */
	function getOrphanTags(tags) {
		return tags.filter((v) => !getAllMembersAndNames(filteredGroups).includes(v));
	}

	/** @param {Group[]|Group} groups
	 * @returns {string[]}
	 */
	function getAllMembersAndNames(groups) {
		if (Array.isArray(groups)) {
			console.log(groups);
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
		return groups.map((group) =>
			groupMap(group, (g) => {
				if (g.members) {
					// console.log('members', g.members)
					// console.log('tags to filter', tags)
					return { ...g, members: g.members.filter((t) => tags.includes(t)) };
				} else {
					return { ...g };
				}
			})
		);
	}
</script>

<br />
filtered groups<br />
{#each filteredGroups as group}
	## {group.name} ##<br />
	{#if group.members} - {JSON.stringify(group.members)}<br />{/if}
	{#if group.sub} - {JSON.stringify(group.sub)}<br />{/if}
{/each}
<br />orphan tags<br />
{orphanTags}

<div class="filterbar">
	{#each [...filteredGroups, { members: orphanTags, name: 'misc' }] as group (group.name)}
		<div animate:flip={{ duration: 700 }} transition:fade>
			{group.name}
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
		align-items: center;
		--gap: 0.7em;
		gap: var(--gap);
		column-gap: calc(var(--gap) * 0.8);
		--tag-color: var(--1, indigo);
	}
	/* .filterbar div {
		transition: 700ms;
	} */
</style>
