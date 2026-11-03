<script>
	/**
	 * Propinas: total (y por destino: KinkyVibe o el Fondo), por mes y por publicación (solo
	 * aprobadas) y la lista con CSV, filtrable por destino (`?destino=`). Las propinas que llegan
	 * desde fondo.kinkyvibe.ar (`source = 'fondo'`, «Una vez») no tienen publicación: van en su
	 * propia fila y sin link.
	 */
	import '$lib/admin/panel-forms.scss';
	import { HandCoins } from '@lucide/svelte';
	import { fmtDateTime } from '$lib/admin/format.js';
	import { formatARS } from '$lib/utils/money.js';
	import {
		FONDO_SITE_URL,
		TIP_DESTINATION_LABELS,
		TIP_SOURCE_LABELS,
		TIP_STATUS_LABELS,
		monthLabel,
		tipCategoryLabel,
		tipPostPath
	} from '$lib/utils/propinas.js';
	import PageHeader from '$lib/components/admin/panel/PageHeader.svelte';
	import { areaBackLink } from '$lib/admin/nav.js';
	import Card from '$lib/components/admin/panel/Card.svelte';
	import Stat from '$lib/components/admin/panel/Stat.svelte';
	import Badge from '$lib/components/admin/panel/Badge.svelte';
	import BarList from '$lib/components/admin/panel/BarList.svelte';
	import Tabs from '$lib/components/admin/panel/Tabs.svelte';
	import CsvButton from '$lib/components/admin/panel/CsvButton.svelte';
	import EmptyState from '$lib/components/admin/panel/EmptyState.svelte';
	import { enhance } from '$app/forms';
	import { dayLabel, fondoMonthSpan, formatRate, formatUSD } from '$lib/utils/paypal.js';

	export let data;
	export let form;

	$: pp = data.paypal;
	$: pq = pp?.quote ?? null;
	/** El ajuste con signo: «−4 %», «+2,5 %», «0 %». @param {number} n */
	const pctText = (n) =>
		`${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n).toLocaleString('es-AR')} %`;
	/** La respuesta de las actions de esta página (cada una dice de qué formulario es). */
	/** @type {any} */
	let f;
	$: f = form;
	/** Lo que se había escrito en un formulario que volvió con error. */
	$: sent = (/** @type {string} */ name, /** @type {string} */ key) =>
		f?.form === name && f?.values ? String(f.values[key] ?? '') : '';
	/** @type {Record<string, string>} */
	$: retiroErrors = f?.form === 'retiro' && f?.errors ? f.errors : {};
	$: adjustmentValue =
		f?.form === 'ajuste' && !f?.ok
			? sent('ajuste', 'adjustment')
			: String(pp?.adjustment?.pct ?? 0).replace('.', ',');
	/** @type {import('@sveltejs/kit').SubmitFunction} */
	const confirmDelete = ({ cancel }) => {
		if (!confirm('¿Borrar este retiro? No se puede deshacer.')) cancel();
		return async ({ update }) => update();
	};

	$: s = data.summary;
	$: months = (s?.byMonth ?? []).map((m) => ({
		label: monthLabel(m.month),
		value: m.total,
		text: formatARS(m.total),
		sub: m.count === 1 ? '1 propina' : `${m.count} propinas`
	}));
	$: posts = (s?.byPost ?? []).map((p) =>
		p.source === 'fondo'
			? {
					label: TIP_SOURCE_LABELS.fondo,
					value: p.total,
					text: formatARS(p.total),
					sub: `fondo.kinkyvibe.ar · ${tipsText(p.count)}`
				}
			: {
					label: p.slug,
					value: p.total,
					text: formatARS(p.total),
					sub: `${tipCategoryLabel(p.category)} · ${tipsText(p.count)}`,
					href: tipPostPath(p.category, p.slug)
				}
	);

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
	back={areaBackLink('propinas')}
	title="Propinas"
	subtitle="Las que se dejan al pie de las publicaciones de Kinky Vibe y las donaciones «Una vez» de fondo.kinkyvibe.ar. Entran a la misma cuenta de Mercado Pago que las entradas."
>
	<svelte:fragment slot="actions">
		<CsvButton href="/admin/ajustes/propinas/propinas.csv" />
	</svelte:fragment>
</PageHeader>

