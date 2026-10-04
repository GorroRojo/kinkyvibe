<script>
	/**
	 * Propinas: total (y por destino: KinkyVibe o el Fondo), por mes y por publicación (solo
	 * aprobadas) y la lista con CSV, filtrable por destino (`?destino=`).
	 */
	import '$lib/admin/panel-forms.scss';
	import { HandCoins } from '@lucide/svelte';
	import { fmtDateTime } from '$lib/admin/format.js';
	import { formatARS } from '$lib/utils/money.js';
	import {
		TIP_DESTINATION_LABELS,
		TIP_STATUS_LABELS,
		monthLabel,
		tipPostPath
	} from '$lib/utils/propinas.js';
	import PageHeader from '$lib/components/admin/panel/PageHeader.svelte';
	import Card from '$lib/components/admin/panel/Card.svelte';
	import Stat from '$lib/components/admin/panel/Stat.svelte';
	import Badge from '$lib/components/admin/panel/Badge.svelte';
	import BarList from '$lib/components/admin/panel/BarList.svelte';
	import Tabs from '$lib/components/admin/panel/Tabs.svelte';
	import CsvButton from '$lib/components/admin/panel/CsvButton.svelte';
	import EmptyState from '$lib/components/admin/panel/EmptyState.svelte';

	export let data;

	$: s = data.summary;
	$: months = (s?.byMonth ?? []).map((m) => ({
		label: monthLabel(m.month),
		value: m.total,
		text: formatARS(m.total),
		sub: m.count === 1 ? '1 propina' : `${m.count} propinas`
	}));
	$: posts = (s?.byPost ?? []).map((p) => ({
		label: p.slug,
		value: p.total,
		text: formatARS(p.total),
		sub: `${p.category} · ${p.count === 1 ? '1 propina' : `${p.count} propinas`}`,
		href: tipPostPath(p.category, p.slug)
	}));

	$: kv = s?.byDestination.kinkyvibe ?? { count: 0, total: 0 };
	$: fondo = s?.byDestination.fondo ?? { count: 0, total: 0 };
	/** @param {number} n */
	const tipsText = (n) => (n === 1 ? '1 propina' : `${n} propinas`);
	$: filterHref = data.destination
		? `/admin/ajustes/propinas?destino=${data.destination}`
		: '/admin/ajustes/propinas';

	/** @type {Record<string, 'ok' | 'warn' | 'bad' | 'neutral'>} */
	const TONES = { approved: 'ok', pending: 'neutral', rejected: 'warn', refunded: 'bad' };
</script>

<PageHeader
	title="Propinas"
	subtitle="Las que se dejan al pie de las publicaciones de Kinky Vibe. Entran a la misma cuenta de Mercado Pago que las entradas."
>
	<svelte:fragment slot="actions">
		<CsvButton href="/admin/ajustes/propinas/propinas.csv" />
	</svelte:fragment>
</PageHeader>

<div class="kv-stack">
	{#if !data.dbAvailable}
		<p class="kv-flash bad">No hay base de datos disponible.</p>
	{/if}
	{#if !data.enabled}
		<p class="kv-flash" role="status">
			El interruptor <b>Propinas</b> está apagado: las publicaciones muestran la nota del cafecito.
			Se prende en <a href="/admin/ajustes/interruptores">Ajustes → Interruptores</a>.
		</p>
	{/if}

	<div class="kv-stats">
		<Stat label="Recibido" value={formatARS(s?.total ?? 0)} sub="propinas aprobadas" />
		<Stat
			label={TIP_DESTINATION_LABELS.kinkyvibe}
			value={formatARS(kv.total)}
			sub="{tipsText(kv.count)} aprobadas"
		/>
		<Stat
			label={TIP_DESTINATION_LABELS.fondo}
			value={formatARS(fondo.total)}
			sub="{tipsText(fondo.count)} · suman a los aportes al fondo"
		/>
		<Stat label="Propinas" value={s?.count ?? 0} sub="aprobadas" />
		<Stat
			label="Reembolsadas"
			value={s?.counts.refunded ?? 0}
			sub={(s?.counts.rejected ?? 0) === 1
				? '1 rechazada'
				: `${s?.counts.rejected ?? 0} rechazadas`}
		/>
	</div>

	<div class="kv-grid-2">
		<Card title="Por mes">
			{#if months.length}
				<BarList items={months} label="Propinas por mes" />
			{:else}
				<p class="kv-note">Todavía no hay propinas aprobadas.</p>
			{/if}
		</Card>
		<Card title="Por publicación">
			{#if posts.length}
				<BarList items={posts} label="Propinas por publicación" />
			{:else}
				<p class="kv-note">Todavía no hay propinas aprobadas.</p>
			{/if}
		</Card>
	</div>

	<Tabs
		current={filterHref}
		tabs={[
			{ href: '/admin/ajustes/propinas', label: 'Todas' },
			{
				href: '/admin/ajustes/propinas?destino=kinkyvibe',
				label: TIP_DESTINATION_LABELS.kinkyvibe
			},
			{ href: '/admin/ajustes/propinas?destino=fondo', label: TIP_DESTINATION_LABELS.fondo }
		]}
	/>

	<Card title="Últimas propinas" padded={data.tips.length === 0}>
		{#if data.tips.length === 0 && data.destination}
			<p class="kv-note">No hay propinas con este destino.</p>
		{:else if data.tips.length === 0}
			<EmptyState
				icon={HandCoins}
				title="Todavía no hay propinas"
				text="Acá aparecen cuando alguien deja una desde una publicación."
			/>
		{:else}
			<div class="kv-table-wrap">
				<table class="kv-table">
					<thead>
						<tr>
							<th>Fecha</th>
							<th class="r">Monto</th>
							<th>Publicación</th>
							<th>Destino</th>
							<th>Estado</th>
							<th>Mensaje</th>
						</tr>
					</thead>
					<tbody>
						{#each data.tips as t (t.id)}
							<tr>
								<td class="small">{fmtDateTime(t.approved_at ?? t.created_at)}</td>
								<td class="r num">{formatARS(t.amount)}</td>
								<td class="small">
									<a href={tipPostPath(t.post_category, t.post_slug)}>{t.post_slug}</a>
								</td>
								<td class="small">
									{TIP_DESTINATION_LABELS[t.destination] ?? t.destination}
								</td>
								<td><Badge tone={TONES[t.status]}>{TIP_STATUS_LABELS[t.status]}</Badge></td>
								<td class="small msg">
									{#if t.message}{t.message}{:else}<span class="muted">—</span>{/if}
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	</Card>
	<p class="kv-note">
		Los montos son lo que pagó la persona, antes de la comisión de Mercado Pago. Los mensajes son
		privados: solo los ven les admins. Para reembolsar una propina, buscá el pago en Mercado Pago
		(el número está en el CSV, columna <code>pago_mp</code>); el estado se actualiza solo. Todas
		entran a la misma cuenta de Mercado Pago; las "Para el Fondo" aprobadas suman a los aportes al
		fondo (en el Inicio, "Neto del fondo"), igual que el aporte de una entrada solidaria.
	</p>
</div>

<style>
	.msg {
		min-width: 14rem;
		max-width: 22rem;
		overflow-wrap: anywhere;
		white-space: pre-line;
	}
</style>
