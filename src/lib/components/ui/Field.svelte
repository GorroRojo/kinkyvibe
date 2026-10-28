<script context="module">
	let nextId = 0;
</script>

<script>
	/**
	 * Campo de texto con su etiqueta, ayuda y error (`.kv-field` de $lib/admin/panel-forms.scss):
	 * rectángulo neutro de 44px con letra de 16px, borde rosa con foco, borde rojo con error.
	 * Píldora solo si es buscador (`type="search"`). Grande (`size="large"`, ~54px y letra de
	 * `--text-base`, `.kv-field.large` de panel-forms.scss) solo en el flujo de compra. Apagado
	 * (`disabled`): fondo gris, borde punteado y la etiqueta más clara.
	 * `surface`: 'panel' (default; las clases de panel-forms.scss, va dentro de `.kv-panel`) |
	 * 'sitio' (fuera del panel: el mismo campo con los tokens del sitio, `--ink`, `--muted`,
	 * `--error`, y un borde más oscuro que `--field` para llegar a 3:1 sobre blanco).
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
	/** @type {'panel' | 'sitio'} */
	export let surface = 'panel';

	$: helpId = help ? `${id}-help` : '';
	$: errorId = error ? `${id}-error` : '';
	$: describedBy = [errorId, helpId].filter(Boolean).join(' ') || undefined;

	/** @param {Event} e */
	function onInput(e) {
		value = /** @type {HTMLInputElement} */ (e.currentTarget).value;
	}
</script>

<label
	class:kv-field={surface !== 'sitio'}
	class:kv-field-sitio={surface === 'sitio'}
	class:large={size === 'large'}
	for={id}
>
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
	/* Sitio (`surface="sitio"`): lo mismo que `.kv-field` del panel (panel-forms.scss) con los
	   tokens del sitio. El foco (borde rosa) y el texto de ejemplo salen de style.scss. */
	.kv-field-sitio {
		--field-sitio: color-mix(in srgb, var(--muted) 75%, var(--surface));
		display: flex;
		flex-direction: column;
		gap: var(--space-3xs);
		min-width: 0;
		color: var(--ink);
	}
	.kv-field-sitio > span:first-child {
		font-weight: 700;
		font-size: var(--text-sm);
	}
	.kv-field-sitio small {
		color: var(--muted);
		font-size: var(--text-sm);
	}
	.kv-field-sitio .kv-error {
		color: var(--error);
	}
	.kv-field-sitio > :global(:is(input:not([type='checkbox'], [type='radio']), select, textarea)) {
		background: var(--surface);
		color: var(--ink);
		border: 1px solid var(--field-sitio);
		border-radius: var(--radius-s);
		padding: 0.5em 0.75em;
		min-height: var(--tap);
		font-size: var(--text-field);
		min-width: 0;
		width: 100%;
		box-sizing: border-box;
	}
	.kv-field-sitio > :global(:is(input, select, textarea):focus) {
		border-color: var(--focus-field);
	}
	.kv-field-sitio > :global(:is(input, select, textarea)[aria-invalid='true']) {
		border-color: var(--error);
		border-width: 2px;
	}
	.kv-field-sitio > input[type='search'] {
		border-radius: var(--radius-pill);
		padding-inline: 1em;
	}
	.kv-field-sitio.large
		> :global(:is(input:not([type='checkbox'], [type='radio']), select, textarea)) {
		min-height: 3.375rem;
		font-size: var(--text-base);
	}
	.kv-field-sitio > :global(:is(input, select, textarea):disabled) {
		background: var(--bg);
		color: var(--muted);
		border-style: dashed;
		cursor: not-allowed;
	}
	.kv-field-sitio:has(> :global(:is(input, select, textarea):disabled)) > span:first-child {
		color: var(--muted);
	}
	.kv-field-sitio > textarea {
		resize: vertical;
		line-height: 1.45;
	}
</style>
