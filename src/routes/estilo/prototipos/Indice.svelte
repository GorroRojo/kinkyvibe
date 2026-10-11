<script>
	/**
	 * Índice de los prototipos (/estilo/prototipos): pantallas clickeables para mirar y decidir
	 * antes de hacerlas de verdad (docs/hoja-de-ruta.md, «Prototipos»). Solo en previews y en dev.
	 */
	import { ChevronRight, Filter, Hourglass } from '@lucide/svelte';
	import Marco from './Marco.svelte';
	import { PROTOTIPOS } from './prototipos.js';

	/** @type {Record<string, any>} */
	const ICONOS = {
		'filtros-celu': Filter,
		'filtros-celu-v2': Filter,
		'lista-de-espera': Hourglass
	};
</script>

<Marco
	title="Prototipos"
	explora="Pantallas para tocar y opinar antes de hacerlas de verdad. Miralas con el ancho de un celu."
	back={null}
>
	<ul class="lista">
		{#each PROTOTIPOS as p (p.slug)}
			<li>
				<a href="/estilo/prototipos/{p.slug}">
					<svelte:component this={ICONOS[p.slug]} size={28} aria-hidden="true" />
					<span class="texto">
						<strong>{p.nombre}</strong>
						<span>{p.explora}</span>
					</span>
					<ChevronRight size={20} aria-hidden="true" />
				</a>
			</li>
		{/each}
	</ul>
	<p class="nota">
		Volver a la <a class="kv-link" href="/estilo">galería de componentes</a>.
	</p>
</Marco>

<style>
	.lista {
		list-style: none;
		margin: 0 auto;
		padding: 0;
		max-width: 40rem;
		display: flex;
		flex-direction: column;
		gap: var(--space-2xs);
	}
	a {
		display: flex;
		align-items: center;
		gap: var(--space-xs);
		padding: var(--space-xs) var(--space-s);
		background: var(--surface);
		border-radius: var(--radius-m);
		box-shadow: var(--shadow-1);
		color: var(--ink);
		text-decoration: none;
	}
	a:hover,
	a:focus-visible {
		box-shadow: var(--shadow-2);
	}
	a > :global(svg:first-child) {
		color: var(--1);
		flex: none;
	}
	.texto {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: var(--space-3xs);
		font-size: var(--text-sm);
	}
	.texto strong {
		font-size: var(--text-base);
		color: var(--1-ink);
	}
	.nota {
		max-width: 40rem;
		margin: var(--space-m) auto 0;
		font-size: var(--text-sm);
		color: var(--muted);
	}
	.nota a {
		display: inline;
		padding: 0;
		background: none;
		box-shadow: none;
		color: var(--2-dark);
		text-decoration: underline;
	}
</style>
