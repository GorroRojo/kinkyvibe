<script>
	import '$lib/types.d.js';
	import { filteredTags, visibleTags, userConfig, tagManager } from '$lib/utils/stores';
	import { scale } from 'svelte/transition';
	import TagGroup from './TagGroup.svelte';
	import { onMount } from 'svelte';
	import { page } from '$app/stores';

	export let event_toggle = true;

	/** @type {(termino:string)=>(ProcessedTag)[]}*/
	function getGroups(termino) {
		let tag = $tagManager.get(termino);
		return tag ? [tag] : [];
	}
	let tagsAsGroups = $tagManager
		.entries()
		.filter(([id, { parents }]) => parents?.includes('root'))
		.map(([tag]) => getGroups(tag))
		.flat();

	/**@type ProcessedTag[] */
	let filteredGroups = filterGroups(tagsAsGroups, $visibleTags);
	/**@type string[]*/
	let orphanTags = [];
	let orphanGroup = { /**@type {()=>(string)}*/ getColor: () => undefined, getAllChildren: () => [], sub: orphanTags.map($tagManager.get), id: 'misc', noname: true }
	onMount(() => {
		visibleTags.subscribe((v) => {
			orphanTags = getOrphanTags(v);
			orphanGroup = { /**@type {()=>(string)}*/ getColor: () => undefined, getAllChildren: () => [], sub: orphanTags.map($tagManager.get), id: 'misc', noname: true }
			filteredGroups = filterGroups(tagsAsGroups, v);
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
	 * @param {string[]} tags
	 * @returns string[]
	 */
	function getOrphanTags(tags) {
		return tags.filter((v) => !$tagManager.tags().includes(v));
	}

	/**
	 * @param {ProcessedTag[]} groups
	 * @param {string[]} tags
	 * @returns ProcessedTag[]
	 */
	function filterGroups(groups, tags) {
		return groups.filter((g) => g.getAllChildren().some((t) => tags.includes(t)));
	}

	let view_filters = true;
</script>

<div class="filterbar">
	<div class="option-group-wrapper">
		<div class="option-group-title">Ver como</div>
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
	</div>
	{#if event_toggle}
		<div class="option-group-wrapper">
			<div class="option-group-title">Mostrar eventos pasados</div>
			<div id="show-past-events" class="option-group">
				<label>
					<input
						type="radio"
						name="show-past-events"
						id="show-past-events-yes"
						bind:group={$userConfig.show_past_events}
						value={true}
					/>Si
				</label>
				<label>
					<input
						type="radio"
						name="show-past-events"
						id="show-past-events-no"
						bind:group={$userConfig.show_past_events}
						value={false}
					/>No
				</label>
			</div>
		</div>
	{/if}
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
			{#each [...filteredGroups, orphanGroup] as group (group.id)}
				<div class="tag-group-container" in:scale={{ duration: 500 /*@ts-ignore*/ }}>
					<TagGroup tag={group} />
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
	.option-group-wrapper {
		display: flex;
		/* flex-direction: column; */

		align-items: center;
		gap: 0.6em;
		width: auto;
		min-width: 0;
		height: auto;
		min-height: 0;
	}
	.option-group-title {
		color: var(--1);
		font-size: 1.1em;
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
