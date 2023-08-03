<script>
	import { tagsConfig, currentPostData } from '$lib/utils/stores';
	import { page } from '$app/stores';

	/** @type {import('./$types').PageData} */
	export let data;

	/**@type {(description:string)=>*}*/
	function parseDescription(description) {
		const regex = /\[\[([^\]]*)\]\]/g;
		const lines = description.split(regex);
		return lines.map((line, index) => ({ line, type: index % 2 == 0 ? 'text' : 'link' }));
	}

	/** @type {(termino:string, groups?: Group[])=>Group|undefined}*/
	function getGroup(termino, groups = $tagsConfig.groups) {
		for (let group of groups) {
			if (group.name == termino) {
				return group;
			} else {
				if (group.sub) {
					const sub = getGroup(termino, group.sub);
					if (sub) return sub;
				}
			}
		}
	}
	currentPostData.set({ category:'wiki', path: $page.url.pathname });
</script>

<article class="content">
	<h1>Wiki-Kinky</h1>
	<dl>
		{#each data.glosario.terminos as termino}
			{@const description = termino.description ? parseDescription(termino.description) : ''}
			{@const entry = data.entries.find((e) => e.meta.wiki == termino.name.replaceAll(' ', '-'))}
			<div>
				<dt>
					{#if entry && entry.meta && entry.meta.wiki}
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
	</dl>
</article>

<style lang="scss">
	article {
		max-width: 50rem;
		margin: auto;
		font-size: var(--step-1);
		h1 {
			text-align: left;
		}
		dl > div {
			margin-bottom: 0.3em;
		}
	}
</style>
