<script>
	/**
	 * EL gráfico del panel: todos los gráficos de Estadísticas pasan por acá (un solo lugar para
	 * colores, ejes, tooltip, tabla y CSV). Dibuja SVG en el servidor y en el navegador (sin
	 * librería, sin canvas: se ve sin JavaScript y en el render del servidor), en píxeles del
	 * ancho real, así los textos no se achican en el celu.
	 *
	 * Props:
	 * - `title`: qué muestra (nombre accesible del gráfico y título de la tabla);
	 * - `rows`: una fila por columna del eje X;
	 * - `x`: `{ key, label, tick? }`: la columna de la etiqueta de cada fila (primera columna de la
	 *   tabla/CSV, y el tooltip) y, si es larga, `tick`: otra columna, corta, para el eje X;
	 * - `series`: `[{ key, label, mark? }]`, hasta 3 (colores fijos en ese orden); `mark: 'line'`
	 *   para una línea sobre las barras (misma unidad, mismo eje);
	 * - `stacked`: barras apiladas en lugar de una al lado de la otra;
	 * - `format`: cómo se escribe un valor (default: número entero);
	 * - `csv`: nombre del archivo CSV (sin fecha); `csvColumns`: columnas de más para el CSV;
	 * - `height` (px, default 220); `empty`: texto si no hay datos.
	 * Slot `controls`: botones al lado de "Gráfico / Tabla" (ej. Entradas / Plata).
	 */
	import { csvFilename } from '$lib/admin/csv.js';
	import { barPath, formatCount, labelEvery, niceTicks } from '$lib/admin/chartSeries.js';
	import CsvButton from '../panel/CsvButton.svelte';
	import Segmented from './Segmented.svelte';

	/** @type {string} */
	export let title;
	/** @type {ReadonlyArray<Record<string, any>>} */
	export let rows = [];
	/** @type {{ key: string, label: string, tick?: string }} */
	export let x;
	/** @type {ReadonlyArray<{ key: string, label: string, mark?: 'bar' | 'line' }>} */
	export let series = [];
	export let stacked = false;
	/** @type {(v: number) => string} */
	export let format = formatCount;
	/** @type {string} */
	export let csv = 'grafico';
	/** @type {ReadonlyArray<import('$lib/admin/csv.js').CsvColumn<any>>} */
	export let csvColumns = [];
	export let height = 220;
	export let empty = 'Todavía no hay datos.';

	let view = 'chart';
	let width = 0;
	/** @type {number | null} */
	let hover = null;

	$: W = width || 640;
	$: bars = series.filter((s) => s.mark !== 'line');
	$: lines = series.filter((s) => s.mark === 'line');
	/** @param {any} r @param {string} k */
	const val = (r, k) => Number(r?.[k] ?? 0) || 0;
	$: values = rows.flatMap((r) => [
		...(stacked
			? [bars.reduce((s, b) => s + Math.max(0, val(r, b.key)), 0)]
			: bars.map((b) => val(r, b.key))),
		...lines.map((l) => val(r, l.key))
	]);
	$: hasData = values.some((v) => v !== 0);
	$: ticks = niceTicks(Math.min(0, ...values), Math.max(0, ...values));
	$: lo = ticks[0];
	$: hi = ticks[ticks.length - 1];
	$: left = Math.max(28, ...ticks.map((t) => format(t).length * 7 + 10));
	$: PAD = { top: 10, right: 8, bottom: 26, left };
	$: plotW = Math.max(10, W - PAD.left - PAD.right);
	$: plotH = height - PAD.top - PAD.bottom;
	$: bw = plotW / Math.max(1, rows.length);
	/** @type {(v: number) => number} */
	$: y = (v) => PAD.top + plotH * (1 - (v - lo) / (hi - lo || 1));
	$: every = labelEvery(rows.length, plotW);
	$: inner = Math.max(2, bw * (stacked || bars.length < 2 ? 0.62 : 0.8));
	$: barW = stacked
		? inner
		: Math.max(1, (inner - 2 * (bars.length - 1)) / Math.max(1, bars.length));

	/** @param {number} i */
	const bandX = (i) => PAD.left + i * bw;

	/** @param {PointerEvent} e */
	function move(e) {
		const box = /** @type {SVGElement} */ (e.currentTarget).getBoundingClientRect();
		const i = Math.floor((e.clientX - box.left - PAD.left) / bw);
		hover = i >= 0 && i < rows.length ? i : null;
	}

	$: table = [
		{ key: x.key, label: x.label },
		...series.map((s) => ({ key: s.key, label: s.label }))
	];
	$: tooltipLeft = hover === null ? 0 : Math.min(Math.max(bandX(hover) + bw / 2, 90), W - 90);
