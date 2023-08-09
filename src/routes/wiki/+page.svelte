<script>
	// @ts-nocheck

	import GlosarioTree from '$lib/components/GlosarioTree.svelte';
	import { tagsConfig, currentPostData, glosario } from '$lib/utils/stores';
	import { page } from '$app/stores';
	import {Search} from 'lucide-svelte'

	/** @type {import('./$types').PageData} */
	export let data;

	$: glosario.set(data.glosario);

	/**@type {(description:string)=>*}*/
	function parseDescription(description) {
		const regex = /\[\[([^\]]*)\]\]/g;
		const lines = description.split(regex);
		return lines.map((line, index) => ({ line, type: index % 2 == 0 ? 'text' : 'link' }));
	}
	let query = '';
	// currentPostData.set({ category: 'wiki', path: $page.url.pathname });

	/** @type {(termino:string, groups?: Group[])=>Array<Group>}*/
	function getGroups(termino, groups = $tagsConfig.groups) {
		let matches = [];
		for (let group of groups) {
			if (group.name == termino) {
				matches.push({ ...group });
			} else {
				if (group.members && group.members.includes(termino)) {
					matches.push({ ...group });
				}
				if (group.sub) {
					const sub = getGroups(termino, group.sub);
					if (sub) matches.push(...sub);
				}
			}
		}
		return matches.filter((i) => i);
	}
	const style =  `
	font-size: var(--step-1);
	position:absolute;
	left: .6em;
	translate: 0 .5em;
	color: var(--1);
	z-index: 1;
	`
</script>
<svelte:head>
	<title>Kinkipedia - Enciclopedia Fetichista</title>
</svelte:head>
<article class="content">
	<h1>Kinkipedia</h1>
	<dl>
		<div class="searchbox"><Search {style} /><input class="searchbox" type="search" bind:value={query} /></div>
		{#if query == '' || !query}
			<GlosarioTree entries={data.entries} items={$tagsConfig.groups} {query} />
		{:else}
			<GlosarioTree
				entries={data.entries}
				items={$glosario.terminos
					.map((/** @type {{ name: string; }} */ t) => t.name)}
				spare
				{query}
			/>
		{/if}
	</dl>

	<!--
	<dl>
		{#each data.glosario.terminos as termino}
			{@const description = termino.description ? parseDescription(termino.description) : ''}
			{@const entry = data.entries.find((e) => e.meta.wiki == termino.name.replaceAll(' ', '-'))}
			<div class={'indent-' + 0}>
				<dt>
					{#if entry && entry.meta && entry.meta.wiki}
						{getGroup(entry?.meta?.wiki)?.level}
						<a href="/wiki/{entry.meta.wiki}">{entry.meta.title}</a>
					{:else}
						{termino.name}
					{/if}
				</dt>
				<dd>
					{#each description as { line, type }}
						{@const entry = data.entries.find((e) => e.meta.wiki == line.replaceAll(' ', '-'))}
						{#if type == 'text' || !entry}
							{line}
						{:else}
							<a href="/wiki/{entry.meta.wiki}">{line}</a>
						{/if}
					{/each}
				</dd>
			</div>
		{/each}
	</dl> -->
</article>

<style lang="scss">
	article {
		max-width: 50rem;
		margin: auto;
		font-size: var(--step-1);
		h1 {
			text-align: left;
		}
	}
	.searchbox {
		width: 100%;
		position: relative;
		/* z-index: -1; */
		/* pointer-events: none; */
	}
	.searchbox input {
		position:relative;
		width: 100%;
		border-radius: 10em;
		font-size: var(--step-1);
		padding: 0.4em 0.8em;
		padding-left: 2em;
		margin-bottom: 1em;
		border: 0;
		outline: 1px solid var(--1-light);

		transition: 100ms;
		&:focus {
			outline-width: 3px;
		}
	}
</style>
