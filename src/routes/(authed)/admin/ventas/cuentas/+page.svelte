<script>
	/**
	 * Ventas › Cuentas del año (interruptor `gastos_reparto`): por mes y en total, con las cuentas
	 * cerradas de cada evento (Ventas › Gastos y reparto de su ficha).
	 */
	import PageHeader from '$lib/components/admin/panel/PageHeader.svelte';
	import Stat from '$lib/components/admin/panel/Stat.svelte';
	import { Card, EmptyState } from '$lib/components/ui';
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

	/** @typedef {'tickets' | 'presale' | 'door' | 'fondo_net' | 'other_income' | 'venue' | 'fees' | 'other_expenses' | 'expenses_total' | 'caja' | 'profit'} Column */

	/** @type {[Column, string][]} */
	const COLUMNS = [
		['tickets', 'Entradas'],
		['presale', 'Preventa'],
		['door', 'Puerta'],
		['fondo_net', 'Fondo neto'],
		['other_income', 'Otros ingresos'],
		['venue', 'Lugar'],
		['fees', 'Contrataciones'],
		['other_expenses', 'Otros gastos'],
		['expenses_total', 'Gastos'],
		['caja', 'Caja KV'],
		['profit', 'Ganancia']
	];
	/** @param {Column} key @param {number} value */
	const cell = (key, value) =>
		key === 'tickets'
			? String(value)
			: key === 'fondo_net'
				? formatSignedARS(value)
				: formatARS(value);
</script>

<svelte:head><title>Cuentas del año · Ventas · Panel</title></svelte:head>

<PageHeader
	title="Cuentas del año"
	subtitle="Con las cuentas cerradas de cada evento (Gastos y reparto, en su ficha), por el mes del evento."
/>

<nav class="years" aria-label="Año">
	{#each data.years as y (y)}
		<a
			href="?anio={y}"
			class:current={y === data.year}
			aria-current={y === data.year ? 'page' : undefined}>{y}</a
		>
	{/each}
</nav>

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
			label="Ganancia"
			value={formatARS(data.total.profit)}
			tone={data.total.profit >= 0 ? 'ok' : 'bad'}
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
							<th scope="row">Total {data.year}</th>
							<td class="r num">{data.total.events}</td>
							{#each COLUMNS as [key] (key)}<td class="r num">{cell(key, data.total[key])}</td
								>{/each}
						</tr>
					</tfoot>
				</table>
			</div>
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
	.years {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2xs);
		margin-bottom: var(--space-xs);
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
		gap: var(--space-xs);
		grid-template-columns: repeat(auto-fit, minmax(min(100%, 10rem), 1fr));
		margin-block: 1rem;
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
		display: block;
	}
</style>