<div class="kv-stack">
	{#if !data.dbAvailable}
		<p class="kv-flash bad">No hay base de datos disponible.</p>
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

	{#if pp}
		<h2 class="pp-title">PayPal</h2>
		{#if pp.error}
			<p class="kv-flash bad">
				No se pudo leer lo de PayPal (¿falta la migración 0071?). Lo demás de la página anda.
			</p>
		{/if}
		{#if form?.form && form?.message}
			<p class="kv-flash ok" role="status">{form.message}</p>
		{:else if form?.form && form?.error}
			<p class="kv-flash bad" role="alert">{form.error}</p>
		{/if}

		<Card title="Por mes del Fondo">
			<div class="kv-table-wrap">
				<table class="kv-table">
					<thead>
						<tr>
							<th>Mes del Fondo</th>
							<th class="r">Mercado Pago</th>
							<th class="r">PayPal (neto)</th>
							<th class="r">PayPal en pesos (estimado)</th>
							<th class="r">Total</th>
						</tr>
					</thead>
					<tbody>
						{#each pp.split as m (m.month)}
							<tr>
								<td>
									{monthLabel(m.month)}
									<span class="small muted">{fondoMonthSpan(m.month)}</span>
								</td>
								<td class="r num">{formatARS(m.mpArs)}</td>
								<td class="r num">{formatUSD(m.paypalUsdCents)}</td>
								<td class="r num">{formatARS(m.paypalArs)}</td>
								<td class="r num">{formatARS(m.totalArs)}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
			<p class="kv-note">
				Propinas al Fondo aprobadas, por fecha de aprobación. Lo de PayPal es lo que queda después
				de su comisión, pasado a pesos con la cotización del día de cada pago y el ajuste de abajo:
				es una estimación (los pesos de verdad son los de cada retiro).
			</p>
		</Card>

		<div class="kv-grid-2">
			<Card title="Cotización del dólar" status={!pq || pq.stale ? 'warn' : ''}>
				{#if pq}
					<p class="pp-rate">
						<span class="big num">{formatRate(pq.rate)}</span>
						{#if pq.stale}
							<Badge tone="warn">dato viejo</Badge>
						{:else}
							<Badge tone="ok">al día</Badge>
						{/if}
					</p>
					<dl class="pp-dl">
						<dt>Dólar MEP compra</dt>
						<dd class="num">{formatRate(pq.base)}</dd>
						<dt>Ajuste</dt>
						<dd class="num">{pctText(pq.adjustmentPct)}</dd>
						<dt>Del día</dt>
						<dd>{dayLabel(pq.date)}</dd>
					</dl>
					{#if pq.stale}
						<p class="kv-note">
							No se pudo traer la cotización de los últimos días: se usa la del {dayLabel(pq.date)}.
						</p>
					{/if}
				{:else}
					<p class="kv-note">
						Todavía no hay ninguna cotización guardada. Se trae sola todos los días a las 18:15.
					</p>
				{/if}
				<form
					class="kv-form"
					method="POST"
					action="?/ajuste"
					use:enhance={() =>
						async ({ update }) =>
							update({ reset: false })}
				>
					<label class="kv-field narrow">
						<span>Ajuste de la cotización (%)</span>
						<input
							type="text"
							name="adjustment"
							inputmode="decimal"
							value={adjustmentValue}
							maxlength="8"
							autocomplete="off"
							aria-invalid={form?.form === 'ajuste' && form?.error ? 'true' : undefined}
						/>
						<small>Por ejemplo −4. Vacío o 0 = sin ajuste.</small>
					</label>
					<div class="kv-row">
						<button class="kv-btn" type="submit">Guardar ajuste</button>
					</div>
				</form>
				<p class="kv-note">
					La cotización es el dólar MEP «compra» de cada día, más el ajuste. Cambiar el ajuste
					cambia todas las estimaciones, también las de meses pasados; la cotización de cada pago no
					cambia. fondo.kinkyvibe.ar usa la misma.
				</p>
			</Card>

			<Card title="Cargar un retiro">
				<form
					class="kv-form"
					method="POST"
					action="?/retiro"
					use:enhance={() =>
						async ({ update }) =>
							update()}
				>
					<label class="kv-field">
						<span>Fecha</span>
						<input
							type="date"
							name="day"
							max={pp.today}
							value={sent('retiro', 'day') || pp.today}
							required
							aria-invalid={retiroErrors.day ? 'true' : undefined}
						/>
						{#if retiroErrors.day}<small class="kv-error">{retiroErrors.day}</small>{/if}
					</label>
					<label class="kv-field">
						<span>Dólares que salieron de PayPal</span>
						<input
							type="text"
							name="usd"
							inputmode="decimal"
							value={sent('retiro', 'usd')}
							required
							autocomplete="off"
							aria-invalid={retiroErrors.usd ? 'true' : undefined}
						/>
						{#if retiroErrors.usd}<small class="kv-error">{retiroErrors.usd}</small>{/if}
					</label>
					<label class="kv-field">
						<span>Pesos que llegaron</span>
						<input
							type="text"
							name="ars"
							inputmode="numeric"
							value={sent('retiro', 'ars')}
							required
							autocomplete="off"
							aria-invalid={retiroErrors.ars ? 'true' : undefined}
						/>
						{#if retiroErrors.ars}<small class="kv-error">{retiroErrors.ars}</small>{/if}
					</label>
					<label class="kv-field">
						<span>Nota (opcional)</span>
						<input
							type="text"
							name="note"
							maxlength="200"
							value={sent('retiro', 'note')}
							autocomplete="off"
							aria-invalid={retiroErrors.note ? 'true' : undefined}
						/>
						{#if retiroErrors.note}<small class="kv-error">{retiroErrors.note}</small>{/if}
					</label>
					<div class="kv-row">
						<button class="kv-btn" type="submit">Guardar retiro</button>
					</div>
				</form>
			</Card>
		</div>

		<Card title="Retiros" padded={pp.withdrawals.length === 0}>
			{#if pp.withdrawals.length === 0}
				<p class="kv-note">
					Todavía no hay retiros. Cargá cada uno para comparar los pesos que llegaron con los
					estimados.
				</p>
			{:else}
				<div class="kv-table-wrap">
					<table class="kv-table">
						<thead>
							<tr>
								<th>Fecha</th>
								<th class="r">Dólares</th>
								<th class="r">Pesos que llegaron</th>
								<th class="r">Cotización real</th>
								<th class="r">Estimada</th>
								<th class="r">Diferencia</th>
								<th>Nota</th>
								<th><span class="visually-hidden">Borrar</span></th>
							</tr>
						</thead>
						<tbody>
							{#each pp.withdrawals as w (w.id)}
								<tr>
									<td class="small">{dayLabel(w.day)}</td>
									<td class="r num">{formatUSD(w.usdCents)}</td>
									<td class="r num">{formatARS(w.ars)}</td>
									<td class="r num">{formatRate(w.realRate)}</td>
									<td class="r num">
										{#if w.estimatedRate !== null}{formatRate(w.estimatedRate)}{:else}<span
												class="muted">—</span
											>{/if}
									</td>
									<td class="r num">
										{#if w.diffPct !== null}{pctText(w.diffPct)}{:else}<span class="muted">—</span
											>{/if}
									</td>
									<td class="small msg">
										{#if w.note}{w.note}{:else}<span class="muted">—</span>{/if}
									</td>
									<td>
										<form method="POST" action="?/borrarRetiro" use:enhance={confirmDelete}>
											<input type="hidden" name="id" value={w.id} />
											<button class="kv-btn small permanent" type="submit">Borrar</button>
										</form>
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/if}
		</Card>
		<p class="kv-note">
			«Estimada» es la cotización del día del retiro con el ajuste de ahora; «Diferencia», cuánto
			más (o menos) llegó que lo estimado. Sirve para elegir el ajuste.
		</p>
	{/if}

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
		menu
		menuCaption="Ver"
		sumCounts={false}
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
									{#if t.source === 'fondo'}
										<a href={FONDO_SITE_URL} target="_blank" rel="noopener"
											>{TIP_SOURCE_LABELS.fondo}</a
										>
									{:else}
										<a href={tipPostPath(t.post_category, t.post_slug)}>{t.post_slug}</a>
									{/if}
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
	.pp-title {
		margin: var(--space-xs) 0 0;
		font-size: var(--text-xl);
	}
	.pp-rate {
		display: flex;
		align-items: center;
		gap: var(--space-2xs);
		margin: 0;
	}
	.big {
		font-size: var(--text-2xl);
		font-weight: 700;
	}
	.pp-dl {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: var(--space-3xs) var(--space-xs);
		margin: 0;
	}
	.pp-dl dt {
		color: var(--muted);
	}
	.pp-dl dd {
		margin: 0;
	}
	.narrow {
		max-width: 18rem;
	}
	.msg {
		min-width: 14rem;
		max-width: 22rem;
		overflow-wrap: anywhere;
		white-space: pre-line;
	}
</style>
