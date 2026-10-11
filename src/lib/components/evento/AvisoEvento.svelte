<script>
	/**
	 * El aviso de arriba en la página de un evento:
	 * - `cancelado`: el aviso grande, bien visible («CANCELADO» y «Este evento se canceló.»), en
	 *   rojo (`--error`: malas noticias, docs/estilo.md);
	 * - si no, «Este evento ya pasó.» (con la próxima edición de la serie, si hay: `next`).
	 * Props: `cancelado`, `next` ({ path } o null).
	 */
	import { ArrowRight } from '@lucide/svelte';

	export let cancelado = false;
	/** @type {{ path: string } | null} */
	export let next = null;
</script>

{#if cancelado}
	<div class="cancelado" role="note">
		<p class="grande">Cancelado</p>
		<p>Este evento se canceló.</p>
	</div>
{:else}
	<p class="past-note surface-card" role="note">
		<strong>Este evento ya pasó.</strong>
		{#if next}
			<a href={next.path}
				>Próxima edición de la serie <ArrowRight size="1em" aria-hidden="true" /></a
			>
		{/if}
	</p>
{/if}

<style>
	.past-note {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-2xs) var(--space-s);
		margin: 0;
		padding: var(--space-xs) var(--space-s);
	}
	.past-note a {
		display: inline-flex;
		align-items: center;
		gap: var(--space-3xs);
		min-height: var(--tap);
		font-weight: 700;
		color: var(--2-dark);
	}
	.cancelado {
		padding: var(--space-s) var(--space-m);
		border: 3px solid var(--error);
		border-radius: var(--radius-l);
		background: var(--error-bg);
		color: var(--error);
		text-align: center;
	}
	.cancelado p {
		margin: 0;
		font-weight: 700;
	}
	.grande {
		font-size: var(--text-3xl);
		line-height: 1.1;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}
</style>
