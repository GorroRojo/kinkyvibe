<script context="module">
	import MiniMarkup from './MiniMarkup.svelte';
	import { flip } from 'svelte/animate';
	import { tagsConfig, glosario } from '$lib/utils/stores';
	import GlosarioItem from './GlosarioItem.svelte';
	export let entries;
</script>

<script>
	//@ts-nocheck

	/**@type {(description:string)=>Array<{type:string,line:string}>|undefined}*/
	function parseDescription(description, query) {
		const regex = /\[\[([^\]]*)\]\]/g;
		const lines = description
			.split(regex)
			.map((line, index) => ({ line, type: index % 2 == 0 ? 'text' : 'link' }))
			.map(({ line, type }) => {
				if (query != '' && line.includes(query)) {
					let parts = line.split(query);
					return parts
						.map((p, i) =>
							i % 2 == 0
								? [
										{ line: p, type },
										{ line: query, type: 'mark' }
								  ]
								: { line: p, type }
						)
						.flat();
				} else return { line, type };
			})
			.flat()
			.filter(({ line, type }) => line !== '');
		return lines.length > 0 ? lines : undefined;
	}

	/** @type {(termino:string, groups?: Group[])=>Array<Group>}*/
	function getGroups(termino, groups = $tagsConfig.groups) {
		let matches = [];
		for (let group of groups) {
			if (group.name == termino) {
				matches.push({ ...group });
			} else {
				if (group.members && group.members.includes(termino)) {
					matches.push({ ...group });
				}
				if (group.sub) {
					const sub = getGroups(termino, group.sub);
					if (sub) matches.push(...sub);
				}
			}
		}
		return matches.filter((i) => i);
	}
	/**@type {{meta:AnyPostData,path:string}[]}*/
	export let entries;

	/**@type {Group[]|string[]|{meta:AnyPostData,path:string}[]}}*/
	export let items;

	// export let searched = false;
	export let query = '';
	/**@ts-ignore*/
	const type = typeof items[0] == 'string' ? 'string' : items[0]?.name ? 'group' : 'entry';

	export let spare = false;

	// if (type == 'string') {
	// 	type == 'entry';
	// 	items = items.map((name) => entries.find((e) => e.meta.wiki == name?.replaceAll(' ', '-')));
	// }
</script>

<!-- <dl> -->

{#if type == 'group' && !spare && items.map((i) => i.name).join('') == $tagsConfig.groups
			.map((g) => g.name)
			.join('')}
	<svelte:self
		{entries}
		items={$glosario.terminos
			.filter((t) => t?.spare && t?.visible)
			.map((/** @type {{ name: string; }} */ t) => t.name)}
		{spare}
		{query}
	/>
{:else if type === 'entry'}
	{items.filter((t) => t?.spare && t?.visible).length}
	{#each items.filter((t) => t?.spare && t?.visible) as item (item.name)}
		<div animate:flip>
			<GlosarioItem {item} {entries} {query} {type} {spare} />
		</div>
	{/each}
{:else}
	{#each items as item (item)}
		<div>
			<GlosarioItem {item} {entries} {query} {type} {spare} />
		</div>
	{/each}
{/if}

<!-- </dl> -->
