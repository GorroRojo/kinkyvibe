<script context="module">
	import MiniMarkup from './MiniMarkup.svelte';
	import { glosario } from '$lib/utils/stores';
	import GlosarioTree from './GlosarioTree.svelte';
	/**@type {ProcessedPost[]}*/
	export let entries;
</script>

<script>
	/**@type {(description:string, query:string)=>Array<{type:string,line:string}>|undefined}*/
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
	/**@type {{meta:AnyPostData,path:string}[]}*/
	export let entries;

	/**@type {Group}*/
	export let item;

	export let query = '';

	const name = item.name;
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
	const entry = entries.find((e) => e.meta.wiki == name.replaceAll(' ', '-'));
	const groupdata = item;
	const termino = $glosario.terminos.find(/** @type {{ name: string; }} */ (t) => t.name == name);
	let uniqueListing = false;
	/**@ts-ignore*/
	if (termino?.spare) {
		uniqueListing = true;
		/**@ts-ignore*/
		termino.spare = false;
	}
	$: hasDescription = description?.length > 0;
	$: hasSub = groupdata.sub?.length > 0;
</script>

{'' /**@ts-ignore*/ + ''}
{#if termino && ((query == '' && ((termino && termino?.visible) || entry?.meta?.wiki)) || termino?.visible) && (termino.spare || uniqueListing) && (hasDescription || hasSub || termino.related)}
	<div>
		<dt id={termino.name}>
			{#if entry && entry.meta && entry.meta.wiki}
				<a href="/wiki/{entry.meta.wiki}"
					><MiniMarkup value={entry.meta.title} {query} {entries} /></a
				>
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
		{#if hasDescription || hasSub || termino.related}
			<dd>
				{#if hasDescription}
					<span>
						<MiniMarkup value={rawdescription} {query} {entries} />
					</span>
				{/if}
				{#if hasDescription && termino.related}<br />{/if}
				{#if termino.related}
					<small
						>Ver también:
						<MiniMarkup
							value={termino.related.map((t) => '[[' + t.replaceAll(' ', '-') + ']]').join(' | ')}
							{query}
							{entries}
						/>
					</small>
				{/if}
				{#if hasSub}
					<dl>
						{#if hasSub}
							{'' /**@ts-ignore*/ + ''}
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
