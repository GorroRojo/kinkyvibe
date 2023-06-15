<script>
	import { flip } from 'svelte/animate';
	import { fade } from 'svelte/transition';
	import Tag from './Tag.svelte';
	import { visibleTags, filteredTags } from '$lib/utils/stores';

	/** @type Group */
	export let group;

	/**
	 * @param {string} tag
	 */
	function togglePositiveTagFilter(tag) {
		filteredTags.update((fTags) =>
			!fTags.includes(tag)
				? [...fTags, tag]
				: [...fTags.slice(0, fTags.indexOf(tag)), ...fTags.slice(fTags.indexOf(tag) + 1)]
		);
	}

	/** @type {List} */
	let memberList = {
		items: group.members ?? [],
		classname: 'taglist',
		visible: group.members != undefined && group.members.length > 0
	};
	/** @type {List} */
	let subList = {
		items: group.sub ?? [],
		classname: 'subgroups',
		visible: group.sub != undefined && group.sub.length > 0
	};

	/**@type {List[]} */
	let lists = [memberList, subList].filter((i) => i.visible);
</script>

<div
	transition:fade
	class="filtergroup"
	style:--tag-color={group.color ?? 'inherit'}
	class:noname={!$visibleTags.includes(group.name)}
>
	{#if group.name}
		{#if $visibleTags.includes(group.name)}
			<span transition:fade class="groupname">
				<Tag
					tag={group.name}
					noBorder
					isCheckbox={$visibleTags.includes(group.name)}
					onInput={() => togglePositiveTagFilter(group.name)}
				/>
			</span>
		{/if}
	{/if}
	{#if group.members || group.sub}
		<div class="groupitems">
			{#each lists as list (list.classname)}
				<ul class={list.classname} transition:fade animate:flip>
					{#each list.items as item (typeof item == 'string' ? item : item.name)}
						<li animate:flip transition:fade>
							{#if typeof item == /**@ts-ignore*/ 'string'}
								<Tag
									tag={item}
									noBorder
									onInput={() => togglePositiveTagFilter(item)}
									isCheckbox={true}
								/>
							{:else}
								<svelte:self group={item} />
							{/if}
						</li>
					{/each}
				</ul>
			{/each}
		</div>
	{/if}
</div>

<style>
	.filtergroup {
		display: flex;
		border-radius: 1em;
		min-width: 0;
		align-items: center;
		font-family: sans-serif;
		transition: 200ms;
	}
	.filtergroup.noname {
		background: transparent;
	}
	.filtergroup:has(> .groupname :checked) {
		background: var(--tag-color);
	}

	.filtergroup,
	.taglist {
		--text-color: color-mix(in hsl, var(--tag-color) 80%, black);
		--faded-color: color-mix(in srgb, var(--tag-color) 10%, white);
		background: var(--faded-color);
		outline: 3px solid white;
		transition: 200ms;
	}

	:global(.filterbar > .filtergroup) {
		box-shadow: 0 0 0em -0em rgba(0, 0, 0, 0.3);
	}

	.taglist {
		display: flex;
		flex-wrap: wrap;
		border-radius: 1em;
		overflow: hidden;
		justify-content: center;
		align-items: center;
		min-width: 0;
	}
	.subgroups {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		flex-direction: row;
		row-gap: 0.3em;
		column-gap: 0.3em;
	}
	ul {
		margin: 0;
		padding: 0;
		transition: 700ms;
	}
	li {
		list-style: none;
		text-align: center;
		display: flex;
	}
	.taglist li {
		flex: 1 1;
	}
	:global(.taglist > li:has(:checked) + li:has(:checked)) {
		--border-radius: 0 2em 2em 0;
		border-left: 10px solid var(--tag-color);
		margin-left: -10px;
	}
	.groupname {
		color: var(--tag-color);
		--fill-color: transparent;
		transition: 200ms;
	}
	.groupname + .groupitems {
		margin-left: 5px;
	}
	.groupitems {
		display: flex;
		flex-direction: column;
		/* flex-wrap: wrap; */
		row-gap: 0.2em;
		column-gap: 0.6em;
		justify-content: center;
		transition: 200ms;
	}
</style>
