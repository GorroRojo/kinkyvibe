<script>
	/**
	 * Estadísticas y tendencias. Los gráficos van por el wrapper único
	 * $lib/components/admin/charts/Chart.svelte (tabla y CSV incluidos); las barras horizontales,
	 * por BarList.
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
	import Chart from '$lib/components/admin/charts/Chart.svelte';
	import SalesOverTime from '$lib/components/admin/charts/SalesOverTime.svelte';
	import Visits from '$lib/components/admin/stats/Visits.svelte';

	export let data;

	$: s = data.stats;
	/** @param {number} x */
	const pct = (x) => `${Math.round(x * 100)} %`;

	$: c = data.charts;
	// Los últimos 12 eventos pasados, con la fecha corta para el eje.
	/** @param {{ start: string | null }} e */
	const shortDay = (e) => (e.start ? fmtDate(e.start).split(' ').slice(0, 2).join(' ') : '');
	$: lastEvents = (c?.attendance.rows.slice(-12) ?? []).map((e) => ({ ...e, day: shortDay(e) }));
	// Los últimos 12 eventos pasados que son de una serie (etiqueta bajo «evento recurrente»).
	$: lastSeriesEvents = (c?.attendance.rows.filter((e) => e.seriesReturning !== null) ?? [])
		.slice(-12)
		.map((e) => ({ ...e, day: shortDay(e) }));

	/** @param {string} key @param {string} label */
	const col = (key, label) => ({ key, label });
</script>

<PageHeader
	title="Estadísticas"
	subtitle="Cómo vienen las ventas (solo compras aprobadas), las series, la gente que vuelve y las visitas al sitio."
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
		{#if c}
			<Card title="Ventas en el tiempo">
				<SalesOverTime sales={c.sales} />
			</Card>
		{/if}

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

		{#if c}
			<div class="kv-grid-2">
				<Card title="Vendidas y entraron">
					<Chart
						title="Entradas vendidas y con check-in, últimos {lastEvents.length} eventos"
						rows={lastEvents}
						x={{ key: 'title', label: 'evento', tick: 'day' }}
						series={[
							{ key: 'sold', label: 'Vendidas' },
							{ key: 'checked', label: 'Entraron' }
						]}
						csv="vendidas-y-entraron"
						csvColumns={[col('slug', 'slug'), col('start', 'fecha'), col('noShow', 'no vinieron')]}
						empty="Todavía no pasó ningún evento con venta."
					/>
				</Card>
				<Card title="Primera vez y vuelven">
					<Chart
						title="Personas que entraron: primera vez y que ya habían venido, últimos {lastEvents.length} eventos"
						rows={lastEvents}
						x={{ key: 'title', label: 'evento', tick: 'day' }}
						series={[
							{ key: 'newcomers', label: 'Primera vez' },
							{ key: 'returning', label: 'Ya habían venido' }
						]}
						stacked
						csv="primera-vez-y-vuelven"
						csvColumns={[col('slug', 'slug'), col('start', 'fecha')]}
						empty="Todavía no hay check-ins."
					/>
					<p class="kv-note">
						De {c.attendance.people} personas que entraron alguna vez, {c.attendance.cameBack} volvieron
						a otro evento ({pct(
							c.attendance.people ? c.attendance.cameBack / c.attendance.people : 0
						)}). Cualquier serie; cuenta por mail, sin mostrar a nadie.
					</p>
				</Card>
			</div>

			<Card title="Vuelven a la misma serie">
				<Chart
					title="Personas que entraron a un evento de una serie: primera vez en esa serie y que ya habían venido a la misma serie, últimos {lastSeriesEvents.length} eventos"
					rows={lastSeriesEvents}
					x={{ key: 'title', label: 'evento', tick: 'day' }}
					series={[
						{ key: 'seriesNewcomers', label: 'Primera vez en la serie' },
						{ key: 'seriesReturning', label: 'Ya habían venido a la serie' }
					]}
					stacked
					csv="vuelven-a-la-serie"
					csvColumns={[col('slug', 'slug'), col('start', 'fecha'), col('series', 'serie')]}
					empty="Todavía no hay check-ins en eventos de una serie."
				/>
				<p class="kv-note">
					De {c.attendance.seriesPeople} personas que entraron a algún evento de una serie, {c
						.attendance.seriesCameBack} volvieron a la misma serie ({pct(
						c.attendance.seriesPeople ? c.attendance.seriesCameBack / c.attendance.seriesPeople : 0
					)}). Las series son las etiquetas que cuelgan de «evento recurrente» (por ejemplo
					Picantearla); los eventos sin esa etiqueta no cuentan acá. Cuenta por mail, sin mostrar a
					nadie.
				</p>
			</Card>

			<Card title="Fondo y finanzas">
				<div class="kv-stats">
					<Stat
						label="Aportado al Fondo"
						value={formatARS(c.fondo.totals.contributed)}
						sub="últimos 12 meses"
					/>
					<Stat
						label="Usado del Fondo"
						value={formatARS(c.fondo.totals.used)}
						sub="entradas con descuento"
					/>
					<Stat label="Neto" value={formatARS(c.fondo.totals.net)} sub="aportado − usado" />
					<Stat
						label="Recargo de Mercado Pago"
						value={formatARS(c.fondo.totals.surcharge)}
						sub="lo pagaron les compradores"
					/>
				</div>
				<div class="kv-grid-2">
					<div class="sub">
						<h3>Fondo por mes</h3>
						<Chart
							title="Fondo por mes: aportado, usado y neto"
							rows={c.fondo.rows}
							x={{ key: 'label', label: 'mes' }}
							series={[
								{ key: 'contributed', label: 'Aportado' },
								{ key: 'used', label: 'Usado' },
								{ key: 'net', label: 'Neto', mark: 'line' }
							]}
							format={formatARS}
							csv="fondo-por-mes"
							csvColumns={[col('month', 'clave'), col('surcharge', 'recargo MP')]}
							empty="Sin movimientos del Fondo en el último año."
						/>
					</div>
					<div class="sub">
						<h3>Recargo de Mercado Pago por mes</h3>
						<Chart
							title="Recargo de Mercado Pago por mes"
							rows={c.fondo.rows}
							x={{ key: 'label', label: 'mes' }}
							series={[{ key: 'surcharge', label: 'Recargo MP' }]}
							format={formatARS}
							csv="recargo-mp-por-mes"
							csvColumns={[col('month', 'clave')]}
							empty="Sin recargos de Mercado Pago en el último año."
						/>
					</div>
				</div>
				<p class="kv-note">
					Por fecha de compra, solo aprobadas. El Fondo de las suscripciones (fondo.kinkyvibe.ar) no
					entra acá: está en el Inicio.
				</p>
			</Card>
		{/if}

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

{#if data.visits}
	<Visits visits={data.visits} />
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
