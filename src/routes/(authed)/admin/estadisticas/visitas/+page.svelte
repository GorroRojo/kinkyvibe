<script>
	/**
	 * Estadísticas → Visitas al sitio: las visitas anónimas del período elegido (7, 30 o 90 días).
	 * Todo el contenido está en Visits.svelte; acá van el título y el filtro. Con `?pagina=`, solo
	 * esa página (PageVisitsCard.svelte, la misma tarjeta de las fichas).
	 */
	import '$lib/admin/panel-forms.scss';
	import {
		VISITS_DEFAULT_PERIOD,
		VISITS_PERIODS,
		parsePeriod,
		periodText
	} from '$lib/admin/statsPeriod.js';
	import PageHeader from '$lib/components/admin/panel/PageHeader.svelte';
	import PeriodFilter from '$lib/components/admin/stats/PeriodFilter.svelte';
	import Visits from '$lib/components/admin/stats/Visits.svelte';
	import PageVisitsCard from '$lib/components/admin/stats/PageVisitsCard.svelte';

	export let data;

	$: period = parsePeriod(data.period, VISITS_PERIODS, VISITS_DEFAULT_PERIOD);
</script>

{#if data.pagina}
	<PageHeader title="Visitas de una página" subtitle={data.pagina} />
	<div class="kv-stack">
		<PageVisitsCard visits={data.page} title={data.pagina} statsLink={false} />
		{#if data.page?.status === 'ok'}
			<p class="kv-note">
				<a href={data.pagina} target="_blank" rel="noopener">Ver la página</a>
			</p>
		{/if}
		<p class="kv-note">
			<a href="/admin/estadisticas/visitas">Ver las visitas de todo el sitio</a>
		</p>
	</div>
{:else}
	<PageHeader
		title="Visitas al sitio"
		subtitle="Cuánta gente entra, a qué páginas, desde dónde y cuántas visitas terminan en una compra."
	/>

	<PeriodFilter path="/admin/estadisticas/visitas" periods={VISITS_PERIODS} current={period.id} />

	{#if data.visits}
		<Visits visits={data.visits} period={periodText(period)} />
	{/if}
{/if}
