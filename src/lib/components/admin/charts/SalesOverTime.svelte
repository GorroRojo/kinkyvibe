<script>
	/**
	 * «Ventas en el tiempo»: entradas o plata por día, semana o mes, de todos los eventos o de uno.
	 * Props: `sales` (computeCharts().sales: ventas por evento y día, los eventos y el día de hoy).
	 */
	import { bucketSales, formatCount } from '$lib/admin/chartSeries.js';
	import { formatARS } from '$lib/utils/money.js';
	import Chart from './Chart.svelte';
	import Segmented from './Segmented.svelte';

	/** @type {{ days: import('$lib/admin/chartSeries.js').SalesDay[], events: { slug: string, title: string }[], today: number }} */
	export let sales;

	let slug = '';
	let bucket = 'week';
	let measure = 'tickets';

	$: rows = bucketSales(sales.days, {
		bucket: /** @type {import('$lib/admin/chartSeries.js').Bucket} */ (bucket),
		slug,
		today: sales.today
	});
	$: eventTitle = sales.events.find((e) => e.slug === slug)?.title;
	$: unit = bucket === 'day' ? 'día' : bucket === 'week' ? 'semana' : 'mes';
	$: what = measure === 'tickets' ? 'Entradas vendidas' : 'Plata cobrada';
</script>

<Chart
	title="{what} por {unit}{eventTitle ? ` · ${eventTitle}` : ', todos los eventos'}"
	{rows}
	x={{ key: 'label', label: bucket === 'week' ? 'semana' : bucket === 'day' ? 'día' : 'mes' }}
	series={[
		measure === 'tickets'
			? { key: 'tickets', label: 'Entradas' }
			: { key: 'revenue', label: 'Cobrado' }
	]}
	format={measure === 'tickets' ? formatCount : formatARS}
	csv="ventas-por-{unit}{slug ? `-${slug}` : ''}"
	csvColumns={[
		{ key: 'date', label: 'desde' },
		{
			key: measure === 'tickets' ? 'revenue' : 'tickets',
			label: measure === 'tickets' ? 'Cobrado' : 'Entradas'
		}
	]}
	empty={slug ? 'Este evento todavía no vendió.' : 'No hubo ventas en este período.'}
>
	<svelte:fragment slot="controls">
		<label class="pick">
			<span class="visually-hidden">Evento</span>
			<select class="kv-input" bind:value={slug}>
				<option value="">Todos los eventos</option>
				{#each sales.events as e (e.slug)}<option value={e.slug}>{e.title}</option>{/each}
			</select>
		</label>
		<Segmented
			label="Agrupar por"
			bind:value={bucket}
			options={[
				{ value: 'day', label: 'Día' },
				{ value: 'week', label: 'Semana' },
				{ value: 'month', label: 'Mes' }
			]}
		/>
		<Segmented
			label="Qué mostrar"
			bind:value={measure}
			options={[
				{ value: 'tickets', label: 'Entradas' },
				{ value: 'revenue', label: 'Plata' }
			]}
		/>
	</svelte:fragment>
</Chart>
<p class="kv-note">
	Por fecha de compra, solo aprobadas. {slug
		? 'Desde la primera venta hasta la última.'
		: 'El período actual va por la mitad.'}
</p>

<style>
	.pick {
		flex: 1 1 12rem;
		min-width: 0;
		max-width: 22rem;
	}
	.pick select {
		width: 100%;
		min-height: 2.5rem;
	}
</style>
