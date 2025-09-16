<script>
	import TagGroup from './TagGroup.svelte';
	import { scale } from 'svelte/transition';
	import Tag from './Tag.svelte';
	import { filteredTags, parentsOfVisibleTags, tagManager, visibleTags } from '$lib/utils/stores';
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import { togglePositiveTagFilterFn } from '$lib/utils/stores';

	/** @type {{tag: ProcessedTag, gap?: boolean, nested?: boolean, onInput?: any}} */
	let {
		tag,
		gap = false,
		nested = true,
		onInput = (/** @type {{ target: { checked: boolean; }; }} */ evt, /** @type {string} */ t) =>
			$togglePositiveTagFilterFn(evt.target?.checked, t)
	} = $props();

	/** @param {string} tagID
	 *  @return {boolean}
	 */
	function isVisible(tagID) {
		return $visibleTags.includes(tagID) || $parentsOfVisibleTags.includes(tagID);
	}
	let mounted = $state(false);
	onMount(() => (mounted = true));
	let noname = tag.noname;
	let checked = $derived($filteredTags.includes(tag.id));
</script>

<div
	in:scale|global={{ duration: 500 }}
	class="filtergroup"
	style:--tag-color={tag.getColor() ?? 'inherit'}
	class:noname
	class:nested
	class:gap
>
	{#if !noname}
		<span in:scale|global={{ duration: 500 }} class="groupname">
			<Tag
				tag={tag.visible_name + (tag.children && tag.children.length > 0 ? ' »' : '')}
				icon={tag.icon ?? ''}
				name={tag.id}
				noBorder
				isCheckbox
				onInput={(/** @type {{ target: HTMLInputElement; }} */ evt) => onInput(evt, tag.id)}
				{checked}
			/>
		</span>
	{/if}
	{#if tag.children && tag.children.some(isVisible)}
		<ul class="groupitems" in:scale|global={{ duration: 500 }}>
			{#each tag.children.filter(isVisible) ?? [] as item (item)}
				{@const subTag = $tagManager.get(item)}
				<li in:scale|global={{ duration: 500 }}>
					{#if !subTag?.children || subTag.children.length == 0}
						{#if mounted}
							<Tag
								onInput={(/** @type {{ target: HTMLInputElement; }} */ evt) =>
									onInput(evt, subTag?.id ?? item)}
								tag={item}
								icon={subTag.icon ?? ''}
								isCheckbox
								checked={page.url.searchParams.get('tags')?.split(',')?.includes(item)}
								noBorder
								--off-background="color-mix(in srgb, white 35%, transparent)"
								--text-color="color-mix(in srgb, black 15%, var(--tag-color)"
							/>
						{:else}
							<Tag
								tag={item}
								icon={subTag.icon ?? ''}
								--filled-text-color="var(--text-color, var(--tag-color))"
								--filled-outline="none"
								--filled-outline-offset="0"
								--fill-color="transparent"
							/>
						{/if}
					{:else if subTag}
						<TagGroup tag={subTag} />
					{/if}
				</li>
			{/each}
		</ul>
	{/if}
</div>

<style langs="scss">
	.filtergroup {
		display: flex;
		border-radius: 0.3em;
		flex-direction: column;
		min-width: 0;
		align-items: stretch;
		--border-radius: 0.3em;
		transition: 100ms;
		justify-content: center;
		flex-wrap: wrap;
		width: 100%;
		--text-color: color-mix(in hsl, var(--tag-color) 100%, black);
		--faded-color: color-mix(in srgb, var(--tag-color) 2%, white);
		background: var(--faded-color);
	}
	.filtergroup:has(:global(> .groupname :checked)) {
		outline: 3px solid var(--tag-color);
		background: color-mix(in srgb, white 60%, transparent);
	}
	:global(.filtergroup:has(li)),
	:global(.filtergroup:has(span)) {
		box-shadow: -2px 0 var(--tag-color);
		outline: 1px solid color-mix(in srgb, var(--tag-color) 10%, transparent);
	}
	.filtergroup.nested {
		outline-color: var(--tag-color);
	}

	:global(.filterbar > .filtergroup) {
		outline: 2px solid var(--tag-color);
		/* box-shadow: 0 0 0em -0em rgba(0, 0, 0, 0.3); */
	}

	:global(.filterbar .groupitems:has(li)) {
		margin: 0;
		opacity: 1;
	}
	ul {
		justify-content: center;
		flex-wrap: wrap;
		padding: 0;
		max-width: 100%;
	}
	li {
		list-style: none;
		/* text-align: center; */
		display: flex;
		align-items: stretch;
		/* height: 0; */
	}
	:global(.filtergroup .groupitems li:has(li)),
	:global(.filtergroup .groupitems li:has(label)) {
		height: unset;
	}

	.groupname {
		display: flex;
		justify-content: stretch;
		flex: 1 1;
		/* text-align: center; */
	}
	:global(.groupname:has(:checked)) {
		--border-radius: 0.3em 0.3em 0 0;
	}
	.groupitems {
		flex-direction: column;
		row-gap: 1px;
		column-gap: 0.6em;
		justify-content: stretch;
	}
	.groupitems {
		display: none;
	}
	:global(.groupname:has(:checked) + .groupitems),
	:global(.groupname:has(span) + .groupitems),
	:global(.groupitems:has(:checked)) {
		display: flex;
	}
	:global(.filtergroup:has(:checked)),
	.filtergroup.noname {
		margin-block: 0.5em;
	}
	.filtergroup.gap {
		margin-block-end: 0;
		margin-inline-end: 0.5em;
	}
	.noname > .groupitems {
		display: flex;
	}
	@container (min-width: 1300px) {
		.groupname {
			width: 100%;
		}
		.filtergroup.gap {
			margin-block-end: 0.5em;
			margin-inline-end: 0;
		}
	}
</style>
