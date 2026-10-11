<script>
	/**
	 * Caja «Para decidir» de un prototipo: las preguntas abiertas, cada una con lo que propone el
	 * prototipo (si propone algo). Para que gorrite y les organizadores contesten antes de hacerlo
	 * de verdad.
	 *
	 * Props: `items`: { pregunta, propuesta? }[].
	 */
	import { MessageCircleQuestion } from '@lucide/svelte';

	/** @type {{ pregunta: string, propuesta?: string }[]} */
	export let items = [];
</script>

<aside class="decidir" aria-labelledby="para-decidir">
	<h2 id="para-decidir"><MessageCircleQuestion size={20} aria-hidden="true" />Para decidir</h2>
	<ol>
		{#each items as item (item.pregunta)}
			<li>
				<strong>{item.pregunta}</strong>
				{#if item.propuesta}<span class="propuesta">El prototipo muestra: {item.propuesta}</span
					>{/if}
			</li>
		{/each}
	</ol>
</aside>

<style>
	.decidir {
		max-width: 40rem;
		margin: var(--space-m) auto 0;
		padding: var(--space-xs) var(--space-s);
		background: var(--surface);
		border: 2px dashed var(--4-dark);
		border-radius: var(--radius-m);
	}
	h2 {
		display: flex;
		align-items: center;
		gap: var(--space-3xs);
		margin: 0 0 var(--space-2xs);
		font-size: var(--text-lg);
		color: var(--4-ink);
	}
	ol {
		margin: 0;
		padding-left: 1.2em;
		display: flex;
		flex-direction: column;
		gap: var(--space-2xs);
		font-size: var(--text-sm);
	}
	.propuesta {
		display: block;
		color: var(--muted);
	}
</style>
