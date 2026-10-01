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

<div class="seg" role="group" aria-label={label}>
	{#each options as o (o.value)}
		<button
			type="button"
			class:on={value === o.value}
			aria-pressed={value === o.value}
			on:click={() => (value = o.value)}>{o.label}</button
		>
	{/each}
</div>

<style>
	.seg {
		display: inline-flex;
		border: 1px solid var(--field);
		border-radius: 2em;
		overflow: hidden;
		flex-shrink: 0;
	}
	button {
		background: var(--surface);
		border: 0;
		padding: 0.3rem 0.75rem;
		min-height: 2.25rem;
		color: var(--accent);
		font-weight: 700;
		cursor: pointer;
	}
	button.on {
		background: var(--accent);
		color: var(--accent-ink);
	}
</style>
