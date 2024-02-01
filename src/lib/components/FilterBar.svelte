<script>
	import '$lib/types.d.js';
	import { filteredTags, visibleTags, userConfig, tagManager } from '$lib/utils/stores';
	import { scale } from 'svelte/transition';
	import TagGroup from './TagGroup.svelte';
	import { onMount } from 'svelte';
	import { page } from '$app/stores';

	export let event_toggle = true;

	/**@type string[]*/
	let orphanTags = [];
	onMount(() => {
		visibleTags.subscribe((v) => {
			orphanTags = v.filter((v) => $tagManager.get(v).orphan);
		});
		// @ts-ignore
		page.subscribe((p) => {
			if (p.url.searchParams.has('tags')) {
				if (p.url.searchParams.get('tags') != '') {
					//@ts-ignore
					filteredTags.set(p.url.searchParams.get('tags')?.split(','));
				}
			} else filteredTags.set([]);
		});
	});

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
				/>lista
			</label>
			<label>
				<input
					type="radio"
					name="display-type"
					id="display-type-grid"
					bind:group={$userConfig.display_type}
					value="grid"
				/>grilla
			</label>
		</div>
	</div>
	{#if event_toggle}
		<div class="option-group-wrapper">
			<div id="show-past-events" class="option-group">
				<label>
					<input
						type="radio"
						name="show-past-events"
						id="show-past-events-yes"
						bind:group={$userConfig.show_past_events}
						value={true}
					/>Mostrar
				</label>
				<label>
					<input
						type="radio"
						name="show-past-events"
						id="show-past-events-no"
						bind:group={$userConfig.show_past_events}
						value={false}
					/>Ocultar
				</label>
			</div>
			<div class="option-group-title">eventos pasados</div>
		</div>
	{/if}

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
		{@const tags = [
			...$tagManager
				.tagsData()
				.filter(
					(td) =>
						td?.parents?.includes('root') &&
						(td.getAllChildren().some((t) => $visibleTags.includes(t)) ||
							$visibleTags.includes(td.id))
				),
			$tagManager.get('misc', {
				children: $visibleTags
					.filter((v) => $tagManager.get(v).orphan)
					.sort((a, b) => a.localeCompare(b)),
				noname: true
			})
		]}
		<div class="tagfilters">
			{#each tags as tag, i (tag.id)}
				<div class="tag-group-container" in:scale={{ duration: 500 /*@ts-ignore*/ }}>
					<TagGroup {tag} gap={tag?.getColor() != tags[i + 1]?.getColor()} nested={false} />
				</div>
			{/each}
		</div>
	{/if}
</div>

<style lang="scss">
	.option-group-wrapper {
		display: flex;
		align-items: baseline;
		gap: 0.4em;
		width: auto;
		min-width: 0;
		height: auto;
		min-height: 0;
		margin-bottom: 1em;
		font-size: var(--step--1);
	}
	.option-group-title {
		color: var(--1);
	}
	.option-group {
		display: flex;
		align-items: baseline;
		justify-content: center;
		width: auto;
		min-width: 0;
		height: auto;
		min-height: 0;
		background: white;
		border-radius: 0.5em;
		outline: 1px solid var(--1);
		label {
			display: flex;
			align-items: baseline;
			cursor: pointer;
			color: var(--1);
			padding: 0.2em 0.3em;
			border-radius: 0.5em;
			flex: 1 1;
			transition: 200ms;
			&:has(input:checked) {
				background: var(--1);
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
		--gap: 1px;
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
	button {
		border: none;
		outline: 2px solid var(--1);
		border-radius: 0.5em;
		padding: 0.3em 0.6em;
		margin-bottom: 0.5em;
		color: var(--1);
		background: white;
		font-size: var(--step--1);
	}
</style>
