<script>
	/**
	 * Número grande con etiqueta (tarjeta de KPI).
	 * Props: `label` (arriba), `value` (el número, ya formateado), `sub` (abajo, opcional),
	 * `tone`: '' | 'ok' | 'warn' | 'bad' (color del número), `href` (opcional: la tarjeta es un link).
	 * Slot default: debajo del número (ej. una CapacityBar).
	 */
	/** @type {string} */
	export let label;
	/** @type {string | number} */
	export let value;
	/** @type {string} */
	export let sub = '';
	/** @type {'' | 'ok' | 'warn' | 'bad'} */
	export let tone = '';
	/** @type {string} */
	export let href = '';
</script>

<svelte:element this={href ? 'a' : 'div'} href={href || undefined} class="stat">
	<small>{label}</small>
	<b class="num {tone}">{value}</b>
	<slot />
	{#if sub}<small>{sub}</small>{/if}
</svelte:element>

<style>
	.stat {
		background: var(--surface);
		border-radius: 1rem;
		box-shadow: var(--shadow);
		padding: 1rem 1.1rem;
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
		min-width: 0;
		text-decoration: none;
		color: var(--text);
	}
	a.stat:hover {
		outline: 2px solid var(--link-bg);
		color: var(--text);
	}
	small {
		color: var(--muted);
	}
	b {
		font-size: 1.6rem;
		font-weight: 700;
		font-variant-numeric: tabular-nums;
		overflow-wrap: anywhere;
		line-height: 1.15;
	}
	.ok {
		color: var(--ok);
	}
	.warn {
		color: var(--warn);
	}
	.bad {
		color: var(--bad);
	}
</style>
