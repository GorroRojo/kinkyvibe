<script>
	/**
	 * «Falta 3» (o «Completo») de un borrador, con la lista en el tooltip y para lectores de
	 * pantalla. Prop: `missing` (MissingItem[], ver eventMissing.js).
	 */
	import { missingSummary } from '$lib/utils/eventMissing.js';

	/** @type {import('$lib/utils/eventMissing.js').MissingItem[]} */
	export let missing = [];

	$: summary = missingSummary(missing);
</script>

<span
	class="missing-badge"
	class:done={!missing.length}
	title={summary || 'Tiene todo lo principal: listo para confirmar'}
	aria-label={summary ? `Borrador. ${summary}` : 'Borrador completo, listo para confirmar'}
	>{missing.length ? `Falta ${missing.length}` : 'Completo'}</span
>

<style>
	.missing-badge {
		display: inline-block;
		margin-top: 0.2rem;
		padding: 0 0.45em;
		border-radius: 1em;
		border: 1px solid var(--warn);
		background: var(--warn-bg);
		color: var(--text);
		font-size: 0.75rem;
		font-weight: 700;
		line-height: 1.5;
		white-space: nowrap;
		cursor: help;
	}
	.done {
		border-color: var(--ok);
		background: var(--ok-bg);
	}
</style>
