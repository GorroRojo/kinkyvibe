<script>
	import GlosarioTree from '$lib/components/GlosarioTree.svelte';
	import { tagsConfig, currentPostData, glosario } from '$lib/utils/stores';
	import { page } from '$app/stores';

	/** @type {import('./$types').PageData} */
	export let data;

	$: glosario.set(data.glosario);

	/**@type {(description:string)=>*}*/
	function parseDescription(description) {
		const regex = /\[\[([^\]]*)\]\]/g;
		const lines = description.split(regex);
		return lines.map((line, index) => ({ line, type: index % 2 == 0 ? 'text' : 'link' }));
	}

	
	// currentPostData.set({ category: 'wiki', path: $page.url.pathname });
</script>

<article class="content">
	<h1>Kinkipedia</h1>
	<dl>
		<GlosarioTree entries={data.entries} groups={$tagsConfig.groups} />
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
</style>
