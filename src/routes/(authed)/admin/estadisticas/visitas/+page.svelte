<script>
	/**
	 * Estadísticas → Visitas al sitio: las visitas anónimas del período elegido (7, 30 o 90 días).
	 * Todo el contenido está en Visits.svelte; acá van el título y el filtro.
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

	export let data;

	$: period = parsePeriod(data.period, VISITS_PERIODS, VISITS_DEFAULT_PERIOD);
</script>

<PageHeader
	title="Visitas al sitio"
	subtitle="Cuánta gente entra, a qué páginas, desde dónde y cuántas visitas terminan en una compra."
/>

<PeriodFilter path="/admin/estadisticas/visitas" periods={VISITS_PERIODS} current={period.id} />

<Visits visits={data.visits} period={periodText(period)} />
