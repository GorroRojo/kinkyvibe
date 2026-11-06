<script>
	/**
	 * Casilla con su texto (`.kv-check` de $lib/admin/panel-forms.scss; la casilla ya sale con el
	 * estilo del sitio, style.scss). Va cuando hay un botón Guardar; para prender o apagar algo al
	 * instante, `Switch`.
	 *
	 * Props: `checked` (bind:checked), `indeterminate`, `disabled`, `name`, `value`, `label` (o el
	 * slot default), `surface`: 'panel' (default, `.kv-check`) | 'sitio' (fuera del panel: la misma
	 * fila de 44px con los tokens del sitio y el borde de la casilla a 3:1 sobre blanco).
	 * Evento: `change`.
	 */
	import '$lib/admin/panel-forms.scss';

	export let checked = false;
	export let indeterminate = false;
	export let disabled = false;
	/** @type {string | undefined} */
	export let name = undefined;
	/** @type {string | undefined} */
	export let value = undefined;
	/** @type {string} */
	export let label = '';
	/** @type {'panel' | 'sitio'} */
	export let surface = 'panel';
</script>

<label class:kv-check={surface !== 'sitio'} class:kv-check-sitio={surface === 'sitio'}>
	<input type="checkbox" bind:checked {indeterminate} {disabled} {name} {value} on:change />
	{#if $$slots.default}<slot />{:else}{label}{/if}
</label>

<style>
	/* Sitio: la fila de `.kv-check` (panel-forms.scss) con los tokens del sitio. La casilla es la
	   de style.scss; acá solo se le oscurece el borde (`--field` llega a 2.2:1 sobre blanco). */
	.kv-check-sitio {
		display: flex;
		align-items: center;
		gap: var(--space-2xs);
		min-height: var(--tap);
		color: var(--ink);
		cursor: pointer;
	}
	.kv-check-sitio > input:not(:checked, :indeterminate) {
		border-color: color-mix(in srgb, var(--muted) 75%, var(--surface));
	}
	.kv-check-sitio:has(> input:disabled) {
		color: var(--muted);
		cursor: not-allowed;
	}
</style>
