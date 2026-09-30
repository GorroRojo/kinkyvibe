<script>
	import { Mail } from '@lucide/svelte';
	import Card from '$lib/components/admin/panel/Card.svelte';
	import Stat from '$lib/components/admin/panel/Stat.svelte';
	import CapacityBar from '$lib/components/admin/panel/CapacityBar.svelte';
	import CsvButton from '$lib/components/admin/panel/CsvButton.svelte';
	import EmptyState from '$lib/components/admin/panel/EmptyState.svelte';
	import { eventHref } from '$lib/admin/nav.js';
	import { formatARS, formatSignedARS } from '$lib/utils/money.js';
	import { fondoOptionLabel, formatSaleTime } from '$lib/utils/tickets.js';
	import { dayLabel as argentinaDayLabel } from '$lib/admin/eventFormat.js';

	/** @type {import('./$types').PageData} */
	export let data;

	$: e = data.event;
	$: t = data.totals;
	$: pct = t.capacity ? Math.round((t.sold / t.capacity) * 100) : null;
	$: showFondo = data.fondoEnabled || data.fondo.used > 0 || data.fondo.contributed > 0;

	const METHOD = /** @type {Record<string, string>} */ ({
		mercadopago: 'Mercado Pago',
		transferencia: 'Transferencia',
		gratis: 'Sin cargo'
	});

	// Gráfico de barras: entradas por día (últimos 14 días).
	const W = 560;
	const H = 170;
	const PAD = { l: 26, r: 8, t: 14, b: 24 };
	$: maxY = Math.max(4, ...data.perDay.map((d) => d.tickets));
	$: step = niceStep(maxY);
	$: top = Math.ceil(maxY / step) * step;
	$: ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step);
	$: bw = (W - PAD.l - PAD.r) / data.perDay.length;
	$: y = (/** @type {number} */ v) => H - PAD.b - (v / top) * (H - PAD.t - PAD.b);
	$: best = data.perDay.reduce((m, d) => (d.tickets > m.tickets ? d : m), data.perDay[0]);
	$: totalWindow = data.perDay.reduce((s, d) => s + d.tickets, 0);
	/** Posición (x) de un instante en el gráfico, o null si cae afuera. */
	$: closeLines = data.closes
		.map((c) => {
			const i = data.perDay.findIndex((d) => d.date === dayOf(c.at));
			return i < 0 ? null : { ...c, x: PAD.l + i * bw + bw / 2 };
		})
		.filter(Boolean);

	/** @param {number} max */
	function niceStep(max) {
		const raw = max / 4;
		const pow = 10 ** Math.floor(Math.log10(raw));
		for (const m of [1, 2, 5, 10]) if (raw <= m * pow) return m * pow;
		return 10 * pow;
	}
	/** @param {number} ms */
	const dayOf = (ms) => new Date(ms - 3 * 3600 * 1000).toISOString().slice(0, 10);

	/** @type {number | null} */
	let hover = null;

	$: payTotal = data.payments.reduce((s, p) => s + p.tickets, 0);

	/** @type {import('$lib/admin/csv.js').CsvColumn<(typeof data.perDay)[number]>[]} */
	const dayColumns = [
		{ label: 'fecha', key: 'date' },
		{ label: 'entradas', key: 'tickets' },
		{ label: 'órdenes', key: 'orders' },
		{ label: 'monto', key: 'amount' }
	];
</script>

<svelte:head><title>Ventas · {e.title} · Panel</title></svelte:head>

