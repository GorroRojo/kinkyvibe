<script>
	/**
	 * Ventas de esta noche (o del próximo evento con entradas) en el Inicio: vendidas contra el
	 * cupo (o el avance contra la meta de venta, si tiene), plata, ingresos si es hoy, cada tipo con
	 * su barra (sin cupo = sin barra; sobrevendido
	 * = marcado) y las entradas vendidas por día en la última semana, en columnas a escala desde
	 * cero. El gráfico tiene una tabla equivalente para lectores de pantalla.
	 * Prop: `sales` (SalesSummary de inicio.js).
	 */
	import Card from '$lib/components/admin/panel/Card.svelte';
	import Badge from '$lib/components/admin/panel/Badge.svelte';
	import CapacityBar from '$lib/components/admin/panel/CapacityBar.svelte';
	import GoalProgress from '$lib/components/admin/panel/GoalProgress.svelte';
	import { eventLink, orderHref } from '$lib/admin/links.js';
	import { formatARS } from '$lib/utils/money.js';
	import { ChartColumn, ChevronRight } from '@lucide/svelte';

	/** @type {import('$lib/server/admin/inicio.js').SalesSummary} */
	export let sales;

	/** @param {number} n */
	const entradas = (n) => `${n} ${n === 1 ? 'entrada' : 'entradas'}`;

	$: e = sales.event;
	$: over = e.capacity !== null && e.sold > e.capacity ? e.sold - e.capacity : 0;
	$: days = sales.trend?.days ?? [];
	$: max = Math.max(0, ...days.map((d) => d.count));
	$: weekTotal = days.reduce((s, d) => s + d.count, 0);
	// Etiquetas selectivas: el máximo y hoy (el último), si vendieron algo.
	$: maxIndex = days.findIndex((d) => d.count === max);
	/** @param {string} label */
	const short = (label) =>
		label === 'Hoy' ? 'hoy' : label === 'Ayer' ? 'ayer' : label.split(' ')[0];
</script>

