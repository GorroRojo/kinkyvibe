<script context="module">
	import { ChevronRight, ChevronDown } from 'lucide-svelte';
	import MiniMarkup from './MiniMarkup.svelte';
	import GlosarioTree from './GlosarioTree.svelte';
	import { tagManager, wikiTagManager, query } from '$lib/utils/stores';
	import { page } from '$app/stores';
	import { createCollapsible, melt } from '@melt-ui/svelte';
	import { slide } from 'svelte/transition';
</script>

<script>
	/**@type {TagID}*/
	export let item = 'root';
	export let single = false;
	export let title = false;
	const {
		elements: { root, content, trigger },
		states: { open },
		options
	} = createCollapsible();
	query.subscribe((q) => {
		if (q != '') {
			open.set(true);
		}
	});
	/**@type {ProcessedTag}*/
	let tag = $wikiTagManager.get(item);
	wikiTagManager.subscribe((wtm) => (tag = wtm.get(item)));

	const name = tag?.visible_name ?? tag.id;
	/** @type {ProcessedPost} */
	const entry = $page.data.wiki.find(
		(/**@type ProcessedPost */ e) => e.meta.wiki == name.replaceAll(' ', '-')
	);
	const description =
		tag.parsedDescription ??
		[
			{
				type: 'text',
				line: entry?.meta?.summary ?? undefined
			}
		].filter(({ line }) => line);
	const hasDescription = description?.length > 0;
	const hasSub = tag.children?.length ?? 0 > 0;
	let expanded = false;
	let isVisible = isVisibleFn(item);
	/**
	 * @param {TagID} tagID
	 * @returns {boolean}
	 */
	function isVisibleFn(tagID) {
		let t = $wikiTagManager.get(tagID);
		if (
			(t.description && t.description != '') ||
			(t?.related?.length ?? 0) > 0 ||
			(t?.aka?.length ?? 0) > 0
		) {
			return true;
		} else {
			let children = t.getAllChildren();
			if (children.length > 0) {
				return children.some((s) => isVisibleFn(s));
			} else {
				return false;
			}
		}
	}
	const style = `
	scale: .8;
	translate: 0 .4em;
	color: var(--1);
	`;
</script>

{#if isVisible}
	<div
		use:melt={$root}
		class="all"
		class:single
		class:title
		style:--color={tag.getColor() ?? 'var(--2)'}
	>
		<dt id={name} class:onlyTitle={!(hasDescription || tag.related)}>
			<div class="itemtitle">
				{#if !title && entry && entry.meta && entry.meta.wiki}
					{tag?.icon ?? ''}
					<a href="/wiki/{entry.meta.wiki}">
						<MiniMarkup value={entry.meta.title} />
					</a>
				{:else if title}
					<h1>
						{tag?.icon ?? ''}
						<MiniMarkup value={name[0].toLocaleUpperCase() + name.slice(1)} />
					</h1>
				{:else}
					{tag?.icon ?? ''}
					<MiniMarkup value={name[0].toLocaleUpperCase() + name.slice(1)} />
				{/if}
				{#if tag?.aka?.length ?? 0 > 0}
					<small>
						(
						{#each tag?.aka ?? [] as other, i}
							{i == 0 ? '' : ', '}<MiniMarkup value={other} />
						{/each}
						)
					</small>
				{/if}
			</div>
		</dt>
		{#if hasDescription || hasSub || tag.related}
			<dd>
				{#if hasDescription || tag.related}
					<div class="self">
						{#if hasDescription}
							<span>
								<MiniMarkup value={description} parsed />
							</span>
						{/if}
						{#if hasDescription && tag.related}<br />{/if}
						{#if tag.related}
							{@const related = tag.related
								.map(
									(relatedTag) =>
										$page.data.wiki.find(
											(/** @type {ProcessedPost} */ e) => e.meta.wiki == relatedTag
										) ?? $tagManager.tagsData().find((t) => t.id == relatedTag)
								)
								.filter((t) => t)}
							{#if related.length > 0}
								<small
									>Ver también:
									{#each related as relatedTag, i}
										{#if relatedTag.meta}
											<a href="/wiki/{relatedTag.meta.wiki}">{relatedTag.meta.wiki}</a>
										{:else}
											<a href="/wiki#{relatedTag?.visible_name ?? tag.id}">{relatedTag.id}</a>
										{/if}
										{i < tag.related.length - 1 ? ' | ' : ''}
									{/each}
								</small>
							{/if}
						{/if}
					</div>
				{/if}
				{#if hasSub && !single}
					<button class:open={$open} use:melt={$trigger} class="expand">
						{#if $open}
							<ChevronDown {style} />
						{:else}
							<span>
								<ChevronRight {style} />
								{$wikiTagManager.get(item)?.children?.length} más...
							</span>
						{/if}
					</button>
					{#if $open}
						<dl use:melt={$content}>
							<GlosarioTree root={item} />
						</dl>
					{/if}
				{/if}
			</dd>
		{/if}
	</div>
{/if}

<mark hidden />

<style>
	mark {
		color: red !important;
	}
	dt {
		/* text-transform: capitalize; */
		border-bottom: 1px solid var(--color);
		width: fit-content;
		border-radius: var(--round);
		padding: 0.1em 0.4em;
		background: white;
		translate: 0 0.5em;
		z-index: 1;
		position: relative;
		font-size: var(--step-0-5);
	}
	dt.onlyTitle {
		translate: 0;
		margin-top: 0.5em;
	}
	dt a {
		text-decoration-thickness: 3px;
	}
	dt small {
		text-transform: none;
		opacity: 0.6;
		font-size: var(--step--1);
	}
	.itemtitle {
		display: inline;
	}
	.self small {
		font-size: var(--step--1);
		display: block;
		margin-top: 0.5em;
	}
	.all {
		padding-inline-start: 2em;
	}
	.all.single {
		padding-inline-start: 0;
	}
	.all.single dt {
		font-size: var(--step-1);
	}
	.all.title {
		margin-bottom: 1em;
	}
	.self {
		background: white;
		padding: 0.9em 1em;
		border-radius: var(--round);
	}
	.self span {
		font-size: var(--step-0);
	}
	dd {
		margin-inline-start: 0;
		/* padding: 0; */
		/* z-index: -1; */
		border-left: unset;
	}
	dd::before {
		content: '';
	}
	dl {
		/* padding:0; */
		margin-top: 0.5em;
		border-left: 2px solid color-mix(in srgb, var(--color, var(--1)) 40%, transparent);
	}
	button {
		font-size: var(--step--1);
		border: none;
		color: var(--1);
		padding: 0.6em 1em;
		border-radius: var(--round);
		/* display: inline-grid; */
		/* place-items: center; */
		background: transparent;
		margin-top: 0.1em;
		transition: 100ms;
		background: #eee;
	}
	button.open {
		position: absolute;
		/* padding: 0; */
		translate: -1.65em 0;
	}
</style>