<div class="stats">
	<Stat
		label="Vendidas"
		value={t.capacity ? `${t.sold} / ${t.capacity}` : String(t.sold)}
		sub={pct !== null ? `${pct} % del cupo` : ''}
	>
		<CapacityBar sold={t.sold} held={t.held.total} capacity={t.capacity} />
	</Stat>
	<Stat
		label="Reservadas"
		value={String(t.held.total)}
		sub="{t.held.paying} pagando · {t.held.transfers} por transferencia"
		href={t.held.transfers ? eventHref(e.slug, 'transferencias') : ''}
	/>
	<Stat label="Recaudado" value={formatARS(t.revenue)} sub="antes de la comisión de Mercado Pago" />
	{#if showFondo}
		<Stat
			label="💜 Neto del fondo"
			value={formatSignedARS(data.fondo.net)}
			tone={data.fondo.net > 0 ? 'ok' : data.fondo.net < 0 ? 'bad' : ''}
			sub="aportes − fondo usado"
		/>
	{:else}
		<Stat label="Órdenes aprobadas" value={String(data.tabCounts.orders)} />
	{/if}
</div>

<div class="grid">
	<Card title="Por tipo de entrada">
		<ul class="types">
			{#each data.types as type (type.id)}
				<li class:over={type.sold > type.capacity}>
					<div class="row">
						<strong>{type.name}</strong>
						<span class="num">{type.sold} / {type.capacity}</span>
					</div>
					<CapacityBar sold={type.sold} held={type.held} capacity={type.capacity} />
					<div class="row muted small">
						<span>
							{type.gorra
								? `A la gorra (mín. ${formatARS(type.gorra.min)}, sugerido ${formatARS(type.gorra.suggested)})`
								: formatARS(type.price) +
									(type.fondo
										? ` · con fondo ${formatARS(type.price - type.fondo)}`
										: '')}{type.held ? ` · ${type.held} reservadas` : ''}{type.closesAt
								? ` · ${type.closesAt <= data.now ? 'cerró' : 'cierra'} ${formatSaleTime(type.closesAt)}`
								: ''}
						</span>
						<span class="num">{formatARS(type.revenue)}</span>
					</div>
				</li>
			{/each}
		</ul>
	</Card>

	<Card title="Vendidas por día">
		<svelte:fragment slot="actions">
			<CsvButton rows={data.perDay} columns={dayColumns} filename="ventas-por-dia-{e.slug}.csv" />
		</svelte:fragment>
		<p class="muted small">
			Últimos 14 días: {totalWindow}
			{totalWindow === 1 ? 'entrada' : 'entradas'}{#if best?.tickets}; el mejor día, {argentinaDayLabel(
					best.date
				)} ({best.tickets}){/if}.
		</p>
		<div class="chart-wrap">
			<svg
				class="chart"
				viewBox="0 0 {W} {H}"
				role="img"
				aria-label="Entradas vendidas por día en los últimos 14 días"
				on:mouseleave={() => (hover = null)}
			>
				{#each ticks as v}
					<line class="grid-line" x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} />
					<text class="tick" x={PAD.l - 6} y={y(v) + 4} text-anchor="end">{v}</text>
				{/each}
				{#each closeLines as c}
					{#if c}
						<line class="close-line" x1={c.x} x2={c.x} y1={PAD.t - 4} y2={H - PAD.b} />
						<text class="tick" x={c.x + 4} y={PAD.t + 4}>cierra {c.name}</text>
					{/if}
				{/each}
				{#each data.perDay as d, i (d.date)}
					{@const x = PAD.l + i * bw}
					<g
						class="bar"
						class:on={hover === i}
						on:mouseenter={() => (hover = i)}
						on:focus={() => (hover = i)}
						on:blur={() => (hover = null)}
						tabindex="0"
						role="img"
						aria-label="{argentinaDayLabel(d.date)}: {d.tickets} entradas"
					>
						<rect class="hit" {x} y={PAD.t} width={bw} height={H - PAD.t - PAD.b} />
						{#if d.tickets}
							<path
								class="fill"
								d="M{x + 2},{y(0)} V{y(d.tickets) + 3} q0,-3 3,-3 H{x + bw - 5} q3,0 3,3 V{y(0)} Z"
							/>
						{/if}
						{#if i === 0 || i === data.perDay.length - 1 || i % 3 === 0}
							<text class="tick" x={x + bw / 2} y={H - 6} text-anchor="middle"
								>{i === data.perDay.length - 1 ? 'hoy' : argentinaDayLabel(d.date, true)}</text
							>
						{/if}
					</g>
				{/each}
				<line class="axis" x1={PAD.l} x2={W - PAD.r} y1={y(0)} y2={y(0)} />
			</svg>
			{#if hover !== null}
				{@const d = data.perDay[hover]}
				<div class="tip" style="left:{((PAD.l + hover * bw + bw / 2) / W) * 100}%" role="status">
					<strong>{argentinaDayLabel(d.date)}</strong>
					<span
						>{d.tickets}
						{d.tickets === 1 ? 'entrada' : 'entradas'} · {d.orders}
						{d.orders === 1 ? 'orden' : 'órdenes'}</span
					>
					<span>{formatARS(d.amount)}</span>
				</div>
			{/if}
		</div>
		<details class="table-view">
			<summary>Ver como tabla</summary>
			<div class="kv-table-wrap">
				<table class="kv-table">
					<thead><tr><th>Día</th><th class="r">Entradas</th><th class="r">Monto</th></tr></thead>
					<tbody>
						{#each data.perDay as d (d.date)}
							<tr>
								<td>{argentinaDayLabel(d.date)}</td>
								<td class="r num">{d.tickets}</td>
								<td class="r num">{formatARS(d.amount)}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</details>
	</Card>

	<Card title="Cómo pagaron">
		{#if payTotal}
			<div class="split" role="img" aria-label="Entradas por medio de pago">
				{#each data.payments.filter((p) => p.tickets) as p (p.method)}
					<i
						class="seg m-{p.method}"
						style="flex-grow:{p.tickets}"
						title="{METHOD[p.method] ?? p.method}: {p.share} %"
					></i>
				{/each}
			</div>
			<ul class="legend">
				{#each data.payments as p (p.method)}
					<li>
						<i class="dot m-{p.method}" aria-hidden="true"></i>
						<span>{METHOD[p.method] ?? p.method}</span>
						<span class="num">{p.share} %</span>
						<span class="muted num"
							>{p.tickets} {p.tickets === 1 ? 'entrada' : 'entradas'} · {formatARS(p.amount)}</span
						>
					</li>
				{/each}
			</ul>
		{:else}
			<EmptyState emoji="🧾" title="Todavía no hay compras aprobadas" />
		{/if}
	</Card>

	{#if showFondo}
		<Card title="Fondo KinkyVibe">
			<p class="muted small">
				{#if data.fondoPercent !== null}Descuento del fondo este mes: {data.fondoPercent} %.{/if}
				"Fondo usado" es lo que cubrió el fondo; "aportes", lo que se pagó de más (solidaria, muy solidaria
				y Sugar).
			</p>
			<div class="kv-table-wrap">
				<table class="kv-table summary">
					<thead>
						<tr
							><th>Opción</th><th class="r">Entradas</th><th class="r">Fondo usado</th><th class="r"
								>Aportes al fondo</th
							></tr
						>
					</thead>
					<tbody>
						{#each data.fondo.rows as r (r.option)}
							<tr>
								<td>{fondoOptionLabel(r.option)}</td>
								<td class="r num">{r.tickets}</td>
								<td class="r num">{r.used ? formatARS(r.used) : '—'}</td>
								<td class="r num">{r.contributed ? formatARS(r.contributed) : '—'}</td>
							</tr>
						{:else}
							<tr><td colspan="4" class="muted">Sin compras aprobadas.</td></tr>
						{/each}
					</tbody>
					<tfoot>
						<tr>
							<td colspan="2">Neto del fondo</td>
							<td class="r num">−{formatARS(data.fondo.used)}</td>
							<td class="r num net" class:pos={data.fondo.net > 0} class:neg={data.fondo.net < 0}
								>{formatSignedARS(data.fondo.net)}</td
							>
						</tr>
					</tfoot>
				</table>
			</div>
		</Card>
	{/if}

	<Card title="Códigos usados">
		<svelte:fragment slot="actions">
			<a class="kv-btn ghost" href={eventHref(e.slug, 'codigos')}>＋ Nuevo código</a>
		</svelte:fragment>
		{#if data.codes.length}
			<div class="kv-table-wrap">
				<table class="kv-table">
					<thead>
						<tr
							><th>Código</th><th class="r">Órdenes</th><th class="r">Entradas</th><th class="r"
								>Descontado</th
							></tr
						>
					</thead>
					<tbody>
						{#each data.codes as c (c.code)}
							<tr>
								<td><strong>{c.code}</strong></td>
								<td class="r num">{c.orders}</td>
								<td class="r num">{c.tickets}</td>
								<td class="r num">{formatARS(c.discounted)}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{:else}
			<p class="muted small">Ninguna compra aprobada usó un código.</p>
		{/if}
	</Card>
</div>

<div class="bottom">
	<a
		class="kv-btn ghost"
		href="{eventHref(e.slug, 'resumen')}/ordenes.csv"
		download
		data-sveltekit-reload>⬇ Exportar CSV de órdenes</a
	>
	<a class="kv-btn ghost" href={eventHref(e.slug, 'mail')}
		><Mail size={16} aria-hidden="true" /> Mandar mail a compradores…</a
	>
</div>

<style>
	.stats {
		display: grid;
		gap: 0.8rem;
		grid-template-columns: repeat(auto-fit, minmax(min(100%, 12rem), 1fr));
		margin-bottom: 1rem;
	}
	.grid {
		display: grid;
		gap: 1rem;
		grid-template-columns: repeat(auto-fit, minmax(min(100%, 24rem), 1fr));
		align-items: start;
	}
	.small {
		font-size: 0.85rem;
		margin: 0;
	}
	.types {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.9rem;
	}
	.types li {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
	}
	.types .over strong::after {
		content: ' · sobrevendido';
		color: var(--bad);
	}
	.row {
		display: flex;
		justify-content: space-between;
		gap: 0.6rem;
	}
	/* Colores de los medios de pago (validados para daltonismo; ver el PR). */
	.grid {
		--pay-mp: #813df5;
		--pay-tr: #0d9b78;
		--pay-free: #f79c06;
		--day: var(--2);
	}
	@media (prefers-color-scheme: dark) {
		:global(:root:not([data-theme='light'])) .grid {
			--pay-mp: #9d6cf7;
			--pay-tr: #119a77;
			--pay-free: #bb800a;
			--day: #9d6cf7;
		}
	}
	:global(:root[data-theme='dark']) .grid {
		--pay-mp: #9d6cf7;
		--pay-tr: #119a77;
		--pay-free: #bb800a;
		--day: #9d6cf7;
	}
	.chart-wrap {
		position: relative;
	}
	.chart {
		width: 100%;
		height: auto;
		display: block;
	}
	.chart .tick {
		fill: var(--muted);
		font-size: 11px;
	}
	.grid-line {
		stroke: var(--line);
		stroke-width: 1;
	}
	.axis {
		stroke: var(--muted);
		stroke-width: 1;
	}
	.close-line {
		stroke: var(--accent);
		stroke-width: 2;
		stroke-dasharray: 4 3;
	}
	.bar .hit {
		fill: transparent;
	}
	.bar .fill {
		fill: var(--day);
	}
	.bar.on .hit {
		fill: var(--surface-2);
	}
	.bar:focus {
		outline: none;
	}
	.bar:focus-visible .hit {
		stroke: var(--link);
		stroke-width: 2;
	}
	.tip {
		position: absolute;
		top: 0;
		transform: translateX(-50%);
		background: var(--surface);
		border: 1px solid var(--line);
		box-shadow: var(--shadow);
		border-radius: 0.6rem;
		padding: 0.35rem 0.6rem;
		font-size: 0.8rem;
		display: flex;
		flex-direction: column;
		pointer-events: none;
		white-space: nowrap;
	}
	.table-view summary {
		cursor: pointer;
		color: var(--muted);
		font-size: 0.85rem;
	}
	.split {
		display: flex;
		gap: 2px;
		height: 1rem;
		border-radius: 0.5rem;
		overflow: hidden;
	}
	.seg {
		display: block;
		flex-basis: 0;
		min-width: 4px;
	}
	.m-mercadopago {
		background: var(--pay-mp);
	}
	.m-transferencia {
		background: var(--pay-tr);
	}
	.m-gratis {
		background: var(--pay-free);
	}
	.legend {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}
	.legend li {
		display: grid;
		grid-template-columns: 0.8rem minmax(0, 1fr) auto;
		gap: 0 0.5rem;
		align-items: center;
	}
	.legend li > .muted {
		grid-column: 2 / -1;
		font-size: 0.82rem;
	}
	.dot {
		width: 0.8rem;
		height: 0.8rem;
		border-radius: 0.25rem;
	}
	.net {
		font-weight: 700;
	}
	.pos {
		color: var(--ok);
	}
	.neg {
		color: var(--bad);
	}
	.bottom {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		margin-top: 1rem;
	}
</style>
