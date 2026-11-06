<script>
	/**
	 * Ajustes › PayPal (decisión 0054): la cotización del dólar, el ajuste en % (se cambia acá y
	 * queda en Actividad), cargar un retiro y la lista de retiros. Lo de las propinas en sí (el
	 * reparto por mes del Fondo incluido) se mira en Estadísticas › Propinas.
	 */
	import '$lib/admin/panel-forms.scss';
	import { formatARS } from '$lib/utils/money.js';
	import PageHeader from '$lib/components/admin/panel/PageHeader.svelte';
	import { areaBackLink } from '$lib/admin/nav.js';
	import Card from '$lib/components/admin/panel/Card.svelte';
	import Badge from '$lib/components/admin/panel/Badge.svelte';
	import { enhance } from '$app/forms';
	import { dayLabel, formatRate, formatUSD } from '$lib/utils/paypal.js';

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
	$: feePct =
		f?.form === 'comision' && !f?.ok
			? sent('comision', 'pct')
			: ((pp?.fee?.basisPoints ?? 540) / 100).toLocaleString('es-AR');
	$: feeFixed =
		f?.form === 'comision' && !f?.ok
			? sent('comision', 'fixed')
			: ((pp?.fee?.fixedCents ?? 30) / 100).toLocaleString('es-AR', { minimumFractionDigits: 2 });
	/** @type {import('@sveltejs/kit').SubmitFunction} */
	const confirmDelete = ({ cancel }) => {
		if (!confirm('¿Borrar este retiro? No se puede deshacer.')) cancel();
		return async ({ update }) => update();
	};
</script>

<PageHeader
	back={areaBackLink('ajustes-paypal')}
	title="PayPal"
	subtitle="La cotización del dólar, su ajuste y los retiros de las propinas que entran por PayPal."
/>

<div class="kv-stack">
	{#if !data.dbAvailable}
		<p class="kv-flash bad">No hay base de datos disponible.</p>
	{:else if !pp}
		<p class="kv-note">
			PayPal está apagado: se prende con el interruptor «PayPal en las propinas», en
			<a href="/admin/ajustes/interruptores">Ajustes › Interruptores</a>.
		</p>
	{/if}

	{#if pp}
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

			<Card title="Comisión de PayPal (recargo)">
				<form
					class="kv-form"
					method="POST"
					action="?/comision"
					use:enhance={() =>
						async ({ update }) =>
							update({ reset: false })}
				>
					<div class="kv-row">
						<label class="kv-field narrow">
							<span>Porcentaje (%)</span>
							<input
								type="text"
								name="pct"
								inputmode="decimal"
								value={feePct}
								maxlength="6"
								autocomplete="off"
							/>
						</label>
						<label class="kv-field narrow">
							<span>Fijo por pago (US$)</span>
							<input
								type="text"
								name="fixed"
								inputmode="decimal"
								value={feeFixed}
								maxlength="6"
								autocomplete="off"
							/>
						</label>
					</div>
					<div class="kv-row">
						<button class="kv-btn" type="submit">Guardar comisión</button>
					</div>
				</form>
				<p class="kv-note">
					Quien compra entradas con PayPal paga esta comisión como recargo, como el recargo de
					Mercado Pago: así a Kinky Vibe le queda el precio entero. Por defecto, 5,4 % + US$ 0,30
					(la de PayPal para cobros del exterior en Argentina; revisala en tu cuenta de PayPal). Las
					propinas no llevan recargo.
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
		<p class="kv-note">
			Las propinas mismas y su reparto por mes están en
			<a href="/admin/estadisticas/propinas">Estadísticas › Propinas</a>.
		</p>
	{/if}
</div>

<style>
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
