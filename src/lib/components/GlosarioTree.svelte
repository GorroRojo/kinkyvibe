<script>
	import { tagsConfig, glosario } from '$lib/utils/stores';
	/**@type {(description:string)=>*}*/
	function parseDescription(description) {
		const regex = /\[\[([^\]]*)\]\]/g;
		const lines = description.split(regex);
		return lines
			.map((line, index) => ({ line, type: index % 2 == 0 ? 'text' : 'link' }))
			.filter(({ line, type }) => line !== '');
	}
	/**@type {{meta:AnyPostData,path:string}[]}*/
	export let entries;

	/**@type {Group[]}*/
	export let groups;
</script>

<!-- <dl> -->
{#each groups as group}
	{#if $glosario.terminos.some((/** @type {{ name: string; }} */ t) => t.name == group.name)}
		{@const description = parseDescription(
			$glosario.terminos.find((/** @type {{ name: string; }} */ t) => t.name == group.name)
				?.description ?? ''
		)}
		{@const entry = entries.find((e) => e.meta.wiki == group.name.replaceAll(' ', '-'))}
		<div>
			<dt>
				{#if entry && entry.meta && entry.meta.wiki}
					<a href="/wiki/{entry.meta.wiki}">{entry.meta.title}</a>
				{:else}
					{group.name}
				{/if}
			</dt>
			{#if description.length > 0 || (group.sub && group.sub.length > 0) || (group.members && group.members.length > 0)}
				<dd>
					{#if description.length > 0}
						<span>
							{#each description as { line, type }}
								{@const entry = entries.find((e) => e.meta.wiki == line.replaceAll(' ', '-'))}
								{#if type == 'text' || !entry}
									{line}
								{:else}
									<a href="/wiki/{entry.meta.wiki}">{line}</a>
								{/if}
							{/each}
						</span>
					{/if}
					<dl>
						{#each group.members as name}
							{@const termino = $glosario.terminos.find(
								(/** @type {{ name: string; }} */ t) => t.name == name
							)}
							{#if termino}
								{@const description = termino?.description
									? parseDescription(termino.description)
									: ''}
								{@const entry = entries.find(
									(e) => e.meta.wiki == termino?.name.replaceAll(' ', '-')
								)}
								<div>
									<dt>
										{#if entry && entry.meta && entry.meta.wiki}
											<a href="/wiki/{entry.meta.wiki}">{entry.meta.title}</a>
										{:else}
											{termino.name}
										{/if}
									</dt>
									{#if description.length > 0}
										<dd>
											{#each description as { line, type }}
												{@const entry = entries.find(
													(e) => e.meta.wiki == line.replaceAll(' ', '-')
												)}
												{#if type == 'text' || !entry}
													{line}
												{:else}
													<a href="/wiki/{entry.meta.wiki}">{line}</a>
												{/if}
											{/each}
										</dd>
									{/if}
								</div>
							{/if}
						{/each}
						{#if group.sub}
							<svelte:self {entries} groups={group.sub} />
						{/if}
					</dl>
				</dd>
			{/if}
		</div>
	{/if}
{/each}
{#if groups == $tagsConfig.groups}
	{#each $glosario.terminos.filter((/** @type {{ name: string; }} */ t) => !['BDSM', 'bondage', 'intercambio de poder'].includes(t.name)) as termino}
		{@const description = termino.description ? parseDescription(termino.description) : ''}
		{@const entry = entries.find((e) => e.meta.wiki == termino.name.replaceAll(' ', '-'))}
		<div>
			<dt>{termino.name}</dt>
		</div>
	{/each}
{/if}

<!-- </dl> -->

<style>
	dt {
		text-transform: capitalize;
	}
</style>
