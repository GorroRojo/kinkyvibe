<script>
	/**
	 * Barras horizontales (CSS) para rankings: una fila por ítem con etiqueta, barra y valor.
	 * Un solo color (el violeta del sitio). Tooltip nativo con el detalle.
	 * Props: `items`: { label, value, text?, sub?, title?, href? }[]; `max` (opcional; si no, el
	 * mayor valor); `label` (texto accesible de la lista).
	 */
	/** @type {{ label: string, value: number, text?: string, sub?: string, title?: string, href?: string }[]} */
	export let items = [];
	/** @type {number | undefined} */
	export let max = undefined;
	export let label = '';

	$: top = max ?? Math.max(1, ...items.map((i) => i.value));
</script>

<ul class="bars" aria-label={label || undefined}>
	{#each items as i, n (n)}
		<li title={i.title ?? `${i.label}: ${i.text ?? i.value}`}>
			<div class="row">
				{#if i.href}<a class="label" href={i.href}>{i.label}</a>{:else}<span class="label"
						>{i.label}</span
					>{/if}
				<b class="num">{i.text ?? i.value}</b>
			</div>
			<div class="track">
				<i style="width:{Math.max(0, Math.min(100, (i.value / top) * 100))}%"></i>
			</div>
			{#if i.sub}<small class="muted">{i.sub}</small>{/if}
		</li>
	{/each}
</ul>

<style>
	.bars {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-2xs);
	}
	.row {
		display: flex;
		justify-content: space-between;
		gap: var(--space-2xs);
		align-items: baseline;
	}
	.label {
		min-width: 0;
		overflow-wrap: anywhere;
	}
	.num {
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}
	.track {
		height: 0.55rem;
		border-radius: 4px;
		background: var(--bar-track);
		margin-top: 0.2rem;
	}
	i {
		display: block;
		height: 100%;
		border-radius: 4px;
		background: var(--link);
	}
	small {
		font-size: var(--text-xs);
	}
</style>
