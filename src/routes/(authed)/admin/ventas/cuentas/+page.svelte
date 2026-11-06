<script>
	/**
	 * Ventas › Cuentas del año (interruptor `gastos_reparto`): por mes y en total, con las cuentas
	 * cerradas de cada evento (Ventas › Gastos y reparto de su ficha).
	 */
	import PageHeader from '$lib/components/admin/panel/PageHeader.svelte';
	import Stat from '$lib/components/admin/panel/Stat.svelte';
	import CsvButton from '$lib/components/admin/panel/CsvButton.svelte';
	import { Card, EmptyState, Notice } from '$lib/components/ui';
	import { CLOSINGS_CSV_COLUMNS } from '$lib/admin/reparto.js';
	import { csvFilename } from '$lib/admin/csv.js';
	import { eventHref } from '$lib/admin/nav.js';
	import { formatARS, formatSignedARS } from '$lib/utils/money.js';

	/** @type {import('./$types').PageData} */
	export let data;

	const MONTHS = [
		'Enero',
		'Febrero',
		'Marzo',
		'Abril',
		'Mayo',
		'Junio',
		'Julio',
		'Agosto',
		'Septiembre',
		'Octubre',
		'Noviembre',
		'Diciembre'
	];
	/** @param {string} ym */
	const monthName = (ym) => MONTHS[Number(ym.slice(5, 7)) - 1] ?? ym;
	/** @param {string} d */
	const day = (d) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

	/** @typedef {'tickets' | 'presale' | 'door' | 'fondo_net' | 'extras' | 'other_income' | 'income_total' | 'venue' | 'fees' | 'other_expenses' | 'expenses_total' | 'caja' | 'profit'} Column */

	/** @type {[Column, string][]} */
	const COLUMNS = [
		['tickets', 'Entradas'],
		['presale', 'Preventa'],
		['door', 'Puerta'],
		['fondo_net', 'Fondo neto'],
		['extras', 'Extras'],
		['other_income', 'Otros ingresos'],
		['income_total', 'Ingresos'],
		['venue', 'Lugar'],
		['fees', 'Contrataciones'],
		['other_expenses', 'Otros gastos'],
		['expenses_total', 'Gastos'],
		['caja', 'Caja KV'],
		['profit', 'Ganancia o pérdida']
	];
	/** @param {Column} key @param {number} value */
	const cell = (key, value) =>
		key === 'tickets'
			? String(value)
			: key === 'fondo_net' || key === 'profit'
				? formatSignedARS(value)
				: formatARS(value);
</script>

<svelte:head><title>Cuentas del año · Ventas · Panel</title></svelte:head>

<PageHeader
	title="Cuentas del año"
	subtitle="Con las cuentas cerradas de cada evento (Gastos y reparto, en su ficha), por el mes del evento."
/>

