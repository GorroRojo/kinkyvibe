<script>
	/**
	 * Interruptor (`<input type="checkbox" role="switch">`, estilo de style.scss): para prender o
	 * apagar algo al instante, sin botón Guardar (como Ajustes › Interruptores). Al lado muestra en
	 * qué quedó el guardado con `SaveStatus` («Guardando…» → «Guardado ✓»).
	 *
	 * Props: `checked` (bind:checked), `disabled`, `name`, `value`, `label` (texto visible; también
	 * es el nombre accesible), `onLabel` / `offLabel` (opcionales: «Prendido» / «Apagado» al lado),
	 * `status`: '' | 'saving' | 'saved' | 'error' (ver SaveStatus), `error` (texto del error).
	 * `surface`: 'panel' (default, `.kv-check switch`) | 'sitio' (fuera del panel: la misma fila con
	 * los tokens del sitio y el riel apagado a 3:1 sobre blanco).
	 * Evento: `change`. La etiqueta va en letra normal, como la de `Checkbox` (gorrite, 12/10);
	 * apagado, más clara.
	 */
	import '$lib/admin/panel-forms.scss';
	import SaveStatus from './SaveStatus.svelte';

	export let checked = false;
	export let disabled = false;
	/** @type {string | undefined} */
	export let name = undefined;
	/** @type {string | undefined} */
	export let value = undefined;
	/** @type {string} */
	export let label;
	/** @type {string} */
	export let onLabel = '';
	/** @type {string} */
	export let offLabel = '';
	/** @type {'' | 'saving' | 'saved' | 'error'} */
	export let status = '';
	/** @type {string} */
	export let error = '';
	/** @type {'panel' | 'sitio'} */
	export let surface = 'panel';

	$: stateText = checked ? onLabel : offLabel;
</script>

<label
	class="switch"
	class:kv-check={surface !== 'sitio'}
	class:kv-check-sitio={surface === 'sitio'}
	class:saving={status === 'saving'}
>
	<input
		type="checkbox"
		role="switch"
		bind:checked
		disabled={disabled || status === 'saving'}
		{name}
		{value}
		aria-label={stateText ? label : undefined}
		on:change
	/>
	<span>{stateText || label}</span>
	<SaveStatus {status} {error} />
</label>

<style>
	/* Sitio: la fila de `.kv-check` (panel-forms.scss) con los tokens del sitio. El interruptor
	   es el de style.scss; apagado, el riel más oscuro para llegar a 3:1 sobre blanco. */
	.kv-check-sitio {
		display: flex;
		align-items: center;
		gap: var(--space-2xs);
		min-height: var(--tap);
		color: var(--ink);
		cursor: pointer;
	}
	.kv-check-sitio > input:not(:checked) {
		background: color-mix(in srgb, var(--muted) 75%, var(--surface));
	}
	.kv-check-sitio:has(> input:disabled):not(.saving) {
		color: var(--muted);
		cursor: not-allowed;
	}
</style>
