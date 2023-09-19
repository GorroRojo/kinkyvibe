<script context="module">
	import MiniMarkup from './MiniMarkup.svelte';
	import { tagsConfig, glosario } from '$lib/utils/stores';
	import GlosarioTree from './GlosarioTree.svelte';
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
				// if (group.members && group.members.includes(termino)) {
				// 	matches.push({ ...group });
				// }
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

	/**@type {Group|string|{meta:AnyPostData,path:string}}}*/
	export let item;

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
	export let spare = false;
	export let query = '';
	/**@ts-ignore*/
	export let type = typeof item == 'string' ? 'string' : item.name ? 'group' : 'entry';

	const name = {
		string: () => {
			return item;
		} /**@ts-ignore*/,
		group: () => {
			return item.name;
		} /**@ts-ignore*/,
		entry: () => {
			return item.meta.title;
		}
	}[type]();
	const rawdescription =
		$glosario.terminos.find((/** @type {{ name: string; }} */ t) => t.name == name)?.description ??
		'';
	const description =
		parseDescription(rawdescription, query) ??
		[
			{
				type: 'text',
				line:
					entries.find((e) => e.meta.wiki == name.replaceAll(' ', '-'))?.meta?.summary ?? undefined
			}
		].filter(({ line }) => line);

	const entry = {
		string: () => /**@ts-ignore*/ entries.find((e) => e.meta.wiki == name.replaceAll(' ', '-')),
		entry: () => item.meta.wiki.replaceAll(' ', '-'),
		group: () => entries.find((e) => e.meta.wiki == name.replaceAll(' ', '-'))
	}[type]();
	const groupdata = {
		group: () => item,
		entry: () =>
			getGroups(item.meta.wiki.replaceAll(' ', '-') ?? item.meta.title)?.[0] ?? {
				members: [],
				sub: []
			},
		string: () => getGroups(item)?.[0] ?? { members: [], sub: [] }
	}[type]() ?? { members: [], sub: [] };
	$: filteredMembers = groupdata.members
		.map((m) => $glosario.terminos.find((/** @type {{ name: string; }} */ t) => t.name == m)?.name)
		.filter((i) => i);

	const termino = $glosario.terminos.find(/** @type {{ name: string; }} */ (t) => t.name == name);
	let uniqueListing = false;
	if (termino?.spare) {
		uniqueListing = true;
		termino.spare = false;
	}

	$: hasDescription = description?.length > 0;
	$: hasMembers = filteredMembers?.length > 0;
	$: hasSub = groupdata.sub?.length > 0;
</script>

{#if ((query == '' && ((termino && termino?.visible) || entry?.meta?.wiki)) || termino?.visible) && (termino.spare || uniqueListing) && (hasDescription || hasMembers || hasSub || termino.related)}
	<div>
		<dt id={termino.name}>
			{#if entry && entry.meta && entry.meta.wiki}
				<a href="/wiki/{entry.meta.wiki}"><MiniMarkup value={entry.meta.title} {query} {entries} /></a>
			{:else}
				<MiniMarkup value={name} {query} {entries} />
			{/if}
			{#if termino.aka}
				{@const aka = [termino.aka].flat()}
				<small>
					(
					{#each aka as other, i}
						{i == 0 ? '' : ', '}<MiniMarkup value={other} {query} {entries} />
					{/each}
					)
				</small>
			{/if}
		</dt>
		{#if hasDescription || hasMembers || hasSub || termino.related}
			<dd>
				{#if hasDescription}
					<span>
						<MiniMarkup value={rawdescription} {query} {entries} />
					</span>
				{/if}
				{#if hasDescription && termino.related}<br>{/if}
				{#if termino.related}
					<small
						>Ver también:
						<MiniMarkup
							value={termino.related.map((t) => '[[' + t.replaceAll(' ', '-') + ']]').join(' | ')}
							{query}
							{entries}
						/>
						<!-- 
							{#each termino.related as other, i}
								{@const relatedEntry = entries.find((e) => e.meta.wiki == other.replaceAll(' ', '-'))}
							{i == 0 ? '' : ', '}
							{#if relatedEntry}
								<a href={relatedEntry.path}
									><MiniMarkup value={relatedEntry.meta.title} {query} {entries} /></a
								>
							{:else}
								<MiniMarkup value={other} {query} {entries} />
							{/if}
							{/each}
						-->
					</small>
				{/if}
				{#if hasMembers || hasSub}
					<dl>
						{#if hasMembers}
							{#key termino?.visible}
								<GlosarioTree {entries} items={filteredMembers} searched {query} spare={false} />
							{/key}
						{/if}
						{#if hasSub}
							{#key termino?.visible}
								<GlosarioTree {entries} items={groupdata.sub} {query} spare={false} />
							{/key}
						{/if}
					</dl>
				{/if}
			</dd>
		{/if}
	</div>
{/if}

<mark hidden />

<style>
	mark {
		color: red !important;
	}
	dt {
		text-transform: capitalize;
	}
	dt small {
		text-transform: none;
	}
	small {
		font-size: var(--step--1);
	}
</style>
