<script>
	/**
	 * Ventas de todos los eventos que venden entradas: por evento y tipo, vendidas/cupo,
	 * reservadas, cobrado y fondo (y el avance contra la meta de venta, si tiene). Próximos o
	 * pasados, y CSV.
	 */
	import '$lib/admin/panel-forms.scss';
	import { page } from '$app/stores';
	import { ArrowRightLeft, Ticket, TicketPercent, TriangleAlert } from '@lucide/svelte';
	import { eventPanelLink } from '$lib/admin/nav.js';
	import { fmtDate } from '$lib/admin/format.js';
	import { csvFilename } from '$lib/admin/csv.js';
	import { formatARS, formatSignedARS } from '$lib/utils/money.js';
	import PageHeader from '$lib/components/admin/panel/PageHeader.svelte';
	import Card from '$lib/components/admin/panel/Card.svelte';
	import Stat from '$lib/components/admin/panel/Stat.svelte';
	import Badge from '$lib/components/admin/panel/Badge.svelte';
	import Tabs from '$lib/components/admin/panel/Tabs.svelte';
	import CapacityBar from '$lib/components/admin/panel/CapacityBar.svelte';
	import GoalProgress from '$lib/components/admin/panel/GoalProgress.svelte';
	import CsvButton from '$lib/components/admin/panel/CsvButton.svelte';
	import EmptyState from '$lib/components/admin/panel/EmptyState.svelte';

	export let data;

	$: showPast = $page.url.searchParams.get('ver') === 'pasados';
	$: events = showPast ? data.past : data.upcoming;
	$: totals = showPast ? null : data.totals.upcoming;
	$: transfers = Number(data.panelCounts?.transfers ?? 0);
	$: csvRows = [...data.upcoming, ...data.past].flatMap((e) => e.types.map((t) => ({ e, t })));

	/** @type {import('$lib/admin/csv.js').CsvColumn<{ e: any, t: any }>[]} */
	const columns = [
		{ label: 'evento', value: (r) => r.e.title },
		{ label: 'slug', value: (r) => r.e.slug },
		{ label: 'fecha', value: (r) => r.e.start ?? '' },
		{ label: 'tipo', value: (r) => r.t.name },
		{ label: 'precio', value: (r) => r.t.price ?? '' },
		{ label: 'a_la_gorra', value: (r) => (r.t.gorra ? 'sí' : '') },
		{ label: 'vendidas', value: (r) => r.t.sold },
		{ label: 'cupo', value: (r) => r.t.capacity ?? '' },
		{ label: 'reservadas', value: (r) => r.t.held },
		{ label: 'cobrado', value: (r) => r.t.revenue },
		{ label: 'fondo_usado', value: (r) => r.t.fondoUsed },
		{ label: 'aportes_fondo', value: (r) => r.t.contribution },
		{ label: 'recargo_mp', value: (r) => r.t.surcharge }
	];

	/** @param {any} t */
	const priceText = (t) =>
		t.gorra ? `a la gorra, sugerido ${formatARS(t.gorra.suggested)}` : formatARS(t.price);
</script>

