<script>
	/**
	 * Estadísticas → Asistencia: quiénes vinieron a los eventos del período elegido, quiénes venían
	 * por primera vez y quiénes vuelven (a cualquier evento y a la misma serie). Los datos, de
	 * attendancePage ($lib/server/admin/statsPages.js): «primera vez» se cuenta con toda la
	 * historia. Cuenta por mail, sin mostrar a nadie.
	 */
	import '$lib/admin/panel-forms.scss';
	import { ChartLine } from '@lucide/svelte';
	import { csvFilename } from '$lib/admin/csv.js';
	import { eventPanelLink } from '$lib/admin/nav.js';
	import { fmtDate } from '$lib/admin/format.js';
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
	import PeriodFilter from '$lib/components/admin/stats/PeriodFilter.svelte';

	export let data;

	const PATH = '/admin/estadisticas/asistencia';
	$: period = parsePeriod(data.period, SALES_PERIODS, SALES_DEFAULT_PERIOD);
	$: a = data.attendance;
	$: k = a?.kpis;
	$: when = periodText(period);
	/** @param {number} x */
	const pct = (x) => `${Math.round(x * 100)} %`;
	/** Abajo de un número: la comparación con el período anterior, si hay. */
	$: vs = (/** @type {number} */ cur, /** @type {number | undefined} */ prev) =>
		a?.previous ? changeText(cur, prev, period) : '';
	/** @param {...string} parts */
	const join = (...parts) => parts.filter(Boolean).join(' · ');

	// La fecha corta para el eje.
	/** @param {{ start: string | null }} e */
	const shortDay = (e) => (e.start ? fmtDate(e.start).split(' ').slice(0, 2).join(' ') : '');
	$: lastEvents = (a?.rows ?? []).map((e) => ({ ...e, day: shortDay(e) }));
	$: lastSeriesEvents = (a?.seriesRows ?? []).map((e) => ({ ...e, day: shortDay(e) }));

	/** @param {string} key @param {string} label */
	const col = (key, label) => ({ key, label });
</script>

<PageHeader
	title="Asistencia"
	subtitle="Quiénes vinieron a los eventos, quiénes venían por primera vez y quiénes vuelven."
/>

<PeriodFilter path={PATH} periods={SALES_PERIODS} current={period.id} />

{#if !a || !k}
	<Card>
		<EmptyState
			icon={ChartLine}
			title="Sin datos"
			text={data.dbAvailable ? 'Todavía no hay compras.' : 'No hay base de datos disponible.'}
		/>
	</Card>
{:else}
	<div class="kv-stats">
		<Stat
			label="Vinieron"
			value={pct(k.checkinRate)}
			sub={join(
				`${k.checked} de ${k.sold} entradas, ${k.events} ${k.events === 1 ? 'evento' : 'eventos'}`,
				vs(k.checkinRate, a.previous?.checkinRate)
			)}
		/>
		<Stat
			label="Personas que entraron"
			value={k.people}
			sub={join(when, vs(k.people, a.previous?.people))}
		/>
		<Stat
			label="Primera vez"
			value={k.firstTime}
			sub={join('nunca habían venido', vs(k.firstTime, a.previous?.firstTime))}
		/>
		<Stat
			label="Vuelven"
			value={pct(k.returningRate)}
			sub={join('vinieron a 2 eventos o más', vs(k.returningRate, a.previous?.returningRate))}
		/>
	</div>

	<div class="kv-stack">
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
					empty="No pasó ningún evento con venta en este período."
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
					empty="No hay check-ins en este período."
				/>
				<p class="kv-note">
					De {k.people} personas que entraron a algún evento ({when}), {k.firstTime} venían por primera
					vez y {k.returning} vinieron a 2 eventos o más ({pct(k.returningRate)}). Cualquier serie;
					cuenta por mail, sin mostrar a nadie.
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
				empty="No hay check-ins en eventos de una serie en este período."
			/>
			<p class="kv-note">
				De {k.seriesPeople} personas que entraron a algún evento de una serie ({when}), {k.seriesReturning}
				vinieron a 2 eventos o más de la misma serie ({pct(
					k.seriesPeople ? k.seriesReturning / k.seriesPeople : 0
				)}). Las series son las etiquetas que cuelgan de «evento recurrente» (por ejemplo
				Picantearla); los eventos sin esa etiqueta no cuentan acá. Cuenta por mail, sin mostrar a
				nadie.
			</p>
		</Card>

		<Card title="Vuelven, por serie">
			<svelte:fragment slot="actions">
				<CsvButton
					rows={a.retention}
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
			{#if a.retention.length === 0}
				<p class="kv-note">No hay check-ins en este período.</p>
			{:else}
				<BarList
					label="Porcentaje de personas que vinieron a 2 o más eventos de la serie, {when}"
					max={1}
					items={a.retention.slice(0, 10).map((x) => ({
						label: x.title,
						value: x.rate,
						text: pct(x.rate),
						sub: `${x.returning} de ${x.people} personas vinieron 2 veces o más`
					}))}
				/>
			{/if}
		</Card>

		<Card title="Asistencia por evento">
			<svelte:fragment slot="actions">
				<CsvButton
					rows={a.perEvent}
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
			{#if a.perEvent.length === 0}
				<p class="kv-note">No pasó ningún evento con venta en este período.</p>
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
							{#each a.perEvent.slice(0, 30) as e (e.slug)}
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
				{#if a.perEvent.length > 30}
					<p class="kv-note">Los 30 más nuevos; el CSV tiene los {a.perEvent.length}.</p>
				{/if}
			{/if}
		</Card>
		<p class="kv-note">
			Por fecha del evento: cuentan los eventos que ya pasaron y empezaron en el período. Solo
			compras aprobadas.
		</p>
	</div>
{/if}

<style>
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
