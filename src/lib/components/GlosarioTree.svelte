<script context="module">
	import MiniMarkup from './MiniMarkup.svelte';
	import { flip } from 'svelte/animate';
	import { tagsConfig, glosario } from '$lib/utils/stores';
	export let entries;
</script>

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
	/**@type {{meta:AnyPostData,path:string}[]}*/
	export let entries;

	/**@type {Group[]|string[]|{meta:AnyPostData,path:string}[]}}*/
	export let items;

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

	// export let searched = false;
	// export let spare = false;
	export let query = '';
	/**@ts-ignore*/
	const type = typeof items[0] == 'string' ? 'string' : items[0].name ? 'group' : 'entry';
</script>

<!-- <dl> -->
{#each items as item}
	{@const name = {
		string: () => {
			return item;
		} /**@ts-ignore*/,
		group: () => {
			return item.name;
		} /**@ts-ignore*/,
		entry: () => {
			return item.meta.title;
		}
	}[type]()}
	{@const rawdescription =
		$glosario.terminos.find((/** @type {{ name: string; }} */ t) => t.name == name)?.description ??
		''}
	{@const description =
		parseDescription(rawdescription, query) ??
		[
			{
				type: 'text',
				line:
					entries.find((e) => e.meta.wiki == name.replaceAll(' ', '-'))?.meta?.summary ?? undefined
			}
		].filter(({ line }) => line)}
	{#if $glosario.terminos.some((/** @type {{ name: string; }} */ t) => t.name == name)}
		{@const entry = {
			string: () => /**@ts-ignore*/ entries.find((e) => e.meta.wiki == name.replaceAll(' ', '-')),
			entry: () => item.meta.wiki.replaceAll(' ', '-'),
			group: () => entries.find((e) => e.meta.wiki == name.replaceAll(' ', '-'))
		}[type]()}
		{@const groupdata = {
			group: () => item,
			entry: () =>
				getGroups(item.meta.wiki.replaceAll(' ', '-') ?? item.meta.title)?.[0] ?? {
					members: [],
					sub: []
				},
			string: () => ({ members: [], sub: [] })
		}[type]() ?? { members: [], sub: [] }}
		{@const visible = (() => {
			let v = query == '' || includesNormalized(name) || includesNormalized(rawdescription);
			// if (!v) {
			// 	visibleTerms.update((t) => {
			// 		let n = [...t];
			// 		n.splice(n.indexOf(name), 1);
			// 		return n;
			// 	});}
			// } else if (!spare) {
			// 	visibleTerms.update((t) => [...t, name]);
			// }
			return v;
		})()}
		{#if visible}
			<div>
				<dt>
					{#if entry && entry.meta && entry.meta.wiki}
						<a href="/wiki/{entry.meta.wiki}"><MiniMarkup value={entry.meta.title} {query} {entries}/></a>
					{:else}
					<MiniMarkup value={name} {query} {entries}/>
					{/if}
				</dt>
				{#if description?.length > 0 || (type == 'group' && (groupdata.members?.length > 0 || groupdata.members?.length > 0))}
					<dd>
						{#if description?.length > 0}
							<span>
								<MiniMarkup value={rawdescription} {query} {entries} />
							</span>
						{/if}
						{#if groupdata.members.length > 0 || groupdata.sub.length > 0}
							<dl>
								{#if groupdata.members.length > 0}
									{@const terminos = groupdata.members
										.map(
											(m) =>
												$glosario.terminos.find((/** @type {{ name: string; }} */ t) => t.name == m)
													?.name
										)
										.filter((i) => i)}
									{#if terminos.length > 0}
										{#key visible}
											<svelte:self {entries} items={terminos} searched {query} />
										{/key}
									{/if}
								{/if}
								{#if groupdata.sub.length > 0}
									{#key visible}
										<svelte:self {entries} items={groupdata.sub} {query} />
									{/key}
								{/if}
							</dl>
						{/if}
					</dd>
				{/if}
			</div>
		{/if}
	{/if}
{/each}

<!-- {#if items == $tagsConfig.groups || !spare}
	<svelte:self
		{entries}
		items={$glosario.terminos
			.map((/** @type {{ name: string; }} */ t) => t.name)
			.filter((t) => !$visibleTerms.includes(t))}
		spare
		{query}
	/>
{/if} -->

<!-- </dl> -->
<mark hidden></mark>
<style>
	mark {
		color: red !important;
	}
	dt {
		text-transform: capitalize;
	}
</style>
