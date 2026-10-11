<script>
	/**
	 * Tarjeta con radio (`.kv-choice` de style.scss): elegir una de pocas opciones cuando cada una
	 * lleva una descripción (como el medio de pago de la compra). Sin descripción, `Segmented`.
	 *
	 * Props: `group` (bind:group: el valor elegido), `value`, `name`, `title`, `text` (la línea
	 * gris), `disabled`. Slot default: contenido extra debajo del texto.
	 */
	/** @type {string} */
	export let group = '';
	/** @type {string} */
	export let value;
	/** @type {string} */
	export let name;
	/** @type {string} */
	export let title;
	/** @type {string} */
	export let text = '';
	export let disabled = false;
</script>

<label class="kv-choice">
	<input
		type="radio"
		{name}
		{value}
		{disabled}
		checked={group === value}
		on:change={() => (group = value)}
	/>
	<span>
		<strong>{title}</strong>
		{#if text}<small>{text}</small>{/if}
		<slot />
	</span>
</label>
