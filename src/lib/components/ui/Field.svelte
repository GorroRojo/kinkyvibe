<script context="module">
	let nextId = 0;
</script>

<script>
	/**
	 * Campo de texto con su etiqueta, ayuda y error (`.kv-field` de $lib/admin/panel-forms.scss):
	 * rectángulo neutro de 44px con letra de 16px, borde rosa con foco, borde rojo con error.
	 * Píldora solo si es buscador (`type="search"`). Grande (`size="large"`, ~54px) solo en el flujo
	 * de compra. Por ahora tiene el aspecto del panel (va dentro de `.kv-panel`).
	 *
	 * Props: `label`, `help` (texto gris abajo), `error` (texto rojo abajo; marca el campo con
	 * `aria-invalid`), `size`: 'normal' | 'large', `type` ('text', 'search', 'email', 'number',
	 * 'tel', 'url', 'password', 'date', 'time' o 'textarea'), `value` (bind:value), `placeholder`,
	 * `name`, `id`, `required`, `disabled`, `autocomplete`, `rows` (textarea), `inputmode`.
	 * Slot default: un control propio (un <select>, un combobox…) en lugar del input; en ese caso
	 * `value` y `type` no se usan y el control tiene que llevar el `id` (slot prop `id`).
	 */
	import '$lib/admin/panel-forms.scss';

	/** @type {string} */
	export let label;
	/** @type {string} */
	export let help = '';
	/** @type {string} */
	export let error = '';
	/** @type {'normal' | 'large'} */
	export let size = 'normal';
	/** @type {string} */
	export let type = 'text';
	/** @type {string | number | null | undefined} */
	export let value = '';
	/** @type {string | undefined} */
	export let placeholder = undefined;
	/** @type {string | undefined} */
	export let name = undefined;
	/** @type {string} */
	export let id = `kv-field-${++nextId}`;
	export let required = false;
	export let disabled = false;
	/** @type {any} */
	export let autocomplete = undefined;
	/** @type {number} */
	export let rows = 4;
	/** @type {any} */
	export let inputmode = undefined;

	$: helpId = help ? `${id}-help` : '';
	$: errorId = error ? `${id}-error` : '';
	$: describedBy = [errorId, helpId].filter(Boolean).join(' ') || undefined;

	/** @param {Event} e */
	function onInput(e) {
		value = /** @type {HTMLInputElement} */ (e.currentTarget).value;
	}
</script>

<label class="kv-field" class:large={size === 'large'} for={id}>
	<span>{label}</span>
	{#if $$slots.default}
		<slot {id} {describedBy} />
	{:else if type === 'textarea'}
		<textarea
			{id}
			{name}
			{placeholder}
			{required}
			{disabled}
			{rows}
			{autocomplete}
			value={value ?? ''}
			aria-invalid={error ? 'true' : undefined}
			aria-describedby={describedBy}
			on:input={onInput}
			on:change
			on:blur></textarea>
	{:else}
		<input
			{id}
			{type}
			{name}
			{placeholder}
			{required}
			{disabled}
			{autocomplete}
			{inputmode}
			value={value ?? ''}
			aria-invalid={error ? 'true' : undefined}
			aria-describedby={describedBy}
			on:input={onInput}
			on:change
			on:blur
		/>
	{/if}
	{#if error}<small class="kv-error" id={errorId}>{error}</small>{/if}
	{#if help}<small id={helpId}>{help}</small>{/if}
</label>

<style>
	/* Grande, como `.kv-input.large` del panel: solo en el flujo de compra. */
	label.large input,
	label.large textarea {
		min-height: 3.375rem;
		font-size: var(--text-base);
	}
</style>
