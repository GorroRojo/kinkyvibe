<script>
	/**
	 * «Este evento ya pasó» (con la próxima edición de la serie, si hay) o, con `cancelado`, «Este
	 * evento se canceló.», en la tarjeta de la página real (`.past-note`).
	 * Props: `next` (la edición siguiente o null), `cancelado`.
	 */
	import { ArrowRight } from '@lucide/svelte';

	/** @type {{ path: string } | null} */
	export let next = null;
	export let cancelado = false;
</script>

<p class="past-note surface-card" role="note">
	<strong>{cancelado ? 'Este evento se canceló.' : 'Este evento ya pasó.'}</strong>
	{#if next}
		<a href={next.path}>Próxima edición de la serie <ArrowRight size="1em" aria-hidden="true" /></a>
	{/if}
</p>

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
	a {
		display: inline-flex;
		align-items: center;
		gap: var(--space-3xs);
		min-height: var(--tap);
		font-weight: 700;
		color: var(--2-dark);
	}
</style>
