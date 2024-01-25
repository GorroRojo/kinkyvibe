<script>
	//@ts-nocheck
	import { ArrowRight } from 'lucide-svelte';
	import InlineTag from '$lib/components/InlineTag.svelte';
	import Tag from '$lib/components/Tag.svelte';
	export let data;
	import PostList from '$lib/components/PostList.svelte';
	import { filteredTags, togglePositiveTagFilterFn } from '$lib/utils/stores.js';
	import { flip } from 'svelte/animate';
	import { fade } from 'svelte/transition';
	import { page } from '$app/stores';
	import { fetchGlossary } from '$lib/utils/index.js';
	let pinned = ['Gorro_Rojo', 'DemonWeb', 'TallarinesConTuco'];
	let amiguesPosts = data.allPosts
		.filter((p) => p.meta.layout == 'amigues')
		.sort((a, b) => {
			if (pinned.includes(a.meta.postID) && !pinned.includes(b.meta.postID)) {
				return -1;
			} else return 0;
		});
	let glosario = fetchGlossary();
	function parseDescription(description) {
		const regex = /\[\[([^\]]*)\]\]/g;
		return description
			.split(regex)
			.map((piece, index) =>
				index % 2 == 0 ? { type: 'text', content: piece } : { type: Tag, content: piece }
			);
	}

	const style = 'display:inline;width:.9em;translate:0 .6em;';
</script>

<svelte:head>
	<title>KinkyVibe.ar - Emprendimientos y profesionales</title>
</svelte:head>
<div class="glosario">
	<p>
		¡Bienvenide! Acá vas a encontrar profesionales que ofrecen <InlineTag tag="sesiones" /> BDSM, que
		dan <InlineTag tag="clases" /> o profesionales de la salud mental que ofrecen espacios de <InlineTag
			tag="terapia"
		/>. También podrás encontrar <InlineTag tag="artistas" internalTag="arte" /> y <InlineTag
			tag="emprendimientos"
			internalTag="emprendimiento"
		/>.
	</p>
	{#await glosario then { terminos }}
		{@const terminosFiltrados = terminos.filter((t) => $filteredTags.includes(t.name))}
		<dl>
			{#each terminosFiltrados as termino (termino.name)}
				{@const description = termino.description ? parseDescription(termino.description) : ''}
				<div animate:flip in:fade>
					<div>
						<button on:click={() => $togglePositiveTagFilterFn(false, termino.name)}>x</button>
						<dt>
							{termino.name.charAt(0).toUpperCase() + termino.name.slice(1)}
							{#if data.wiki.find((w) => w.meta.wiki == termino.name)}
								<a href="/wiki/{termino.name}" class="gotowiki">
									<span>
										<Globe {style} />
										Ver en la wiki
										<ArrowRight {style} />
									</span>
								</a>
							{/if}
						</dt>
						<dd>
							{#if description}
								{#each description as d}
									{#if d.type == 'text'}
										{d.content}
									{:else if d.type == Tag}
										<svelte:component
											this={d.type}
											tag={d.content}
											onInput={(evt, tag) =>
												$togglePositiveTagFilterFn(evt.target?.checked, d.content)}
											isCheckbox
											checked={$page.url.searchParams.has('tags') &&
												$page.url.searchParams.get('tags')?.split(',').includes(d.content)}
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
	{/await}
</div>

<PostList posts={amiguesPosts} />

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
</style>
