<script>
	// @ts-nocheck
	/**
	 * TODO el codigo este y el de los componentes es feo feo feo
	 * hay que unificar los datos de la entry, del termino, y del grupo **ANTES**
	 * de filtrar y mostrarlos
	 */

	import GlosarioTree from '$lib/components/GlosarioTree.svelte';
	import { tagsConfig, glosario } from '$lib/utils/stores';
	import { page } from '$app/stores';
	import { Search, Construction } from 'lucide-svelte';

	/** @type {import('./$types').PageData} */
	export let data;

	$: glosario.set({
		...data.glosario,
		terminos: data.glosario.terminos.map((t) => ({ ...t, visible: true, spare: true }))
	});

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

	function includesNormalized(a, q = query) {
		if (a === undefined) {
			return false;
		}
		let normalize = (s) =>
			s
				.toLowerCase()
				.replaceAll('á', 'a')
				.replaceAll('é', 'e')
				.replaceAll('í', 'i')
				.replaceAll('ó', 'o')
				.replaceAll('ú', 'u');
		return normalize(a).includes(normalize(q));
	}
	function onQueryChange(query = '') {
		if (query == undefined || query.trim() == '') {
			$glosario.terminos = $glosario.terminos.map((termino) => ({
				...termino,
				visible: true,
				spare: true
			}));
			$page.url.searchParams.delete('q');
		} else {
			$glosario.terminos = $glosario.terminos.map((termino) => {
				let entry = data.entries.find((e) => e.meta.wiki == termino.name.replaceAll(' ', '-'));
				$page.url.searchParams.set('q', query);
				if (
					includesNormalized(termino.name) ||
					includesNormalized(termino.description) ||
					includesNormalized(termino.related?.join(' ')) ||
					includesNormalized(termino.aka?.join(' '))
				) {
					return { ...termino, visible: true, spare: true };
				} else {
					return { ...termino, visible: false, spare: true };
				}
			});
		}
	}
	onQueryChange(undefined);

	const style = `
	font-size: var(--step-1);
	position:absolute;
	left: .6em;
	translate: 0 .5em;
	color: var(--1);
	z-index: 1;
	`;
	const wip_style = `
	font-size: var(--step-1);
	translate: 0 .1em;
	color: white;
	z-index: 1;
	`
</script>

<svelte:head>
	<title>Kinkipedia - Enciclopedia Fetichista</title>
</svelte:head>
<p class="callout building" style:--callout-color="var(--2-dark)" style:width="100%">
	<Construction style={wip_style} />
	&ThickSpace;
	&ThickSpace;
	En construcción
	&ThickSpace;
	&ThickSpace;
	<Construction style={wip_style} />
</p>
<article class="content">
	<h1>Kinkipedia</h1>
	<p class="callout" style:--callout-color="var(--1)">El BDSM no es inherentemente abusivo, pero sí puede usarse para ejercer violencia. Si estás en una situación de violencia podés contactarte con nosotres o consultar <a target="_blank" href="https://recursero.info/violencia-sexual/">el recursero</a>.</p>
	<dl>
		<div class="searchbox">
			<Search {style} /><input
				class="searchbox"
				type="search"
				on:input={(evt) => onQueryChange(evt.target.value)}
				on:change={(evt) => onQueryChange(evt.target.value)}
				bind:value={query}
			/>
		</div>
		{#key query}
			{#if query == '' || !query}
				<GlosarioTree entries={data.entries} items={$tagsConfig.groups} {query} />
			{:else}
				<GlosarioTree
					entries={data.entries}
					items={$glosario.terminos.map((/** @type {{ name: string; }} */ t) => t.name)}
					{query}
				/>
			{/if}
		{/key}
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
	.callout {
		--callout-color: var(--1);
		font-size: var(--step-0);
		background: var(--callout-color);
		color: white;
		padding: .5em .76em;
		border-radius: 1rem;

		&.building {
			max-width: 100%;
			text-align: center;
			padding-block: .3em;
			text-transform: uppercase;
			margin-bottom: 2em;
		}
		a {
			text-decoration: underline var(--2);
			&:hover {
				color: var(--2);
			}
		}
	}
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
		position: relative;
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
