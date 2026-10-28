<script>
	/**
	 * Estadísticas → Ventas: lo que se vendió en el período (y la serie) elegidos. Los gráficos van
	 * por el wrapper único $lib/components/admin/charts/Chart.svelte (tabla y CSV incluidos); las
	 * barras horizontales, por BarList. Los datos, de salesPage ($lib/server/admin/statsPages.js).
	 */
	import '$lib/admin/panel-forms.scss';
	import { ChartLine } from '@lucide/svelte';
	import { csvFilename } from '$lib/admin/csv.js';
	import { formatARS } from '$lib/utils/money.js';
	import {
		SALES_DEFAULT_PERIOD,
		SALES_PERIODS,
		changeText,
		parsePeriod,
		periodText
	} from '$lib/admin/statsPeriod.js';
	import PageHeader from '$lib/components/admin/panel/PageHeader.svelte';
	import Card from '$lib/components/admin/panel/Card.svelte';
	import Stat from '$lib/components/admin/panel/Stat.svelte';
	import BarList from '$lib/components/admin/panel/BarList.svelte';
	import CsvButton from '$lib/components/admin/panel/CsvButton.svelte';
	import EmptyState from '$lib/components/admin/panel/EmptyState.svelte';
	import Chart from '$lib/components/admin/charts/Chart.svelte';
	import SalesOverTime from '$lib/components/admin/charts/SalesOverTime.svelte';
	import PeriodFilter from '$lib/components/admin/stats/PeriodFilter.svelte';

	export let data;

	const PATH = '/admin/estadisticas/ventas';
	$: period = parsePeriod(data.period, SALES_PERIODS, SALES_DEFAULT_PERIOD);
	$: s = data.sales;
	$: when = periodText(period);
	$: serieLabel = data.serie
		? (s?.serieOptions.find((o) => o.value === data.serie)?.label ?? data.serie)
		: '';
	/** Abajo de un número: el período y, si hay, la comparación con el anterior. */
	$: sub = (/** @type {number} */ cur, /** @type {number | undefined} */ prev) =>
		[when, s?.previous ? changeText(cur, prev, period) : ''].filter(Boolean).join(' · ');

	/** @param {string} key @param {string} label */
	const col = (key, label) => ({ key, label });
</script>

<PageHeader
	title="Ventas en el tiempo"
	subtitle="Cómo vienen las ventas (solo compras aprobadas), por serie, medio de pago y Fondo."
/>

