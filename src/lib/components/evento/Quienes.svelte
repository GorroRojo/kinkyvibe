<script>
	/**
	 * «Quiénes» y las etiquetas de la página de un evento, en una tarjeta con títulos para que se
	 * vean (pedido de gorrite). Un rol por renglón, con las personas separadas con «, » y link a su
	 * perfil (un nombre libre, sin perfil, va como texto). Recibe solo perfiles públicos: lo decide
	 * el servidor (src/lib/server/personas/); este componente no filtra nada.
	 * Sin personas ni etiquetas, no se muestra.
	 * Props: `groups` ({ rol, items: { slug, title, href }[] }[], o null), `tags`.
	 */
	import Tags from '$lib/components/Tags.svelte';

	/** @type {{ rol: string, items: { slug: string, title: string, href: string }[] }[] | null} */
	export let groups = [];
	/** @type {string[]} */
	export let tags = [];

	$: roles = groups ?? [];
</script>

{#if roles.length || tags.length}
	<section
		class="quienes surface-card"
		aria-labelledby={roles.length ? 'quienes-titulo' : 'etiquetas-titulo'}
	>
		{#if roles.length}
			<h2 id="quienes-titulo">Quiénes</h2>
			<dl>
				{#each roles as g (g.rol)}
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
		{/if}
		{#if tags.length}
			<h2 id="etiquetas-titulo" class:separado={roles.length > 0}>Etiquetas</h2>
			<div class="etiquetas" id="tags"><Tags {tags} /></div>
		{/if}
	</section>
{/if}

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
	.separado {
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
