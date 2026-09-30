<script>
	/**
	 * Estadísticas y tendencias. Gráficos con SVG/CSS (sin librerías), un color por gráfico, y
	 * cada uno con su CSV.
	 */
	import '$lib/admin/panel-forms.scss';
	import { ChartLine } from '@lucide/svelte';
	import { csvFilename } from '$lib/admin/csv.js';
	import { eventPanelLink } from '$lib/admin/nav.js';
	import { fmtDate } from '$lib/admin/format.js';
	import { formatARS } from '$lib/utils/money.js';
	import PageHeader from '$lib/components/admin/panel/PageHeader.svelte';
	import Card from '$lib/components/admin/panel/Card.svelte';
	import Stat from '$lib/components/admin/panel/Stat.svelte';
	import BarList from '$lib/components/admin/panel/BarList.svelte';
	import CsvButton from '$lib/components/admin/panel/CsvButton.svelte';
	import EmptyState from '$lib/components/admin/panel/EmptyState.svelte';

	export let data;

	$: s = data.stats;
	/** @param {number} x */
	const pct = (x) => `${Math.round(x * 100)} %`;

	// Columnas por mes (SVG). Medida: entradas o plata.
	/** @type {'tickets' | 'revenue'} */
	let measure = 'tickets';
	const W = 640;
	const H = 220;
	const PAD = { top: 22, bottom: 26, left: 8, right: 8 };
	$: months = s?.byMonth ?? [];
	$: maxM = Math.max(1, ...months.map((m) => m[measure]));
	$: bw = (W - PAD.left - PAD.right) / Math.max(1, months.length);
	/** @type {(v: number) => number} */
	$: y = (v) => PAD.top + (H - PAD.top - PAD.bottom) * (1 - v / maxM);
	/** @type {(v: number) => string} */
	$: fmtM = (v) => (measure === 'tickets' ? String(v) : formatARS(v));
	/** @type {number | null} */
	let hover = null;

	/** @param {string} key @param {string} label */
	const col = (key, label) => ({ key, label });
</script>

<PageHeader
	title="Estadísticas"
	subtitle="Cómo vienen las ventas, las series y la gente que vuelve. Solo compras aprobadas."
/>

