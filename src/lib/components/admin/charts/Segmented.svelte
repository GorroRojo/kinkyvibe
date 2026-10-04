<script>
	/**
	 * Botones de "una opción entre pocas" (Entradas / Plata, Día / Semana, Gráfico / Tabla).
	 * Props: `options` ([{ value, label }]), `value` (bind:value), `label` (nombre del grupo para
	 * lectores de pantalla).
	 */
	/** @type {ReadonlyArray<{ value: string, label: string }>} */
	export let options = [];
	/** @type {string} */
	export let value = '';
	/** @type {string} */
	export let label;
</script>

<!-- Estilo compartido: .kv-segmented (style.scss), como «Mostrar | Ocultar» del sitio. -->
<div class="kv-segmented seg" role="group" aria-label={label}>
	{#each options as o (o.value)}
		<button type="button" aria-pressed={value === o.value} on:click={() => (value = o.value)}
			>{o.label}</button
		>
	{/each}
</div>

<style>
	.seg {
		flex-shrink: 0;
	}
</style>
