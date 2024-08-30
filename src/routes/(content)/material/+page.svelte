<script>
	//@ts-nocheck
	export let data;
	import MiniMarkup from '$lib/components/MiniMarkup.svelte';
	import InlineTag from '$lib/components/InlineTag.svelte';
	import PostList from '$lib/components/PostList.svelte';
	import Tag from '$lib/components/Tag.svelte';
	import { filteredTags, tagManager, togglePositiveTagFilterFn } from '$lib/utils/stores';
	import { ArrowRight, Globe } from 'lucide-svelte';
	import { page } from '$app/stores';
	import { flip } from 'svelte/animate';
	import { fade } from 'svelte/transition';

	const style = 'display:inline;width:.9em;translate:0 .6em;';
</script>

<svelte:head>
	<title>KinkyVibe.ar - Artículos, links y descargables</title>
</svelte:head>
<div class="glosario">
	<p>
		¡Bienvenide! Si estás empezando, podés filtrar acá el material <InlineTag tag="inicial" /> sobre
		<InlineTag tag="BDSM" />
		podés buscar según qué <InlineTag tag="práctica" /> te interesa (por ej. <InlineTag
			tag="cuerdas"
		/>, <InlineTag tag="electro" /> play o <InlineTag tag="impacto" />), qué idioma preferís (<InlineTag
			tag="inglés"
		/> o <InlineTag tag="español" />) o en qué formato (<InlineTag tag="descargable" /> o <InlineTag
			tag="online"
		/>).
	</p>
	<dl>
		{#each $filteredTags.map($tagManager.get).filter((t) => t.parsedDescription) as termino (termino.id)}
			{@const name = termino.visible_name ?? termino.id}
			<div animate:flip in:fade>
				<div>
					<button on:click={() => $togglePositiveTagFilterFn(false, termino.id)}>x</button>
					<dt>
						{termino.icon ?? ''}{name.charAt(0).toUpperCase() + name.slice(1)}
						{#if data.wiki.find((w) => w.meta.wiki == termino.id)}
							<a href="/wiki/{termino.id}" class="gotowiki">
								<span>
									<Globe {style} />
									Es más complejo
									<ArrowRight {style} />
								</span>
							</a>
						{/if}
					</dt>
					<dd>
						{#each termino.parsedDescription as d}
							{#if d.type == 'link'}
								<Tag
									tag={d.line}
									onInput={(evt, tag) => $togglePositiveTagFilterFn(evt.target?.checked, d.line)}
									isCheckbox
									checked={$page.url.searchParams.has('tags') &&
										$page.url.searchParams.get('tags')?.split(',').includes(d.line)}
									--off-background="color-mix(in srgb, var(--1-light) 10%, transparent)"
									--font-size="1em"
									--padding="0.1em 0.2em"
									--border-radius=".3em"
									noBorder
								/>
							{:else}
								{d.line}
							{/if}
						{/each}

						{#if termino.related}
							<small>
								Ver también:
								{#each termino.related as tag, i}
									<Tag
										{tag}
										onInput={(evt, _) => $togglePositiveTagFilterFn(evt.target?.checked, tag)}
										isCheckbox
										checked={$page.url.searchParams.has('tags') &&
											$page.url.searchParams.get('tags')?.split(',').includes(tag)}
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
			</div>
		{/each}
	</dl>
</div>

<PostList posts={data.allPosts.filter((p) => p.meta.layout == 'material')} />

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
			grid-template-columns: 1fr;
			transition: 100ms;
			gap: 0.8em;
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
		.gotowiki {
			/* --color: var(--2); */
			color: var(--color);
			border: 1px solid color-mix(in srgb, var(--color) 60%, transparent);
			background: color-mix(in srgb, var(--color) 10%, transparent);
			border-radius: 1em;
			padding: 0.3em;
			/* place-content: center; */
			text-align: center;
			text-decoration: none;
			font-size: calc(0.85 * var(--step--1));
			line-height: 1;
			position: relative;
			left: 0;
			transition: 100ms;
			margin-left: 0.5em;
			bottom: 0.1em;
			opacity: 0.8;
			&:hover {
				left: 0.3em;
			}
		}
	}
</style>
