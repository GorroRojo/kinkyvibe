<script>
	/**
	 * «Quiénes» y las etiquetas de la maqueta, en una tarjeta con títulos para que se vean (gorrite
	 * no las encontraba). Cada rol con su nombre bien visible y las personas separadas con «, »
	 * (en PersonasConRol real se pierde el espacio después de la coma: ver el informe).
	 * Props: `groups` (como PersonasConRol), `tags`.
	 */
	import Tags from '$lib/components/Tags.svelte';

	/** @type {{ rol: string, items: { slug: string, title: string, href: string }[] }[]} */
	export let groups = [];
	/** @type {string[]} */
	export let tags = [];
</script>

<section class="quienes surface-card" aria-labelledby="quienes-titulo">
	<h2 id="quienes-titulo">Quiénes</h2>
	<dl>
		{#each groups as g (g.rol)}
			<div class="rol">
				<dt>{g.rol}</dt>
				<dd>
					{#each g.items as p, i (i)}{#if i > 0}{', '}{/if}{#if p.href}<a
								class="h-card"
								href={p.href}>{p.title}</a
							>{:else}<span class="h-card">{p.title}</span>{/if}{/each}
				</dd>
			</div>
		{/each}
	</dl>
	{#if tags.length}
		<h2 class="etiquetas-titulo">Etiquetas</h2>
		<div class="etiquetas"><Tags {tags} /></div>
	{/if}
</section>

<style>
	.quienes {
		display: flex;
		flex-direction: column;
		gap: var(--space-2xs);
	}
	h2 {
		margin: 0;
		font-size: var(--text-lg);
	}
	.etiquetas-titulo {
		margin-top: var(--space-s);
	}
	dl {
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-2xs);
	}
	.rol {
		display: grid;
		grid-template-columns: 7rem 1fr;
		gap: var(--space-2xs);
		align-items: baseline;
		padding-block: var(--space-3xs);
		border-top: 1px solid var(--line);
	}
	.rol:first-child {
		border-top: 0;
	}
	dt {
		font-weight: 700;
		color: var(--2-dark);
		font-size: var(--text-sm);
	}
	dd {
		margin: 0;
		min-width: 0;
		font-size: var(--text-sm);
		overflow-wrap: anywhere;
	}
	.etiquetas :global(ul),
	.etiquetas :global(.tags) {
		justify-content: flex-start;
	}
</style>
