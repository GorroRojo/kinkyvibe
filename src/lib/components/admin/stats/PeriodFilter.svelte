<script>
	/**
	 * Filtro de período (y de serie, en Ventas) de Estadísticas. Son links y un formulario GET: el
	 * período va en la URL (`?periodo=12m`), así se puede compartir y el `load` del servidor lo lee
	 * ($lib/admin/statsPeriod.js).
	 * Props: `path` (la URL de la pestaña), `periods`, `current` (id del período elegido),
	 * `serieOptions` (opcional: con opciones aparece el selector de serie) y `serie` (la elegida).
	 */
	import { PERIOD_PARAM, SERIE_PARAM, filterHref } from '$lib/admin/statsPeriod.js';

	/** @type {string} */
	export let path;
	/** @type {readonly import('$lib/admin/statsPeriod.js').Period[]} */
	export let periods;
	/** @type {string} */
	export let current;
	/** @type {{ value: string, label: string }[] | null} */
	export let serieOptions = null;
	/** @type {string} */
	export let serie = '';

	/** @type {HTMLFormElement | undefined} */
	let form;
</script>

<div class="filters">
	<nav class="kv-segmented" aria-label="Período">
		{#each periods as p (p.id)}
			<a
				href={filterHref(path, { [PERIOD_PARAM]: p.id, [SERIE_PARAM]: serie })}
				aria-current={p.id === current ? 'true' : undefined}
				data-sveltekit-noscroll>{p.label}</a
			>
		{/each}
	</nav>
	{#if serieOptions}
		<form method="GET" action={path} bind:this={form} data-sveltekit-noscroll>
			<input type="hidden" name={PERIOD_PARAM} value={current} />
			<label>
				<span>Serie</span>
				<select
					class="kv-input"
					name={SERIE_PARAM}
					value={serie}
					on:change={() => form?.requestSubmit()}
				>
					<option value="">Todas las series</option>
					{#each serieOptions as o (o.value)}<option value={o.value}>{o.label}</option>{/each}
				</select>
			</label>
			<noscript><button class="kv-btn" type="submit">Ver</button></noscript>
		</form>
	{/if}
</div>

<style>
	.filters {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-xs, 0.6rem) var(--space-s, 1rem);
		margin-bottom: var(--space-s, 1rem);
	}
	form {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		min-width: 0;
		max-width: 100%;
	}
	label {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		min-width: 0;
		max-width: 100%;
		font-size: var(--text-sm);
	}
	select {
		min-width: 0;
		max-width: 16rem;
	}
</style>
