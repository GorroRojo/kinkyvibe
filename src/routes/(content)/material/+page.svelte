<script>
	//@ts-nocheck
	export let data;
	import PostList from '$lib/components/PostList.svelte';
	import Tag from '$lib/components/Tag.svelte';
	import { filteredTags, tagsConfig } from '$lib/utils/stores';
	import { aliaserFactory, fetchGlossary } from '$lib/utils/index.js';
	import { ArrowLeft } from 'lucide-svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { flip } from 'svelte/animate';
	import { fade } from 'svelte/transition';
	let glosario = fetchGlossary();
	var alias = aliaserFactory($tagsConfig);
	function togglePositiveTagFilter(checked, tag) {
		if (checked) {
			filteredTags.update((fTags) => [...fTags, tag]);
		} else {
			filteredTags.update((fTags) => [
				...fTags.slice(0, fTags.indexOf(tag)),
				...fTags.slice(fTags.indexOf(tag) + 1)
			]);
		}
		$page.url.searchParams.set('tags', $filteredTags.join(','));
		goto(`?${$page.url.searchParams.toString()}`, { noScroll: true });
	}

	function parseDescription(description) {
		const regex = /\[\[([^\]]*)\]\]/g;
		return description
			.split(regex)
			.map((piece, index) =>
				index % 2 == 0 ? { type: 'text', content: piece } : { type: Tag, content: piece }
			);
	}
</script>

<svelte:head>
	<title>KinkyVibe.ar - Artículos, links y descargables</title>
</svelte:head>

{#await glosario then { terminos }}
	<dl>
		{#each terminos.filter((t) => $filteredTags.includes(t.name)) as termino (termino.name)}
			{@const description = termino.description ? parseDescription(termino.description) : ''}
			<div animate:flip in:fade>
				<button on:click={() => togglePositiveTagFilter(false, termino.name)}>x</button>
				<dt>{termino.name.charAt(0).toUpperCase() + termino.name.slice(1)}</dt>
				<dd>
					{#if description}
						{#each description as d}
							{#if d.type == 'text'}
								{d.content}
							{:else if d.type == Tag}
								{@const aliasedTag = alias(d.content)}
								<svelte:component
									this={d.type}
									tag={d.content}
									onInput={(evt, tag) => togglePositiveTagFilter(evt.target?.checked, aliasedTag)}
									isCheckbox
									checked={$page.url.searchParams.has('tags') &&
										$page.url.searchParams.get('tags')?.split(',').includes(aliasedTag)}
									--off-background="color-mix(in srgb, var(--1-light) 10%, transparent)"
									--font-size="1em"
									--padding="0.1em 0.2em"
									--border-radius=".3em"
									noBorder
								/>
							{/if}
						{/each}
					{/if}

					{#if termino.related}
						<small>
							Var también:
							{#each termino.related as tag, i}
								{@const aliasedTag = alias(tag)}
								<Tag
									{tag}
									onInput={(evt, _) => togglePositiveTagFilter(evt.target?.checked, aliasedTag)}
									isCheckbox
									checked={$page.url.searchParams.has('tags') &&
										$page.url.searchParams.get('tags')?.split(',').includes(aliasedTag)}
									--off-background="color-mix(in srgb, var(--1-light) 10%, transparent)"
									--font-size="1em"
									--padding="0.1em 0.2em"
									--border-radius=".3em"
									noBorder
								/>
								{i < termino.related.length - 1 ? ', ' : ''}
							{/each}
							.
						</small>
					{/if}
				</dd>
			</div>
		{/each}
	</dl>
{/await}

<PostList posts={data.posts} />

<style>
	button {
		position: absolute;
		left: -1em;
		padding: 0.2em;
		font-size: var(--step-0);
		cursor: pointer;
		border: 0;
		outline: 0;
		background: transparent;
		opacity: 0.3;
		top: 0;
		line-height: 0.6;
		transition: 100ms;
	}
	button:hover {
		opacity: 0.7;
	}
	dl {
		max-width: 50rem;
		width: 100%;
		margin-inline: auto;
		font-size: var(--step-0);
		margin-bottom: 2em;
		position: relative;
	}
	dl div {
		position: relative;
		margin-top: 1em;
	}
	dt {
		font-weight: bold;
		color: var(--1);
	}
	dd small:last-of-type {
		display: inline-block;
		margin-left: 0.3em;
		opacity: 0.8;
		text-align: right;
	}
</style>
