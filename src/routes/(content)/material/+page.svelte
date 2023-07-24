<script>
	//@ts-nocheck
	export let data;
	import InlineTag from './InlineTag.svelte';
	import PostList from '$lib/components/PostList.svelte';
	import Tag from '$lib/components/Tag.svelte';
	import { filteredTags, tagsConfig, alias, togglePositiveTagFilterFn } from '$lib/utils/stores';
	import { aliaserFactory, fetchGlossary } from '$lib/utils/index.js';
	import { ArrowRight } from 'lucide-svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { flip } from 'svelte/animate';
	import { fade } from 'svelte/transition';
	let glosario = fetchGlossary();

	alias.update(() => aliaserFactory($tagsConfig));
	togglePositiveTagFilterFn.update(
		() =>
			function (checked, tag) {
				if (checked) {
					filteredTags.update((fTags) => [...fTags, tag]);
				} else {
					filteredTags.update((fTags) => [
						...fTags.slice(0, fTags.indexOf(tag)),
						...fTags.slice(fTags.indexOf(tag) + 1)
					]);
				}
				$page.url.searchParams.set('tags', $filteredTags.join(','));
				window.history.pushState('', '', `?${$page.url.searchParams.toString()}`);
			}
	);

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

<div class="glosario">
	<p>
		¡Bienvenide! Si estás empezando, podés filtrar acá el material <InlineTag tag="inicial" />,
		podés buscar según qué <InlineTag tag="práctica" /> te interesa (por ej. <InlineTag
			tag="shibari"
		/> o <InlineTag tag="impacto" />), qué idioma preferís (<InlineTag tag="inglés" /> o <InlineTag
			tag="español"
		/>) o en qué formato (<InlineTag tag="descargable" /> o <InlineTag tag="online" />).
	</p>
	{#await glosario then { terminos }}
		{@const terminosFiltrados = terminos.filter((t) => $filteredTags.includes(t.name))}
		<!--{#if terminosFiltrados.length == 0}
			<p>
				Hola troles acá pueden buscar por
				<InlineTag tag="bondage" />
				o [bdsm] o [gay] uwu
			</p>
		{/if} -->
		<dl>
			{#each terminosFiltrados as termino (termino.name)}
				{@const description = termino.description ? parseDescription(termino.description) : ''}
				<div animate:flip in:fade>
					<div>
						<button on:click={() => $togglePositiveTagFilterFn(false, termino.name)}>x</button>
						<dt>{termino.name.charAt(0).toUpperCase() + termino.name.slice(1)}</dt>
						<dd>
							{#if description}
								{#each description as d}
									{#if d.type == 'text'}
										{d.content}
									{:else if d.type == Tag}
										{@const aliasedTag = $alias(d.content)}
										<svelte:component
											this={d.type}
											tag={d.content}
											onInput={(evt, tag) =>
												$togglePositiveTagFilterFn(evt.target?.checked, aliasedTag)}
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
									Ver también:
									{#each termino.related as tag, i}
										{@const aliasedTag = $alias(tag)}
										<Tag
											{tag}
											onInput={(evt, _) =>
												$togglePositiveTagFilterFn(evt.target?.checked, aliasedTag)}
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
					<!-- <a href="/wiki/{termino.name}"><ArrowRight /></a> -->
				</div>
			{/each}
		</dl>
	{/await}
</div>

<PostList posts={data.posts} />

<style lang="scss">
	.glosario {
		max-width: 60rem;
		margin-inline: auto;
		--color: blue;
		background: color-mix(in srgb, var(--color) 2%, white);
		padding: 1em 2em;
		outline: 2px solid var(--color);
		border-radius: 1em;
		color: color-mix(in srgb, var(--color) 50%, black);
		margin-bottom: 2em;
		p {
			font-size: var(--step-0);
		}
	}
	button {
		position: absolute;
		left: 0em;
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
		width: 100%;
		margin-inline: auto;
		font-size: var(--step-0);
		position: relative;
	}
	dl > div {
		position: relative;
		margin-top: 1em;
		display: grid;
		/* grid-template-columns: 1fr 5em; */
		grid-template-columns: 1fr;
		transition: 100ms;
		gap: 0.8em;
		& > a {
			/* --color: var(--2); */
			color: var(--color);
			outline: 1px solid color-mix(in srgb, var(--color) 60%, transparent);
			background: color-mix(in srgb, var(--color) 10%, transparent);
			border-radius: 1em;
			padding: 1em;
			display: grid;
			place-content: center;
			transition: 100ms;
			&:hover {
				scale: 1.08;
				translate: -10px;
			}
		}
		&:has(> a:hover) {
			translate: 10px;
		}
	}
	dt {
		font-weight: bold;
		color: var(--color);
		margin-left: 1em;
	}
	dd small:last-of-type {
		display: inline-block;
		margin-left: 0.3em;
		opacity: 0.8;
		text-align: right;
	}
</style>