<PeriodFilter
	path={PATH}
	periods={SALES_PERIODS}
	current={period.id}
	serieOptions={s?.serieOptions ?? null}
	serie={data.serie}
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
	{#if serieLabel}
		<p class="kv-note">Solo la serie <b>{serieLabel}</b>.</p>
	{/if}
	<p class="kv-note">
		Los números cuentan por el <b>mes del evento</b> (cuándo empieza, en hora de Argentina): las ventas
		de los eventos del período, hasta los de este mes. El gráfico «Ventas en el tiempo» va por fecha de
		compra.
	</p>
	<div class="kv-stats">
		<Stat
			label="Entradas vendidas"
			value={s.kpis.tickets}
			sub="{s.kpis.people} personas · {sub(s.kpis.tickets, s.previous?.tickets)}"
		/>
		<Stat
			label="Cobrado"
			value={formatARS(s.kpis.revenue)}
			sub="antes de comisiones · {sub(s.kpis.revenue, s.previous?.revenue)}"
		/>
		<Stat
			label="Entrada promedio"
			value={formatARS(s.kpis.avgTicket)}
			sub={sub(s.kpis.avgTicket, s.previous?.avgTicket)}
		/>
	</div>

	<div class="kv-stack">
		<Card title="Ventas en el tiempo (por fecha de compra)">
			{#key `${s.period}|${s.serie}`}
				<SalesOverTime sales={s.sales} />
			{/key}
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
				{#if s.bySeries.length === 0}
					<p class="kv-note">No hubo ventas en este período.</p>
				{:else}
					<BarList
						label="Entradas por serie, {when}"
						items={s.bySeries.slice(0, 10).map((x) => ({
							label: x.title,
							value: x.tickets,
							text: `${x.tickets}`,
							sub: `${x.events} ${x.events === 1 ? 'evento' : 'eventos'} · ${formatARS(x.revenue)}`
						}))}
					/>
				{/if}
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
				{#if s.byMethod.length === 0}
					<p class="kv-note">No hubo ventas en este período.</p>
				{:else}
					<BarList
						label="Compras por medio de pago, {when}"
						items={s.byMethod.map((x) => ({
							label: x.label,
							value: x.orders,
							text: `${x.orders}`,
							sub: formatARS(x.revenue)
						}))}
					/>
				{/if}
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
				{#if s.byFondo.length === 0}
					<p class="kv-note">No hubo ventas en este período.</p>
				{:else}
					<BarList
						label="Compras por opción del fondo, {when}"
						items={s.byFondo.map((x) => ({ label: x.label, value: x.orders, text: `${x.orders}` }))}
					/>
				{/if}
			</Card>
		</div>

		<Card title="Fondo y finanzas">
			<div class="kv-stats">
				<Stat label="Aportado al Fondo" value={formatARS(s.fondo.totals.contributed)} sub={when} />
				<Stat
					label="Usado del Fondo"
					value={formatARS(s.fondo.totals.used)}
					sub="entradas con descuento"
				/>
				<Stat label="Neto" value={formatARS(s.fondo.totals.net)} sub="aportado − usado" />
				<Stat
					label="Recargo de Mercado Pago"
					value={formatARS(s.fondo.totals.surcharge)}
					sub="lo pagaron les compradores"
				/>
			</div>
			<div class="kv-grid-2">
				<div class="sub">
					<h3>Fondo por mes</h3>
					<Chart
						title="Fondo por mes: aportado, usado y neto"
						rows={s.fondo.rows}
						x={{ key: 'label', label: 'mes' }}
						series={[
							{ key: 'contributed', label: 'Aportado' },
							{ key: 'used', label: 'Usado' },
							{ key: 'net', label: 'Neto', mark: 'line' }
						]}
						format={formatARS}
						csv="fondo-por-mes"
						csvColumns={[col('month', 'clave'), col('surcharge', 'recargo MP')]}
						empty="Sin movimientos del Fondo en este período."
					/>
				</div>
				<div class="sub">
					<h3>Recargo de Mercado Pago por mes</h3>
					<Chart
						title="Recargo de Mercado Pago por mes"
						rows={s.fondo.rows}
						x={{ key: 'label', label: 'mes' }}
						series={[{ key: 'surcharge', label: 'Recargo MP' }]}
						format={formatARS}
						csv="recargo-mp-por-mes"
						csvColumns={[col('month', 'clave')]}
						empty="Sin recargos de Mercado Pago en este período."
					/>
				</div>
			</div>
			<p class="kv-note">
				Por mes del evento, solo aprobadas. El Fondo de las suscripciones (fondo.kinkyvibe.ar) no
				entra acá: está en el Inicio.
			</p>
		</Card>

		{#if s.kpis.refunded}
			<p class="kv-note">No cuentan {s.kpis.refunded} compras reembolsadas.</p>
		{/if}
		<p class="kv-note">
			Quiénes vinieron y quiénes vuelven, en <a href="/admin/estadisticas/asistencia">Asistencia</a
			>. Cuántas visitas terminan en una compra, en
			<a href="/admin/estadisticas/visitas">Visitas al sitio</a> («Visitas → compras»).
		</p>
	</div>
{/if}

<style>
	.sub {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
		min-width: 0;
	}
	h3 {
		margin: 0;
		font-size: var(--text-sm);
	}
</style>
