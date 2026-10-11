<script>
	/** /legales: la lista de borradores. */
	import Legal from './Legal.svelte';

	export let slug = '';
	/** @type {readonly import('./paginas.js').PaginaLegal[]} */
	export let paginas = [];
</script>

<Legal titulo="Legales" {slug} paginas={[]}>
	<p>
		Acá van a estar las reglas del sitio y cómo cuidamos tus datos, escritas para que se entiendan.
		Por ahora son borradores para que los revisen gorrite, la organización y alguien que sepa de
		leyes.
	</p>
	<ul class="lista">
		{#each paginas as p}
			<li>
				<a href="/legales/{p.slug}">{p.titulo}</a>
				<span>{p.resumen}</span>
			</li>
		{/each}
	</ul>
</Legal>

<style>
	.lista {
		list-style: none;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-xs);
	}
	.lista li {
		display: flex;
		flex-direction: column;
		gap: var(--space-3xs);
	}
	.lista a {
		font-weight: 700;
	}
	.lista span {
		font-size: var(--text-sm);
		color: var(--muted);
	}
</style>
