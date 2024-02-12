<script context="module">
	import MiniMarkup from './MiniMarkup.svelte';
	import GlosarioTree from './GlosarioTree.svelte';
	import { wikiTagManager } from '$lib/utils/stores';
	import { page } from '$app/stores';
</script>

<script>
	/**@type {TagID}*/
	export let item = 'root';

	/**@type {ProcessedTag}*/
	let tag = $wikiTagManager.get(item);

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
			if (t.children && t.children.length > 0) {
				return t.children.some((s) => isVisibleFn(s));
			} else {
				return false;
			}
		}
	}
</script>

{#if isVisible}
	<div>
		<dt id={name}>
			{#if entry && entry.meta && entry.meta.wiki}
				<a href="/wiki/{entry.meta.wiki}"><MiniMarkup value={entry.meta.title} /></a>
			{:else}
				<MiniMarkup value={name} />
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
		</dt>
		{#if hasDescription || hasSub || tag.related}
			<dd>
				{#if hasDescription}
					<span>
						<MiniMarkup value={tag.parsedDescription} parsed />
					</span>
				{/if}
				{#if hasDescription && tag.related}<br />{/if}
				{#if tag.related}
					<small
						>Ver también:
						<MiniMarkup
							value={tag.related.map((t) => '[[' + t.replaceAll(' ', '-') + ']]').join(' | ')}
						/>
					</small>
				{/if}
				{#if hasSub}
					<dl>
						{#if hasSub}
							<GlosarioTree root={item} />
						{/if}
					</dl>
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
		text-transform: capitalize;
	}
	dt small {
		text-transform: none;
	}
	small {
		font-size: var(--step--1);
	}
</style>
