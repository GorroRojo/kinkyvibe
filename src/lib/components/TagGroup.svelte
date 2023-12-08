<script>
	import { scale } from 'svelte/transition';
	import Tag from './Tag.svelte';
	import { tagManager, visibleTags } from '$lib/utils/stores';
	import { page } from '$app/stores';
	import { onMount } from 'svelte/internal';
	import { togglePositiveTagFilterFn } from '$lib/utils/stores';

	/** @type ProcessedTag */
	export let tag;

	/**@type{(evt: {target: HTMLInputElement}, tag: string)=>*}*/
	export let onInput = (evt, t) => $togglePositiveTagFilterFn(evt.target?.checked, t);

	/** @param {string} tagID
	 *  @return {boolean}
	 */
	function isVisible(tagID) {
		let t = $tagManager.get(tagID);
		return (
			($visibleTags.includes(tagID) ||
				(t?.children && t.children.length > 0 && t.children.some((s) => isVisible(s)))) ??
			false
		);
	}
	/**@param {string[]} sub @returns boolean*/
	let isSubListVisible = (sub) => sub && sub.length > 0 && sub.some(isVisible);
	let mounted = false;
	onMount(() => (mounted = true));

	let noname =
		// group.noname ||
		!(
			$visibleTags.includes(tag.id) ||
			tag.getAllChildren().some((t) => $visibleTags.includes(t))
		);
</script>

<div
	in:scale={{ duration: 500 }}
	class="filtergroup"
	style:--tag-color={tag.color ?? 'inherit'}
	class:noname
>
	{#if tag.id && !noname}
		<span in:scale={{ duration: 500 }} class="groupname">
			<Tag
				tag={tag.visible_name + (tag.children && tag.children.length > 0 ? ' »' : '')}
				name={tag.id}
				noBorder
				isCheckbox
				onInput={(/** @type {{ target: HTMLInputElement; }} */ evt) => onInput(evt, tag.id)}
				checked={$page.url.searchParams.has('tags') &&
					$page.url.searchParams.get('tags')?.split(',').includes(tag.id)}
			/>
		</span>
	{/if}
	{#if isSubListVisible(tag.children ?? [])}
		<div in:scale={{ duration: 500 }} class="groupitems">
			<ul class="subgroups" in:scale={{ duration: 500 }}>
				{#each tag.children ?? [] as item (item)}
					{@const subTag = $tagManager.get(item)}
					<li in:scale={{ duration: 500 }}>
						{#if typeof item == 'string'}
							{#if mounted}
								<Tag
									onInput={(/** @type {{ target: HTMLInputElement; }} */ evt) =>
										onInput(evt, subTag?.id ?? item)}
									tag={item}
									isCheckbox
									checked={$page.url.searchParams.has('tags') &&
										$page.url.searchParams.get('tags')?.split(',').includes(item)}
									noBorder
								/>
							{:else}
								<Tag
									tag={item}
									--filled-text-color="var(--text-color, var(--tag-color))"
									--filled-outline="none"
									--filled-outline-offset="0"
									--fill-color="transparent"
								/>
							{/if}
						{:else}
							<svelte:self group={subTag} />
						{/if}
					</li>
				{/each}
			</ul>
		</div>
	{/if}
</div>

<style langs="scss">
	.filtergroup {
		display: flex;
		border-radius: 0.3em;
		flex-direction: column;
		min-width: 0;
		align-items: center;
		font-family: sans-serif;
		--border-radius: 0.3em;
		transition: 100ms;
		/* outline: 3px solid transparent; */
		justify-content: center;
		flex-wrap: wrap;
	}
	.filtergroup.noname {
		outline-color: transparent;
		background: transparent;
		box-shadow: none;
	}
	.filtergroup.noname ul {
		align-items: center;
	}
	.filtergroup:has(> .groupname :checked) {
		outline: 3px solid var(--tag-color);
		background: color-mix(in srgb, var(--tag-color) 10%, transparent);
	}

	.filtergroup,
	.taglist {
		--text-color: color-mix(in hsl, var(--tag-color) 100%, black);
		--faded-color: color-mix(in srgb, var(--tag-color) 2%, white);
		background: var(--faded-color);
	}
	:global(.taglist:has(li)),
	:global(.filtergroup:has(li)),
	:global(.filtergroup:has(span)) {
		box-shadow: -2px 0 var(--tag-color);
		outline: 1px solid var(--tag-color);
	}

	:global(.filterbar > .filtergroup) {
		outline: 2px solid var(--tag-color);
		/* box-shadow: 0 0 0em -0em rgba(0, 0, 0, 0.3); */
	}

	.taglist {
		border-radius: 0.3em;
		overflow: hidden;
		align-items: center;
		min-width: 0;
	}
	.subgroups {
		flex-direction: column;
		align-items: center;
		row-gap: 0.3em;
		column-gap: 0.3em;
	}
	:global(.filterbar .filtergroup ul:has(li)) {
		margin: 0;
		opacity: 1;
	}
	ul {
		display: flex;
		justify-content: center;
		flex-wrap: wrap;
		margin: -0.1em -0.6em;
		padding: 0;
		opacity: 0;
		max-width: 100%;
		/* transition: 700ms; */
	}
	li {
		list-style: none;
		text-align: center;
		display: flex;
		/* height: 0; */
	}
	:global(.filtergroup .groupitems li:has(li)),
	:global(.filtergroup .groupitems li:has(label)) {
		height: unset;
	}
	.taglist li {
		border-left: 1px solid color-mix(in srgb, var(--tag-color) 60%, transparent);
	}
	.taglist li:first-child {
		border-left: none;
	}
	.taglist li:last-child {
		border-right: 1px solid color-mix(in srgb, var(--tag-color) 60%, transparent);
	}
	:global(.taglist > li.checked + li.checked) {
		--border-radius: 0 0.3em 0.3em 0;
		border-left: 10px solid var(--tag-color);
		margin-left: -10px;
	}
	.groupname {
		display: flex;
		justify-content: stretch;
		flex: 1 1;
		text-align: center;
	}
	:global(.groupname:has(:checked)) {
		--border-radius: 0.3em 0.3em 0 0;
	}
	/* .groupname + .groupitems {
		margin-left: 5px;
	} */
	.groupitems {
		flex-direction: column;
		row-gap: 0.2em;
		column-gap: 0.6em;
		justify-content: center;
		align-items: center;
		/* flex-wrap: wrap; */
		/* transition: 700ms; */
	}
	:global(.groupitems) {
		display: none;
	}
	.groupname:has(:checked) + .groupitems,
	.groupname:has(span) + .groupitems,
	:global(.groupitems:has(:checked)) {
		display: flex;
	}
	.noname > .groupitems {
		display: flex;
	}
	@container (min-width: 1300px) {
		.groupname {
			width: 100%;
		}
		.groupitems,
		.subgroups,
		.filtergroup,
		.filtergroup.noname ul {
			/* align-items: flex-end; */
		}
		ul {
			/* justify-content: flex-end; */
		}
	}
</style>