<Card title={e.today ? 'Ventas de esta noche' : 'Ventas del próximo evento'} icon={ChartColumn}>
	<div class="event">
		<a class="title" href={eventLink(e.slug, { tickets: true })}>{e.title}</a>
		<small class="muted">{sales.when}{e.location ? ` · ${e.location}` : ''}</small>
	</div>

	<div class="nums">
		<p class="big">
			<b class="num">{e.sold}</b>
			<span>{e.capacity === null ? 'vendidas · sin cupo' : `/ ${e.capacity} vendidas`}</span>
		</p>
		<p class="side num">
			<b>{formatARS(e.revenue)}</b>
			{#if e.today && e.issued}<small>{e.checkedIn} de {e.issued} ingresaron</small>{/if}
			{#if e.held}<small>{e.held} reservadas</small>{/if}
		</p>
	</div>
	{#if e.progress}
		<!-- Con meta de venta: el avance contra la meta; el cupo sigue arriba, como número. -->
		<GoalProgress progress={e.progress} />
	{:else if e.capacity !== null}
		<CapacityBar sold={e.sold} held={e.held} capacity={e.capacity} />
	{/if}
	{#if over}
		<p class="warn-line"><Badge tone="bad">Sobrevendido</Badge> {over} más que el cupo total</p>
	{/if}

	{#if sales.types.length > 1 || sales.types.some((t) => t.over)}
		<ul class="types" aria-label="Por tipo de entrada">
			{#each sales.types as t (t.id)}
				<li>
					<span class="tname"
						>{t.name}{#if t.closed}{' '}<small class="muted">· cerrada</small>{/if}</span
					>
					<span class="tnum num"
						>{t.sold}{t.capacity === null ? '' : ` / ${t.capacity}`}{#if t.over}
							<Badge tone="bad">+{t.over}</Badge>{/if}</span
					>
					{#if t.capacity === null}
						<small class="muted nocap">sin cupo</small>
					{:else}
						<div class="tbar">
							<CapacityBar
								sold={t.sold}
								held={t.held}
								capacity={t.capacity}
								label={t.over
									? `${t.name}: ${t.sold} vendidas para un cupo de ${t.capacity} (sobrevendido por ${t.over})`
									: ''}
							/>
						</div>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}

	{#if sales.trend}
		<figure class="trend">
			<figcaption>
				Entradas vendidas por día <span class="muted">· últimos 7 días: {weekTotal}</span>
			</figcaption>
			{#if max > 0}
				<div class="plot" aria-hidden="true">
					{#each days as d, i (d.day)}
						<div class="col" title="{d.label}: {entradas(d.count)}">
							<span class="v" class:show={d.count > 0 && (i === maxIndex || i === days.length - 1)}
								>{d.count}</span
							>
							<i
								class="bar"
								class:today={i === days.length - 1}
								style="height:{(d.count / max) * 100}%"
							></i>
						</div>
					{/each}
				</div>
				<div class="axis" aria-hidden="true">
					{#each days as d (d.day)}<span>{short(d.label)}</span>{/each}
				</div>
			{:else}
				<p class="muted empty">No hubo ventas en la última semana.</p>
			{/if}
			<table class="sr-only">
				<caption>Entradas vendidas por día, últimos 7 días</caption>
				<thead><tr><th scope="col">Día</th><th scope="col">Entradas</th></tr></thead>
				<tbody>
					{#each days as d (d.day)}<tr><th scope="row">{d.label}</th><td>{d.count}</td></tr>{/each}
				</tbody>
			</table>
			{#if sales.trend.door}
				<p class="channels">
					<span>Online <b class="num">{sales.trend.online}</b></span>
					<span>En la puerta <b class="num">{sales.trend.door}</b></span>
				</p>
			{/if}
		</figure>
	{/if}

	{#if sales.others.length}
		<p class="others muted">
			También hoy:
			{#each sales.others as o, i (o.slug)}{i ? ', ' : ''}<a href={orderHref(o.slug)}>{o.title}</a
				>{/each}
		</p>
	{/if}

	<a class="kv-btn ghost sm more" href={orderHref(e.slug)}
		>Ver ventas y órdenes <ChevronRight size={16} aria-hidden="true" /></a
	>
</Card>

<style lang="scss">
	.sm {
		padding: 0.35rem 0.8rem;
		font-size: 0.88rem;
	}
	.more {
		align-self: flex-start;
	}
	.event {
		display: flex;
		flex-direction: column;
		gap: 0.1rem;
	}
	.title {
		font-weight: 700;
		text-decoration: none;
		overflow-wrap: anywhere;
	}
	.nums {
		display: flex;
		align-items: flex-end;
		justify-content: space-between;
		gap: 0.6rem;
		flex-wrap: wrap;
	}
	p {
		margin: 0;
	}
	.big {
		display: flex;
		align-items: baseline;
		gap: 0.35rem;
		b {
			font-size: 2rem;
			line-height: 1;
		}
		span {
			color: var(--muted);
		}
	}
	.side {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		small {
			color: var(--muted);
		}
	}
	.warn-line {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		font-size: 0.9rem;
	}
	.types {
		list-style: none;
		margin: 0;
		padding: 0.2rem 0 0;
		display: flex;
		flex-direction: column;
		gap: 0.45rem;
	}
	.types li {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		gap: 0.15rem 0.6rem;
		align-items: center;
		font-size: 0.9rem;
	}
	.tname {
		overflow-wrap: anywhere;
	}
	.tnum {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		white-space: nowrap;
	}
	.tbar,
	.nocap {
		grid-column: 1 / -1;
	}
	.trend {
		margin: 0.2rem 0 0;
		padding-top: 0.7rem;
		border-top: 1px solid var(--line);
	}
	figcaption {
		font-size: 0.9rem;
		font-weight: 700;
		margin-bottom: 0.5rem;
		span {
			font-weight: 400;
		}
	}
	.plot,
	.axis {
		display: grid;
		grid-template-columns: repeat(7, minmax(0, 1fr));
		gap: 2px;
	}
	.plot {
		height: 5.5rem;
		align-items: end;
		border-bottom: 1px solid var(--line);
	}
	.col {
		height: 100%;
		display: flex;
		flex-direction: column;
		justify-content: flex-end;
		align-items: center;
		position: relative;
		cursor: default;
	}
	.col:hover {
		background: var(--surface-2);
		border-radius: 4px 4px 0 0;
	}
	.bar {
		display: block;
		width: min(100%, 24px);
		background: var(--2);
		border-radius: 4px 4px 0 0;
	}
	.bar:not(.today) {
		background: color-mix(in srgb, var(--2) 55%, var(--surface));
	}
	.v {
		font-size: 0.75rem;
		font-weight: 700;
		font-variant-numeric: tabular-nums;
		visibility: hidden;
		line-height: 1.2;
	}
	.v.show,
	.col:hover .v {
		visibility: visible;
	}
	.axis {
		margin-top: 0.25rem;
		span {
			text-align: center;
			font-size: 0.72rem;
			color: var(--muted);
			white-space: nowrap;
			overflow: hidden;
			text-overflow: ellipsis;
		}
	}
	.empty {
		margin: 0;
		font-size: 0.9rem;
	}
	.channels {
		display: flex;
		gap: 1rem;
		margin-top: 0.5rem;
		font-size: 0.9rem;
		color: var(--muted);
		b {
			color: var(--text);
		}
	}
	.others {
		font-size: 0.9rem;
	}
	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border: 0;
	}
</style>
