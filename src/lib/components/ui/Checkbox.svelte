<script>
	/**
	 * Casilla con su texto (`.kv-check` de $lib/admin/panel-forms.scss; la casilla ya sale con el
	 * estilo del sitio, style.scss). Va cuando hay un botón Guardar; para prender o apagar algo al
	 * instante, `Switch`.
	 *
	 * Props: `checked` (bind:checked), `indeterminate`, `disabled`, `name`, `value`, `label` (o el
	 * slot default). Evento: `change`.
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
</script>

<label class="kv-check">
	<input type="checkbox" bind:checked {indeterminate} {disabled} {name} {value} on:change />
	{#if $$slots.default}<slot />{:else}{label}{/if}
</label>
