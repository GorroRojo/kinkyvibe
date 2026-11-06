<script>
	/**
	 * Gráfico chiquito de barras, sin ejes ni botones (la tarjeta «Visitas» de las fichas). Para
	 * ver los números está Chart.svelte; este solo muestra la forma. Mismo violeta que la primera
	 * serie de Chart.svelte, mismas barras (`barPath`).
	 * Props: `values` (una barra por número, en orden), `label` (nombre accesible: qué muestra y
	 * el total), `height` (px, default 40).
	 */
	import { barPath } from '$lib/admin/chartSeries.js';

	/** @type {readonly number[]} */
	export let values = [];
	export let label = '';
	export let height = 40;

	let width = 0;
	$: W = width || 240;
	$: top = Math.max(1, ...values);
	$: bw = W / Math.max(1, values.length);
	$: barW = Math.max(1, bw * 0.7);
</script>

<div class="spark" bind:clientWidth={width}>
	<!-- El alto también en style: el layout público tiene un `svg { height: 24px }` global. -->
	<svg
		width={W}
		{height}
		style:width="{W}px"
		style:height="{height}px"
		viewBox="0 0 {W} {height}"
		role="img"
		aria-label={label}
	>
		<line class="base" x1="0" x2={W} y1={height - 0.5} y2={height - 0.5} />
		{#each values as v, i (i)}
			<path
				class="mark"
				d={barPath(
					i * bw + (bw - barW) / 2,
					height,
					height - (Math.max(0, v) / top) * height,
					barW,
					2
				)}
			/>
		{/each}
	</svg>
</div>

<style>
	.spark {
		--c1: #813df5;
		width: 100%;
		min-width: 0;
	}
	@media (prefers-color-scheme: dark) {
		:global(:root[data-theme='auto']) .spark {
			--c1: #9a6af7;
		}
	}
	:global(:root[data-theme='dark']) .spark {
		--c1: #9a6af7;
	}
	svg {
		display: block;
	}
	.mark {
		fill: var(--c1);
	}
	.base {
		stroke: var(--line);
		stroke-width: 1;
	}
</style>