{#if !s}
	<Card>
		<EmptyState
			icon={ChartLine}
			title="Sin datos"
			text={data.dbAvailable ? 'Todavía no hay compras.' : 'No hay base de datos disponible.'}
		/>
	</Card>
{:else}
	<div class="kv-stats">
		<Stat label="Entradas vendidas" value={s.kpis.tickets} sub="{s.kpis.people} personas" />
		<Stat label="Cobrado" value={formatARS(s.kpis.revenue)} sub="antes de comisiones" />
		<Stat label="Entrada promedio" value={formatARS(s.kpis.avgTicket)} />
		<Stat
			label="Vinieron"
			value={pct(s.kpis.checkinRate)}
			sub="de las entradas de eventos pasados"
		/>
		<Stat label="Vuelven" value={pct(s.kpis.returningRate)} sub="vinieron a 2 eventos o más" />
	</div>

	<div class="kv-stack">
		<Card title="Ventas por mes">
			<svelte:fragment slot="actions">
				<div class="seg" role="group" aria-label="Qué mostrar">
					<button
						type="button"
						class:on={measure === 'tickets'}
						on:click={() => (measure = 'tickets')}>Entradas</button
					>
					<button
						type="button"
						class:on={measure === 'revenue'}
						on:click={() => (measure = 'revenue')}>Plata</button
					>
				</div>
				<CsvButton
					rows={months}
					columns={[
						col('month', 'mes'),
						col('tickets', 'entradas'),
						col('orders', 'compras'),
						col('revenue', 'cobrado')
					]}
					filename={csvFilename('ventas-por-mes')}
				/>
			</svelte:fragment>
			<svg
				class="chart"
				viewBox="0 0 {W} {H}"
				role="img"
				aria-label="{measure === 'tickets'
					? 'Entradas vendidas'
					: 'Plata cobrada'} por mes, últimos {months.length} meses"
			>
				<line x1={PAD.left} x2={W - PAD.right} y1={y(0)} y2={y(0)} class="base" />
				{#each months as m, i (m.month)}
					{@const h = y(0) - y(m[measure])}
					<g
						role="presentation"
						on:mouseenter={() => (hover = i)}
						on:mouseleave={() => (hover = null)}
					>
						<rect
							class="hit"
							x={PAD.left + i * bw}
							y={PAD.top}
							width={bw}
							height={H - PAD.top - PAD.bottom}
						/>
						{#if h > 0}
							<path
								class="bar"
								class:dim={hover !== null && hover !== i}
								d="M{PAD.left + i * bw + bw * 0.2},{y(0)} v{-(h - Math.min(4, h))} q0,-{Math.min(
									4,
									h
								)} {Math.min(4, h)},-{Math.min(4, h)} h{bw * 0.6 - 2 * Math.min(4, h)} q{Math.min(
									4,
									h
								)},0 {Math.min(4, h)},{Math.min(4, h)} v{h - Math.min(4, h)} z"
							/>
						{/if}
						<title
							>{m.label}: {m.tickets} entradas · {formatARS(m.revenue)} · {m.orders} compras</title
						>
						<text class="tick" x={PAD.left + i * bw + bw / 2} y={H - 8}
							>{m.label.split(' ')[0]}</text
						>
						{#if hover === i || i === months.length - 1 || m[measure] === maxM}
							<text class="val" x={PAD.left + i * bw + bw / 2} y={y(m[measure]) - 6}
								>{fmtM(m[measure])}</text
							>
						{/if}
					</g>
				{/each}
			</svg>
			<p class="kv-note">Por fecha de compra. El mes actual va por la mitad.</p>
		</Card>

		<div class="kv-grid-2">
			<Card title="Por serie">
				<svelte:fragment slot="actions">
					<CsvButton
						rows={s.bySeries}
						columns={[
							col('series', 'serie'),
							col('title', 'nombre'),
							col('events', 'eventos'),
							col('tickets', 'entradas'),
							col('revenue', 'cobrado')
						]}
						filename={csvFilename('ventas-por-serie')}
					/>
				</svelte:fragment>
				<BarList
					label="Entradas por serie"
					items={s.bySeries.slice(0, 10).map((x) => ({
						label: x.title,
						value: x.tickets,
						text: `${x.tickets}`,
						sub: `${x.events} ${x.events === 1 ? 'evento' : 'eventos'} · ${formatARS(x.revenue)}`
					}))}
				/>
			</Card>

			<Card title="Vuelven, por serie">
				<svelte:fragment slot="actions">
					<CsvButton
						rows={s.retention}
						columns={[
							col('series', 'serie'),
							col('title', 'nombre'),
							col('people', 'personas'),
							col('returning', 'vuelven'),
							col('rate', 'porcentaje')
						]}
						filename={csvFilename('vuelven-por-serie')}
					/>
				</svelte:fragment>
				<BarList
					label="Porcentaje de personas que vinieron a 2 o más eventos de la serie"
					max={1}
					items={s.retention.slice(0, 10).map((x) => ({
						label: x.title,
						value: x.rate,
						text: pct(x.rate),
						sub: `${x.returning} de ${x.people} personas vinieron 2 veces o más`
					}))}
				/>
			</Card>

			<Card title="Cómo pagan">
				<svelte:fragment slot="actions">
					<CsvButton
						rows={s.byMethod}
						columns={[
							col('label', 'medio'),
							col('orders', 'compras'),
							col('tickets', 'entradas'),
							col('revenue', 'cobrado')
						]}
						filename={csvFilename('medios-de-pago')}
					/>
				</svelte:fragment>
				<BarList
					label="Compras por medio de pago"
					items={s.byMethod.map((x) => ({
						label: x.label,
						value: x.orders,
						text: `${x.orders}`,
						sub: formatARS(x.revenue)
					}))}
				/>
			</Card>

			<Card title="Opciones del fondo">
				<svelte:fragment slot="actions">
					<CsvButton
						rows={s.byFondo}
						columns={[
							col('key', 'opcion'),
							col('label', 'nombre'),
							col('orders', 'compras'),
							col('tickets', 'entradas'),
							col('revenue', 'cobrado')
						]}
						filename={csvFilename('opciones-del-fondo')}
					/>
				</svelte:fragment>
				<BarList
					label="Compras por opción del fondo"
					items={s.byFondo.map((x) => ({ label: x.label, value: x.orders, text: `${x.orders}` }))}
				/>
			</Card>
		</div>

		<Card title="Asistencia por evento">
			<svelte:fragment slot="actions">
				<CsvButton
					rows={s.perEvent}
					columns={[
						col('slug', 'slug'),
						col('title', 'evento'),
						col('start', 'fecha'),
						col('sold', 'vendidas'),
						col('checked', 'entraron'),
						col('rate', 'porcentaje'),
						col('attendees', 'personas'),
						col('firstTimers', 'primera_vez_en_la_serie')
					]}
					filename={csvFilename('asistencia-por-evento')}
				/>
			</svelte:fragment>
			{#if s.perEvent.length === 0}
				<p class="kv-note">Todavía no pasó ningún evento con venta.</p>
			{:else}
				<div class="kv-table-wrap">
					<table class="kv-table">
						<thead>
							<tr>
								<th>Evento</th>
								<th class="r">Entraron</th>
								<th class="rate-col">Check-in</th>
								<th class="r">Primera vez</th>
							</tr>
						</thead>
						<tbody>
							{#each s.perEvent.slice(0, 30) as e (e.slug)}
								<tr>
									<td>
										<a href={eventPanelLink(e.slug, { tickets: true })}>{e.title}</a>
										<small class="muted">{fmtDate(e.start)}</small>
									</td>
									<td class="r num">{e.checked}/{e.sold}</td>
									<td class="rate-col">
										<span class="num">{pct(e.rate)}</span>
										<div class="track" title="{pct(e.rate)} de las entradas entraron">
											<i style="width:{e.rate * 100}%"></i>
										</div>
									</td>
									<td class="r num" title="Personas que vinieron por primera vez a esta serie"
										>{e.firstTimers} de {e.attendees}</td
									>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/if}
		</Card>
		{#if s.kpis.refunded}
			<p class="kv-note">No cuentan {s.kpis.refunded} compras reembolsadas.</p>
		{/if}
	</div>
{/if}

<style>
	.chart {
		width: 100%;
		height: auto;
		display: block;
	}
	.base {
		stroke: var(--line);
		stroke-width: 1;
	}
	.hit {
		fill: transparent;
	}
	.bar {
		fill: var(--link);
		transition: opacity 0.15s;
	}
	.bar.dim {
		opacity: 0.45;
	}
	.tick,
	.val {
		text-anchor: middle;
		font-size: 12px;
		fill: var(--muted);
	}
	.val {
		fill: var(--text);
		font-weight: 700;
	}
	.seg {
		display: inline-flex;
		border: 1px solid var(--field);
		border-radius: 2em;
		overflow: hidden;
	}
	.seg button {
		background: var(--surface);
		border: 0;
		padding: 0.3rem 0.8rem;
		color: var(--accent);
		font-weight: 700;
		cursor: pointer;
	}
	.seg button.on {
		background: var(--accent);
		color: var(--accent-ink);
	}
	td small {
		display: block;
	}
	.rate-col {
		min-width: 7rem;
	}
	.track {
		height: 0.45rem;
		border-radius: 4px;
		background: var(--bar-track);
		margin-top: 0.2rem;
	}
	.track i {
		display: block;
		height: 100%;
		border-radius: 4px;
		background: var(--link);
	}
</style>
