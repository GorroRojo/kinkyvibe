<script>
	/**
	 * Caja «Patrón» de cada opción de navegación: en qué patrón investigado se apoya, los
	 * hallazgos con su fuente (investigacion.js) y links a las otras opciones y al índice.
	 *
	 * Props: `opcion`: 'secciones' | 'grilla' | 'propuesta'. Slot default: el porqué (C).
	 */
	import { BookOpenCheck } from '@lucide/svelte';
	import { OPCIONES } from './datos.js';
	import { HALLAZGOS, PATRON_DE } from './investigacion.js';

	/** @type {'secciones' | 'grilla' | 'propuesta'} */
	export let opcion;

	$: def = PATRON_DE[opcion];
	$: hallazgos = HALLAZGOS.filter((h) => def.hallazgos.includes(h.id));
</script>

<section class="patron" aria-labelledby="patron-{opcion}">
	<h2 id="patron-{opcion}"><BookOpenCheck size={20} aria-hidden="true" />Patrón: {def.patron}</h2>
	<slot />
	<p class="rotulo">Se apoya en</p>
	<ul>
		{#each hallazgos as h (h.id)}
			<li>
				<a class="kv-link" href="/estilo/prototipos/panel-nav/investigacion#{h.id}">{h.titulo}</a>
				<span class="fuente"
					>({#each h.fuentes as f, i (f.url)}{#if i},
						{/if}<a class="kv-link" href={f.url} rel="noopener noreferrer" target="_blank"
							>{f.label.split(':')[0]}</a
						>{/each})</span
				>
			</li>
		{/each}
	</ul>
	<nav class="otras" aria-label="Las tres opciones">
		<a class="kv-link" href="/estilo/prototipos/panel-nav">Comparación</a>
		{#each OPCIONES as o (o.slug)}
			<a
				class="kv-link"
				href="/estilo/prototipos/panel-nav/{o.slug}"
				aria-current={o.slug === opcion ? 'page' : undefined}>{o.letra}. {o.nombre}</a
			>
		{/each}
		<a class="kv-link" href="/estilo/prototipos/panel-nav/investigacion">Investigación</a>
	</nav>
</section>

<style>
	.patron {
		max-width: 40rem;
		margin: var(--space-s) auto 0;
		padding: var(--space-xs) var(--space-s);
		background: var(--surface);
		border-left: 4px solid var(--2);
		border-radius: var(--radius-m);
		font-size: var(--text-sm);
	}
	h2 {
		display: flex;
		align-items: flex-start;
		gap: var(--space-3xs);
		margin: 0 0 var(--space-2xs);
		font-size: var(--text-base);
		color: var(--2-dark);
	}
	h2 :global(svg) {
		flex: none;
		margin-top: 0.15em;
	}
	.rotulo {
		margin: var(--space-2xs) 0 var(--space-3xs);
		font-size: var(--text-xs);
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--muted);
	}
	ul {
		margin: 0;
		padding-left: 1.2em;
		display: flex;
		flex-direction: column;
		gap: var(--space-3xs);
	}
	.fuente {
		color: var(--muted);
		font-size: var(--text-xs);
	}
	.otras {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-3xs) var(--space-xs);
		margin-top: var(--space-xs);
		padding-top: var(--space-2xs);
		border-top: 1px solid var(--4-tint);
	}
	.otras a[aria-current] {
		font-weight: 700;
		text-decoration: none;
		color: var(--ink);
	}
</style>