{#if data.missingMigration}<Notice tone="error">{data.missingMigration}</Notice>{/if}

<div class="top">
	<nav class="years" aria-label="Año">
		{#each data.years as y (y)}
			<a
				href="?anio={y}"
				class:current={y === data.year}
				aria-current={y === data.year ? 'page' : undefined}>{y}</a
			>
		{/each}
	</nav>
	{#if data.events.length}
		<CsvButton
			label="Descargar CSV"
			rows={data.events}
			columns={CLOSINGS_CSV_COLUMNS}
			filename={csvFilename('cuentas', String(data.year))}
		/>
	{/if}
</div>

{#if !data.events.length}
	<EmptyState
		title="Todavía no hay cuentas cerradas en {data.year}"
		text="Cerrá la cuenta de un evento en su ficha (Ventas › Gastos y reparto) y aparece acá."
	/>
{:else}
	<div class="stats">
		<Stat label="Eventos" value={String(data.total.events)} />
		<Stat label="Ingresos" value={formatARS(data.total.income_total)} />
		<Stat label="Gastos" value={formatARS(data.total.expenses_total)} />
		<Stat
			label={data.total.profit < 0 ? 'Pérdida' : 'Ganancia'}
			value={formatARS(Math.abs(data.total.profit))}
			tone={data.total.profit > 0 ? 'ok' : data.total.profit < 0 ? 'bad' : ''}
		/>
		<Stat label="Caja KV" value={formatARS(data.total.caja)} />
	</div>

	<div class="cards">
		<Card title="Por mes">
			<div class="kv-table-wrap">
				<table class="kv-table">
					<thead>
						<tr>
							<th>Mes</th>
							<th class="r">Eventos</th>
							{#each COLUMNS as [, label] (label)}<th class="r">{label}</th>{/each}
						</tr>
					</thead>
					<tbody>
						{#each data.months as m (m.month)}
							<tr>
								<th scope="row">{monthName(m.month)}</th>
								<td class="r num">{m.events}</td>
								{#each COLUMNS as [key] (key)}<td class="r num">{cell(key, m[key])}</td>{/each}
							</tr>
						{/each}
					</tbody>
					<tfoot>
						<tr>
							<th scope="row">Año {data.year}</th>
							<td class="r num">{data.total.events}</td>
							{#each COLUMNS as [key] (key)}<td class="r num">{cell(key, data.total[key])}</td
								>{/each}
						</tr>
					</tfoot>
				</table>
			</div>
		</Card>

		<Card title="Lo que le tocó a cada parte">
			<p class="muted small-note">
				Sumado de las cuentas cerradas de {data.year}. Lo de las partes del equipo va a la Caja KV.
				Con pérdida, lo que puso cada parte resta. Esto no va en el CSV.
			</p>
			<div class="kv-table-wrap">
				<table class="kv-table" id="partes">
					<thead>
						<tr>
							<th>Parte</th>
							<th class="r">Eventos</th>
							<th class="r">Le tocó</th>
						</tr>
					</thead>
					<tbody>
						{#each data.shares.rows as p, i (i)}
							<tr>
								<th scope="row">{p.name}</th>
								<td class="r num">{p.events}</td>
								<td class="r num">{formatSignedARS(p.amount)}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
			{#if data.shares.skipped}
				<p class="muted small-note">
					{data.shares.skipped}
					{data.shares.skipped === 1 ? 'cuenta cerrada no tiene' : 'cuentas cerradas no tienen'} el detalle
					del reparto: solo suman a la Caja KV.
				</p>
			{/if}
		</Card>

		<Card title="Eventos">
			<div class="kv-table-wrap">
				<table class="kv-table">
					<thead>
						<tr>
							<th>Evento</th>
							{#each COLUMNS as [, label] (label)}<th class="r">{label}</th>{/each}
						</tr>
					</thead>
					<tbody>
						{#each data.events as ev (ev.event_slug)}
							<tr>
								<th scope="row">
									<a href={eventHref(ev.event_slug, 'gastos')}>{ev.event_title}</a>
									<span class="muted small">{day(ev.event_date)}</span>
								</th>
								{#each COLUMNS as [key] (key)}<td class="r num">{cell(key, ev[key])}</td>{/each}
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</Card>
	</div>
{/if}

<style>
	.top {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-2xs);
		margin-bottom: var(--space-xs);
	}
	.small-note {
		font-size: var(--text-sm);
		margin: 0 0 var(--space-2xs);
	}
	.years {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2xs);
	}
	.years a {
		padding: 0.2em 0.7em;
		border-radius: 999px;
		border: 1px solid var(--line);
		text-decoration: none;
	}
	.years a.current {
		font-weight: 700;
		border-color: currentColor;
	}
	.stats {
		display: grid;
		gap: var(--space-2xs);
		grid-template-columns: repeat(auto-fit, minmax(min(100%, 9rem), 1fr));
		margin-block: var(--space-2xs) var(--space-xs);
	}
	.cards {
		display: flex;
		flex-direction: column;
		gap: var(--space-xs);
	}
	.kv-table .num {
		white-space: nowrap;
	}
	.kv-table th[scope='row'] {
		text-align: left;
		font-weight: 400;
		white-space: nowrap;
	}
	tfoot th,
	tfoot td {
		font-weight: 700;
	}
	.small {
		font-size: var(--text-xs);
		margin-left: var(--space-3xs);
	}
</style>
