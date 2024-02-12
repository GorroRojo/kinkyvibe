<script>
	import { page } from "$app/stores";
	import { tagManager, query } from "$lib/utils/stores";

	/**@type {(description:string, query:string)=>Array<{type:string,line:string}>|undefined}*/
	function parseDescription(description, query) {
		const regex = /\[\[([^\]]*)\]\]/g;
		const nQuery = normalize(query);
		const lines = description
			.split(regex)
			.map((line, index) => ({ line, type: index % 2 == 0 ? 'text' : 'link' }))
			.map(({ line, type }) => {
				if (type == 'link') {
					if (line.includes(':')) {
						let [href, newStr] = line.split(':');
						return {
							line: newStr,
							type,
							href
						};
					} else {
						return {
							line,
							type,
							href: line
						};
					}
				} else return { line, type };
			})
			.map(({ line, type }) => {
				const nLine = normalize(line);
				if (query != '' && nLine.includes(nQuery)) {
					let nParts = nLine.split(nQuery);
					let k = 0;
					let parts = nParts.map((p, i) => {
						k += p.length;
						let end = k;
						if (i != 0 && i % 2 != 0) {
							k += nQuery.length;
							end = k + nQuery.length;
						}
						return line.slice(k - p.length, end);
					});
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

	/**
	 *
	 * @param {string} s
	 */
	const normalize = (s) =>
		(s + '')
			.toLowerCase()
			.replaceAll('á', 'a')
			.replaceAll('é', 'e')
			.replaceAll('í', 'i')
			.replaceAll('ó', 'o')
			.replaceAll('ú', 'u');

	/**@type{*}*/
	export let value = '';
	export let parsed = false;
	/**@type {ProcessedPost[]}*/
	let entries = $page.data.wiki;
</script>

{#each parsed ? value : parseDescription(value, $query) as { line, type, href }}
	{@const entry = entries.find((e) => e.meta.wiki == (href ?? line)?.replaceAll(' ', '-'))}
	{@const tag = $tagManager.tagsData().find((t) => t.id == (href ?? line)?.replaceAll(' ', '-'))}
	{#if type == 'link' && entry}
		<a href="/wiki/{entry.meta.wiki}">{line}</a>
	{:else if type == 'link' && tag}
		<a href="/wiki#{tag?.visible_name ?? tag.id}">{line}</a>
	{:else if type == 'mark'}
		<mark>{line}</mark>
	{:else}
		{line}
	{/if}
{/each}

<style>
	mark {
		color: var(--2);
		font-weight: bold;
	}
</style>
