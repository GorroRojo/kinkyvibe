<script>
	/**
	 * Interruptor (`<input type="checkbox" role="switch">`, estilo de style.scss): para prender o
	 * apagar algo al instante, sin botón Guardar (como Ajustes › Interruptores). Al lado muestra en
	 * qué quedó el guardado con `SaveStatus` («Guardando…» → «Guardado ✓»).
	 *
	 * Props: `checked` (bind:checked), `disabled`, `name`, `value`, `label` (texto visible; también
	 * es el nombre accesible), `onLabel` / `offLabel` (opcionales: «Prendido» / «Apagado» al lado),
	 * `status`: '' | 'saving' | 'saved' | 'error' (ver SaveStatus), `error` (texto del error).
	 * Evento: `change`.
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

	$: stateText = checked ? onLabel : offLabel;
</script>

<label class="kv-check switch">
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
	.switch {
		font-weight: 700;
	}
</style>