</script>

<div class="kv-chart">
	<div class="bar">
		<slot name="controls" />
		<span class="grow"></span>
		<Segmented
			label="Cómo ver «{title}»"
			bind:value={view}
			options={[
				{ value: 'chart', label: 'Gráfico' },
				{ value: 'table', label: 'Tabla' }
			]}
		/>
		<CsvButton rows={[...rows]} columns={[...table, ...csvColumns]} filename={csvFilename(csv)} />
	</div>

	{#if series.length >= 2 && view === 'chart'}
		<ul class="legend" aria-hidden="true">
			{#each series as s, i (s.key)}
				<li><i class="sw c{i + 1}" class:line={s.mark === 'line'}></i>{s.label}</li>
			{/each}
		</ul>
	{/if}

	{#if !rows.length || !hasData}
		<p class="empty">{empty}</p>
	{:else if view === 'chart'}
		<div class="plot" bind:clientWidth={width}>
			<svg
				width={W}
				{height}
				viewBox="0 0 {W} {height}"
				role="img"
				aria-label="{title}. {rows.length} columnas; la tabla tiene los números."
				on:pointermove={move}
				on:pointerdown={move}
				on:pointerleave={() => (hover = null)}
			>
				{#each ticks as t (t)}
					<line
						class="grid"
						class:zero={t === 0}
						x1={PAD.left}
						x2={W - PAD.right}
						y1={y(t)}
						y2={y(t)}
					/>
					<text class="ytick" x={PAD.left - 6} y={y(t) + 4}>{format(t)}</text>
				{/each}
				{#if hover !== null}
					<rect class="band" x={bandX(hover)} y={PAD.top} width={bw} height={plotH} />
				{/if}
				{#each rows as r, i (i)}
					{@const x0 = bandX(i) + (bw - inner) / 2}
					{#if stacked}
						{@const parts = bars.map((b) => Math.max(0, val(r, b.key)))}
						{#each bars as b, j (b.key)}
							{@const below = parts.slice(0, j).reduce((s, v) => s + v, 0)}
							{@const top = j === bars.length - 1 || parts.slice(j + 1).every((v) => v === 0)}
							{#if parts[j] > 0}
								<path
									class="mark c{j + 1}"
									d={top
										? barPath(x0, y(below), y(below + parts[j]), barW)
										: barPath(x0, y(below), y(below + parts[j]), barW, 0)}
									transform={j > 0 ? `translate(0,${-2 * j})` : undefined}
								/>
							{/if}
						{/each}
					{:else}
						{#each bars as b, j (b.key)}
							<path
								class="mark c{j + 1}"
								d={barPath(x0 + j * (barW + 2), y(0), y(val(r, b.key)), barW)}
							/>
						{/each}
					{/if}
					{#if i % every === 0}
						<text class="xtick" x={bandX(i) + bw / 2} y={height - 8}>{r[x.tick ?? x.key]}</text>
					{/if}
				{/each}
				{#each lines as l (l.key)}
					{@const c = series.indexOf(l) + 1}
					<polyline
						class="line c{c}"
						points={rows.map((r, i) => `${bandX(i) + bw / 2},${y(val(r, l.key))}`).join(' ')}
					/>
					{#each rows as r, i (i)}
						<circle class="dot c{c}" cx={bandX(i) + bw / 2} cy={y(val(r, l.key))} r="4" />
					{/each}
				{/each}
			</svg>
			{#if hover !== null}
				<div class="tip" style="left:{tooltipLeft}px" role="status">
					<b>{rows[hover][x.key]}</b>
					{#each series as s, i (s.key)}
						<span
							><i class="sw c{i + 1}" class:line={s.mark === 'line'}></i>{s.label}: {format(
								val(rows[hover], s.key)
							)}</span
						>
					{/each}
				</div>
			{/if}
		</div>
	{:else}
		<div class="kv-table-wrap">
			<table class="kv-table">
				<caption class="sr">{title}</caption>
				<thead>
					<tr>
						{#each table as c, i (c.key)}<th class:r={i > 0}>{c.label}</th>{/each}
					</tr>
				</thead>
				<tbody>
					{#each rows as r, i (i)}
						<tr>
							<td>{r[x.key]}</td>
							{#each series as s (s.key)}<td class="r num">{format(val(r, s.key))}</td>{/each}
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</div>

<style>
	/* Colores de las series (validados para daltonismo con el surface de cada modo). */
	.kv-chart {
		--c1: #813df5;
		--c2: #c20a88;
		--c3: #cca300;
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
		min-width: 0;
	}
	@media (prefers-color-scheme: dark) {
		:global(:root[data-theme='auto']) .kv-chart {
			--c1: #9a6af7;
			--c2: #e0329f;
			--c3: #b38f00;
		}
	}
	:global(:root[data-theme='dark']) .kv-chart {
		--c1: #9a6af7;
		--c2: #e0329f;
		--c3: #b38f00;
	}
	.bar {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		align-items: center;
	}
	.grow {
		flex: 1;
	}
	.legend {
		display: flex;
		flex-wrap: wrap;
		gap: 0.3rem 1rem;
		margin: 0;
		padding: 0;
		list-style: none;
		font-size: 0.85rem;
		color: var(--muted);
	}
	.legend li {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
	}
	.sw {
		display: inline-block;
		width: 0.75rem;
		height: 0.75rem;
		border-radius: 3px;
		background: var(--c);
	}
	.sw.line {
		height: 3px;
		border-radius: 2px;
	}
	.c1 {
		--c: var(--c1);
	}
	.c2 {
		--c: var(--c2);
	}
	.c3 {
		--c: var(--c3);
	}
	.plot {
		position: relative;
		width: 100%;
		min-width: 0;
		touch-action: pan-y;
	}
	svg {
		display: block;
		overflow: visible;
	}
	.grid {
		stroke: var(--line);
		stroke-width: 1;
	}
	.grid.zero {
		stroke: var(--muted);
	}
	.ytick,
	.xtick {
		font-size: 12px;
		fill: var(--muted);
	}
	.ytick {
		text-anchor: end;
	}
	.xtick {
		text-anchor: middle;
	}
	.band {
		fill: var(--surface-2);
	}
	.mark {
		fill: var(--c);
	}
	.line {
		fill: none;
		stroke: var(--c);
		stroke-width: 2;
		stroke-linejoin: round;
	}
	.dot {
		fill: var(--c);
		stroke: var(--surface);
		stroke-width: 2;
	}
	.tip {
		position: absolute;
		top: 0;
		transform: translate(-50%, -100%);
		background: var(--surface);
		color: var(--text);
		border: 1px solid var(--line);
		border-radius: 0.6em;
		box-shadow: 0 4px 14px rgba(0, 0, 0, 0.15);
		padding: 0.4rem 0.6rem;
		font-size: 0.85rem;
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
		pointer-events: none;
		white-space: nowrap;
		z-index: 2;
	}
	.tip span {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
	}
	.empty {
		color: var(--muted);
		margin: 0;
		padding: 1.5rem 0;
		text-align: center;
	}
	.sr {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
		white-space: nowrap;
	}
</style>
