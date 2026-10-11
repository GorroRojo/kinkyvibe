<script>
	/**
	 * Marco de cada borrador legal: el aviso de borrador, el título, el índice de secciones y, al
	 * pie, las otras páginas. Lleva la marca que busca `node scripts/demo/guard.js bundle`: si
	 * aparece en el bundle de producción, los borradores se colaron (docs/legales.md).
	 *
	 * Slot default: las secciones (`<section id="…">` con su `<h2>`).
	 */
	import { Notice } from '$lib/components/ui';

	/** @type {string} */
	export let titulo;
	/** @type {string} */
	export let slug = '';
	/** @type {readonly import('./paginas.js').PaginaLegal[]} */
	export let paginas = [];
	/** Las secciones, para «En esta página». @type {{ id: string, titulo: string }[]} */
	export let secciones = [];

	$: otras = paginas.filter((p) => p.slug !== slug);
</script>

<article class="legal" data-kv-legales={'kv-legales-borrador'}>
	{#if slug}
		<p class="volver"><a href="/legales">Legales</a></p>
	{/if}
	<h1>{titulo}</h1>

	<Notice tone="warn" role={null}>
		<strong>Borrador sin publicar.</strong> Este texto todavía no está vigente ni lo revisó une abogade:
		no es asesoramiento legal. Solo se ve en los previews y en desarrollo. Las notas «Para revisar» marcan
		lo que falta decidir.
	</Notice>

	{#if secciones.length}
		<nav class="indice" aria-label="En esta página">
			<h2>En esta página</h2>
			<ol>
				{#each secciones as s}
					<li><a href="#{s.id}">{s.titulo}</a></li>
				{/each}
			</ol>
		</nav>
	{/if}

	<div class="texto">
		<slot />
	</div>

	{#if otras.length}
		<nav class="otras" aria-label="Otras páginas legales">
			<h2>Otras páginas legales</h2>
			<ul>
				{#each otras as p}
					<li><a href="/legales/{p.slug}">{p.titulo}</a></li>
				{/each}
			</ul>
		</nav>
	{/if}
</article>

<style>
	.legal {
		max-width: 44rem;
		width: calc(100% - 32px);
		box-sizing: border-box;
		margin: var(--space-s) auto var(--space-l);
		background: var(--surface);
		border-radius: var(--radius-l);
		box-shadow: var(--shadow-1);
		padding: var(--space-s-m);
		display: flex;
		flex-direction: column;
		gap: var(--space-xs);
		overflow-wrap: anywhere;
	}
	.volver {
		margin: 0;
		font-size: var(--text-sm);
	}
	.legal a {
		color: var(--2-dark);
	}
	h1 {
		margin: 0;
		font-size: var(--text-2xl);
		line-height: 1.15;
	}
	.indice,
	.otras {
		border-top: 1px solid color-mix(in srgb, var(--muted) 25%, transparent);
		padding-top: var(--space-xs);
	}
	.indice h2,
	.otras h2 {
		margin: 0 0 var(--space-3xs);
		font-size: var(--text-sm);
		color: var(--muted);
	}
	.indice ol,
	.otras ul {
		margin: 0;
		padding-left: 1.4em;
		font-size: var(--text-sm);
	}
	.texto {
		font-size: var(--text-base);
		line-height: 1.55;
	}
	.texto :global(section) {
		scroll-margin-top: var(--space-xl);
	}
	.texto :global(h2) {
		font-size: var(--text-xl);
		margin: var(--space-m) 0 var(--space-2xs);
		line-height: 1.2;
	}
	.texto :global(h3) {
		font-size: var(--text-lg);
		margin: var(--space-s) 0 var(--space-3xs);
	}
	.texto :global(p),
	.texto :global(ul),
	.texto :global(ol) {
		margin: 0 0 var(--space-2xs);
	}
	.texto :global(li + li) {
		margin-top: var(--space-3xs);
	}
</style>
