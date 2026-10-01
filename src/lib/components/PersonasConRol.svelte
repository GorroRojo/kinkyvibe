<script>
	/**
	 * Personas de un evento o publicación, por rol ("Organiza: Colectivo X, Persona Y"), cada una
	 * con link a su perfil. Recibe solo perfiles públicos (lo decide el servidor,
	 * src/lib/server/personas/): este componente no filtra nada.
	 *
	 * Props: `groups` ({ rol, items: { slug, title, href }[] }[]), `title` (encabezado).
	 */
	/** @type {{ rol: string, items: { slug: string, title: string, href: string }[] }[]} */
	export let groups = [];
	export let title = 'Quiénes';
</script>

{#if groups.length}
	<section class="personas" aria-label={title}>
		<dl>
			{#each groups as g (g.rol)}
				<div class="row">
					<dt>{g.rol}</dt>
					<dd>
						{#each g.items as p, i (p.slug)}<a class="h-card" href={p.href}>{p.title}</a
							>{#if i < g.items.length - 1}<span class="sep">, </span>{/if}{/each}
					</dd>
				</div>
			{/each}
		</dl>
	</section>
{/if}

<style>
	.personas {
		margin: 0.8em 0;
		padding: 0.6em 0.9em;
		border-radius: 0.8em;
		background: color-mix(in srgb, var(--2) 10%, white);
		font-size: var(--step--1);
	}
	dl {
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 0.3em;
	}
	.row {
		display: flex;
		flex-wrap: wrap;
		gap: 0.2em 0.6em;
		align-items: baseline;
	}
	dt {
		font-weight: bold;
		color: var(--2-dark);
		min-width: 6.5em;
	}
	dd {
		margin: 0;
		min-width: 0;
		overflow-wrap: anywhere;
	}
</style>