<PageHeader title="Ventas" subtitle="Entradas de todos los eventos que venden por el sitio.">
	<svelte:fragment slot="actions">
		<a class="kv-btn ghost" href="/admin/ventas/transferencias">
			<ArrowRightLeft size={16} aria-hidden="true" /> Transferencias
			{#if transfers}<Badge tone="warn">{transfers}</Badge>{/if}
		</a>
		<a class="kv-btn ghost" href="/admin/ventas/codigos">
			<TicketPercent size={16} aria-hidden="true" /> Códigos
		</a>
		<CsvButton rows={csvRows} {columns} filename={csvFilename('ventas')} />
	</svelte:fragment>
</PageHeader>

{#if !data.dbAvailable}
	<p class="kv-flash bad">No hay base de datos disponible: no se pueden mostrar ventas.</p>
{/if}

{#if totals}
	<div class="kv-stats">
		<Stat label="Cobrado (próximos)" value={formatARS(totals.revenue)} sub="antes de comisiones" />
		<Stat label="Entradas vendidas" value={totals.sold} sub="{totals.held} reservadas" />
		<Stat
			label="Neto del fondo"
			value={formatSignedARS(totals.fondoNet)}
			tone={totals.fondoNet < 0 ? 'bad' : totals.fondoNet > 0 ? 'ok' : ''}
			sub="aportes − fondo usado"
		/>
		<Stat
			label="Transferencias"
			value={transfers}
			tone={transfers ? 'warn' : ''}
			sub={transfers ? 'esperan comprobante' : 'nada pendiente'}
			href="/admin/ventas/transferencias"
		/>
	</div>
{/if}

<Tabs
	current={showPast ? '/admin/ventas?ver=pasados' : '/admin/ventas'}
	tabs={[
		{ href: '/admin/ventas', label: 'Próximos', count: data.upcoming.length },
		{ href: '/admin/ventas?ver=pasados', label: 'Pasados', count: data.past.length }
	]}
/>

{#if events.length === 0}
	<Card>
		<EmptyState
			icon={Ticket}
			title={showPast ? 'No hay eventos pasados con venta' : 'Ningún evento próximo vende entradas'}
			text="Para vender, prendé “Vender entradas por el sitio” en la sección Entradas del evento."
		>
			<a class="kv-btn" href="/admin/eventos/nuevo">Cargar evento</a>
		</EmptyState>
	</Card>
{/if}

<div class="kv-stack">
	{#each events as e (e.slug)}
		<Card>
			<div class="head">
				<div class="title">
					<a class="name" href={eventPanelLink(e.slug, { tickets: true })}>{e.title}</a>
					<span class="muted">{fmtDate(e.start)}</span>
				</div>
				<div class="kv-row">
					{#if e.status}<Badge>{e.status}</Badge>{/if}
					{#if e.online}<Badge tone="info">online</Badge>{/if}
					{#if e.review}
						<Badge tone="warn">
							<TriangleAlert size={12} aria-hidden="true" />
							{e.review}
							{e.review === 1 ? 'orden' : 'órdenes'} para revisar
						</Badge>
					{/if}
					{#if e.types.some((t) => t.over)}<Badge tone="bad">sobrevendido</Badge>{/if}
				</div>
			</div>
			{#if e.progress}
				<div class="goal">
					<GoalProgress progress={e.progress} />
				</div>
			{/if}
			<div class="kv-table-wrap">
				<table class="kv-table">
					<thead>
						<tr>
							<th>Tipo</th>
							<th class="bar-col">Vendidas / cupo</th>
							<th class="r held-col">Reservadas</th>
							<th class="r">Cobrado</th>
						</tr>
					</thead>
					<tbody>
						{#each e.types as t (t.id)}
							<tr class:over={t.over}>
								<td>
									<b>{t.name}</b>
									<small class="muted"
										>{priceText(t)}{t.fondo ? ` · fondo ${formatARS(t.fondo)}` : ''}</small
									>
								</td>
								<td class="bar-col">
									<span class="num"
										>{t.sold}{t.capacity === null ? ' · sin cupo' : `/${t.capacity}`}{#if t.over}
											<b class="over-txt">+{t.sold - (t.capacity ?? 0)} de más</b>{/if}</span
									>
									<CapacityBar sold={t.sold} held={t.held} capacity={t.capacity} />
									{#if t.held}<small class="muted held-inline">{t.held} reservadas</small>{/if}
								</td>
								<td class="r num held-col">{t.held}</td>
								<td class="r num">{formatARS(t.revenue)}</td>
							</tr>
						{/each}
					</tbody>
					<tfoot>
						<tr>
							<td>Total</td>
							<td class="bar-col num">{e.sold}{e.capacity === null ? '' : `/${e.capacity}`}</td>
							<td class="r num held-col">{e.held}</td>
							<td class="r num">{formatARS(e.revenue)}</td>
						</tr>
					</tfoot>
				</table>
			</div>
			{#if e.fondoEnabled || e.fondoUsed || e.contribution}
				<dl class="fondo">
					<div>
						<dt>Fondo usado</dt>
						<dd class="num">{formatARS(e.fondoUsed)}</dd>
					</div>
					<div>
						<dt>Aportes al fondo</dt>
						<dd class="num">{formatARS(e.contribution)}</dd>
					</div>
					<div>
						<dt>Neto del fondo</dt>
						<dd
							class="num"
							class:pos={e.fondoNet > 0}
							class:neg={e.fondoNet < 0}
							title={e.fondoNet < 0
								? 'El fondo cubrió más de lo que se aportó'
								: 'Se aportó más de lo que cubrió el fondo'}
						>
							{formatSignedARS(e.fondoNet)}
						</dd>
					</div>
				</dl>
			{/if}
		</Card>
	{/each}
</div>

<style>
	.goal {
		margin: 0.5rem 0 0.2rem;
		max-width: 28rem;
	}
	.head {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem 1rem;
		align-items: baseline;
		justify-content: space-between;
	}
	.title {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}
	.name {
		font-weight: 700;
		font-size: 1.1rem;
		overflow-wrap: anywhere;
	}
	td small {
		display: block;
	}
	.bar-col {
		min-width: 7rem;
	}
	.held-inline {
		display: none;
	}
	@media (max-width: 600px) {
		.held-col {
			display: none;
		}
		.held-inline {
			display: block;
		}
		.kv-table :global(th),
		.kv-table :global(td) {
			padding-inline: 0.35rem;
		}
	}
	.bar-col .num {
		display: block;
		margin-bottom: 0.2rem;
	}
	tr.over {
		background: var(--bad-bg);
	}
	.over-txt {
		margin-left: 0.35em;
		color: var(--bad);
		font-size: 0.85em;
	}
	tfoot td {
		font-weight: 700;
		border-bottom: 0;
	}
	.fondo {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem 1.5rem;
		margin: 0;
		padding-top: 0.6rem;
		border-top: 1px solid var(--line);
	}
	.fondo dt {
		font-size: 0.8rem;
		color: var(--muted);
	}
	.fondo dd {
		margin: 0;
		font-weight: 700;
	}
	.pos {
		color: var(--ok);
	}
	.neg {
		color: var(--bad);
	}
</style>
