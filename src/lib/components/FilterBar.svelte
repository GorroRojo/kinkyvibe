<script>
	// import { setContext } from 'svelte';
	import '$lib/types.d.js';
	import { filteredTags, visibleTags, tagsConfig } from '$lib/utils/stores';
	import { flip } from 'svelte/animate';
	import { fade } from 'svelte/transition';
	import TagGroup from './TagGroup.svelte';
	

	// $: orphanTags = $visibleTags.filter(
	// 	(t) => !Object.entries($tagsConfig.groups).reduce(
	// 	//@ts-ignore
	// 	(all, [name, g]) => [...all, ...getMembers(g)],
	// 	[]
	// ).includes(t) && !Object.entries($tagsConfig.groups)
	// 	.map((g) => getNames(g))
	// 	.flat().includes(t)
	// );

	/**@param {string} tag @returns {string}*/
	function aliasTag(tag) {
		let result = tag;
		let max = 20;
		while (
			Object.hasOwn($tagsConfig.tags, result) &&
			Object.hasOwn($tagsConfig.tags[result], 'aliasOf')
		) {
			//@ts-ignore
			result = $tagsConfig.tags[tag].aliasOf;
			if (max-- < 0) {
				console.error('too many aliases: ' + tag);
				break;
			}
			max--;
		}
		return result;
	}

	/**
	 * @param {[string,{sub:*}]} group
	 * @returns {string[]}
	 */
	function getNames([name, { sub }]) {
		if (sub) return [name, ...Object.entries(sub).map(getNames).flat()];
		return [name];
	}
	/**
	 *
	 * @param {{members:string[],sub:*}} group
	 * @returns {string[]}
	 */
	function getMembers({ members, sub }) {
		let /** @type {string[]} */ allMembers = [];
		if (members) {
			allMembers = [...allMembers, ...members];
		}
		if (sub) {
			allMembers = [
				...allMembers,
				...Object.entries(sub)
					.map(([name, sg]) => getMembers(sg))
					.flat()
			];
		}
		return allMembers;
	}

	function isTagVisible(/**@type {string}*/ tag) {
		return $visibleTags.includes(aliasTag(tag));
	}



	/** @param {Group} group @return {Group|false}*/
	// function filterGroup(group) {
	// 	let neo = { ...group };
	// 	if (group.sub) {
	// 		neo.sub = filterGroups(group.sub);
	// 	}
	// 	if (group.members) {
	// 		neo.members = group.members.filter(isTagVisible).map(aliasTag);
	// 	}
	// 	neo.name = aliasTag(neo.name);

	// 	const noSub = !neo.sub || neo.sub.length == 0;
	// 	const noMembers = !neo.members || neo.members.length == 0;
	// 	const noVisibleName = !isTagVisible(neo.name);

	// 	if (noSub && noMembers && noVisibleName) {
	// 		return false;
	// 	} else {
	// 		return neo;
	// 	}
	// }

	/**@param {Group[]} groupArr @return {Group[]}*/
	// function filterGroupArray(groupArr) {
		// @ts-ignore
	// 	return ;
	// }

	/**@param{*} g @returns{Group[]}*/
	function groupsToGroupArray(g) {
		return Object.entries(g).map(([name, other]) => ({ name, ...other }));
	}
	/**@param{*} g @returns{Group[]}*/
	// function filterGroups(g) {
	// 	if (!Array.isArray(g)) g = groupsToGroupArray(g);
		// return g.map(g).filter((i) => i != false);
	// }

	/**@type Group[] */
	let filteredGroups = [];

	// filteredTags.subscribe((filteredTags) => (filteredGroups = filterGroups($tagsConfig.groups)));
	// $: filteredGroups = filterGroups(groups);
</script>

<div class="filterbar">
	<!-- {#each [...filteredGroups, { members: orphanTags, name: 'misc' }] as group (group.name)} -->
		<!-- <div animate:flip={{ duration: 700 }} transition:fade> -->
			<!-- {group.name} -->
			<!-- <TagGroup {group} /> -->
		<!-- </div> -->
	<!-- {/each} -->
	
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
