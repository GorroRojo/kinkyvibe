<script>
	/** «Este evento ya pasó», como en la página real (con la próxima edición de la serie). */
	import { ArrowRight } from '@lucide/svelte';
	import { series } from './datos.js';
	const next = series.list[0].next;
</script>

<p class="past-note surface-card" role="note">
	<strong>Este evento ya pasó.</strong>
	<a href={next.path}>Próxima edición de la serie <ArrowRight size="1em" aria-hidden="true" /></a>
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
