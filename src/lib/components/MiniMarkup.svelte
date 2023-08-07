<script>
	//@ts-nocheck
	/**@type {(description:string)=>Array<{type:string,line:string}>|undefined}*/
	function parseDescription(description, query) {
		const regex = /\[\[([^\]]*)\]\]/g;
		const lines = description
			.split(regex)
			.map((line, index) => ({ line, type: index % 2 == 0 ? 'text' : 'link' }))
			.map(({ line, type }) => {
				if (query != '' && line.includes(query)) {
					let parts = line.split(query);
					return parts
						.map((p, i) =>
							i % 2 == 0
								? [
										{ line: p, type },
										{ line: query, type: 'mark' }
								  ]
								: { line: p, type }
						)
						.flat();
				} else return { line, type };
			})
			.flat()
			.filter(({ line, type }) => line !== '');
		return lines.length > 0 ? lines : undefined;
	}

	function includesNormalized(a, q = query) {
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
	export let value = '';
	export let query = '';
	export let entries;
</script>

{#each parseDescription(value, query) as { line, type }}
	{@const entry = entries.find((e) => e.meta.wiki == line?.replaceAll(' ', '-'))}
	{#if type == 'link' && entry}
		<a href="/wiki/{entry.meta.wiki}">{line}</a>
	{:else if type == 'mark'}
		<mark>{line}</mark>
	{:else}
		{line}
	{/if}
{/each}

<style>
	mark {
		color: white;
		background: var(--1);
	}
</style>
