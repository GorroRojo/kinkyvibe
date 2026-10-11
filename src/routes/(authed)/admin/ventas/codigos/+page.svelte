<script>
	/**
	 * Códigos de descuento: lista con usos (y CSV), alta y activar/desactivar.
	 */
	import '$lib/admin/panel-forms.scss';
	import { enhance } from '$app/forms';
	import { Plus, TicketPercent } from '@lucide/svelte';
	import { fmtDateTime } from '$lib/admin/format.js';
	import { csvFilename } from '$lib/admin/csv.js';
	import { formatARS } from '$lib/utils/money.js';
	import { plural } from '$lib/utils/plural.js';
	import PageHeader from '$lib/components/admin/panel/PageHeader.svelte';
	import Card from '$lib/components/admin/panel/Card.svelte';
	import Badge from '$lib/components/admin/panel/Badge.svelte';
	import CsvButton from '$lib/components/admin/panel/CsvButton.svelte';
	import EmptyState from '$lib/components/admin/panel/EmptyState.svelte';

	export let data;
	export let form;

	let kind = 'percent';
	/** @type {Record<string, string>} */
	$: values = form?.create && 'values' in form.create ? (form.create.values ?? {}) : {};
	/** @type {Record<string, string>} */
	$: errors = form?.create && 'errors' in form.create ? (form.create.errors ?? {}) : {};
	$: titles = { ...data.titles, ...Object.fromEntries(data.events.map((e) => [e.slug, e.title])) };

	/** @param {(typeof data.codes)[number]} c */
	function codeState(c) {
		if (!c.active) return 'Apagado';
		if (c.ends_at !== null && data.now >= c.ends_at) return 'Vencido';
		if (c.starts_at !== null && data.now < c.starts_at) return 'Todavía no empieza';
		if (c.max_uses !== null && c.approved + c.held >= c.max_uses) return 'Sin usos disponibles';
		return 'Activo';
	}
	/** @param {string} s @returns {'ok' | 'warn' | 'neutral'} */
	const tone = (s) => (s === 'Activo' ? 'ok' : s === 'Apagado' ? 'neutral' : 'warn');
	/** @param {(typeof data.codes)[number]} c */
	const valueText = (c) => (c.kind === 'percent' ? `${c.value} %` : formatARS(c.value));
	/** @param {(typeof data.codes)[number]} c */
	const eventText = (c) =>
		c.event_slug ? (titles[c.event_slug] ?? c.event_slug) : 'Todos los eventos';

	/** @type {import('$lib/admin/csv.js').CsvColumn<(typeof data.codes)[number]>[]} */
	const columns = [
		{ label: 'codigo', key: 'code' },
		{ label: 'tipo', value: (c) => (c.kind === 'percent' ? 'porcentaje' : 'monto fijo') },
		{ label: 'valor', key: 'value' },
		{ label: 'evento', value: (c) => c.event_slug ?? '' },
		{ label: 'desde', value: (c) => (c.starts_at ? new Date(c.starts_at).toISOString() : '') },
		{ label: 'hasta', value: (c) => (c.ends_at ? new Date(c.ends_at).toISOString() : '') },
		{ label: 'usos_max', value: (c) => c.max_uses ?? '' },
		{ label: 'aprobados', key: 'approved' },
		{ label: 'en_reserva', key: 'held' },
		{ label: 'descontado', key: 'discounted' },
		{ label: 'estado', value: (c) => codeState(c) },
		{ label: 'creado', value: (c) => new Date(c.created_at).toISOString() },
		{ label: 'creado_por', key: 'created_by' }
	];
</script>

<PageHeader
	title="Códigos de descuento"
	subtitle="La persona escribe el código al comprar."
	back={{ href: '/admin/ventas', label: 'Ventas' }}
>
	<svelte:fragment slot="actions">
		<a class="kv-btn" href="#nuevo"><Plus size={16} aria-hidden="true" /> Nuevo código</a>
		<CsvButton rows={data.codes} {columns} filename={csvFilename('codigos')} />
	</svelte:fragment>
</PageHeader>

<div class="kv-stack">
	{#if !data.dbAvailable}
		<p class="kv-flash bad">No hay base de datos disponible.</p>
	{/if}
	{#if form?.toggle}
		<p class="kv-flash" class:bad={!form.toggle.ok} role="status">{form.toggle.message}</p>
	{/if}

	<Card title="Nuevo código">
		<span id="nuevo" class="anchor"></span>
		{#if form?.create && 'ok' in form.create}
			<p class="kv-flash" role="status">{form.create.message}</p>
		{:else if form?.create && 'error' in form.create}
			<p class="kv-flash bad" role="alert">{form.create.error}</p>
		{/if}
		<form class="kv-form" method="POST" action="?/create" use:enhance>
			<div class="kv-grid-2">
				<label class="kv-field">
					<span>Código</span>
					<input
						name="code"
						required
						maxlength="32"
						autocomplete="off"
						autocapitalize="characters"
						placeholder="Ej.: AMIGUES20"
						value={values.code ?? ''}
						aria-invalid={errors.code ? 'true' : undefined}
					/>
					<small>3 a 32 letras, números, - o _. No distingue mayúsculas.</small>
					{#if errors.code}<small class="kv-error">{errors.code}</small>{/if}
				</label>
				<label class="kv-field">
					<span>Evento</span>
					<select name="event_slug" value={values.event_slug ?? ''}>
						<option value="">Todos los eventos</option>
						{#each data.events as e (e.slug)}
							<option value={e.slug}>{e.title}</option>
						{/each}
					</select>
					{#if errors.event_slug}<small class="kv-error">{errors.event_slug}</small>{/if}
				</label>
			</div>

			<fieldset class="kv-field plain">
				<legend>Tipo de descuento</legend>
				<label class="kv-check">
					<input type="radio" name="kind" value="percent" bind:group={kind} />
					Porcentaje del total
				</label>
				<label class="kv-check">
					<input type="radio" name="kind" value="fixed" bind:group={kind} />
					Monto fijo en pesos (por compra)
				</label>
				{#if errors.kind}<small class="kv-error">{errors.kind}</small>{/if}
			</fieldset>

			<div class="kv-grid-2">
				<label class="kv-field">
					<span>{kind === 'percent' ? 'Porcentaje (1 a 100)' : 'Monto a descontar ($)'}</span>
					<input
						name="value"
						type="number"
						required
						min="1"
						max={kind === 'percent' ? 100 : undefined}
						step="1"
						inputmode="numeric"
						value={values.value ?? ''}
						aria-invalid={errors.value ? 'true' : undefined}
					/>
					{#if kind === 'percent'}<small>100 = entrada sin cargo.</small>{/if}
					{#if errors.value}<small class="kv-error">{errors.value}</small>{/if}
				</label>
				<label class="kv-field">
					<span>Usos máximos (opcional)</span>
					<input
						name="max_uses"
						type="number"
						min="1"
						step="1"
						inputmode="numeric"
						value={values.max_uses ?? ''}
					/>
					<small>Cantidad de compras que pueden usarlo. Vacío: sin límite.</small>
					{#if errors.max_uses}<small class="kv-error">{errors.max_uses}</small>{/if}
				</label>
				<label class="kv-field">
					<span>Válido desde (opcional)</span>
					<input name="starts_at" type="datetime-local" value={values.starts_at ?? ''} />
					{#if errors.starts_at}<small class="kv-error">{errors.starts_at}</small>{/if}
				</label>
				<label class="kv-field">
					<span>Válido hasta (opcional)</span>
					<input name="ends_at" type="datetime-local" value={values.ends_at ?? ''} />
					<small>Hora de Argentina. Vacío: sin límite de fecha.</small>
					{#if errors.ends_at}<small class="kv-error">{errors.ends_at}</small>{/if}
				</label>
			</div>

			<div><button class="kv-btn" type="submit">Crear código</button></div>
		</form>
	</Card>

	<Card title="Códigos" padded={data.codes.length === 0}>
		{#if data.codes.length === 0}
			<EmptyState
				icon={TicketPercent}
				title="Todavía no hay códigos"
				text="Creá el primero acá arriba."
			/>
		{:else}
			<div class="kv-table-wrap">
				<table class="kv-table">
					<thead>
						<tr>
							<th>Código</th>
							<th>Evento</th>
							<th>Vigencia</th>
							<th class="r">Usos</th>
							<th>Estado</th>
							<th aria-label="Acción"></th>
						</tr>
					</thead>
					<tbody>
						{#each data.codes as c (c.code)}
							{@const state = codeState(c)}
							<tr class="code" class:inactive={state !== 'Activo'}>
								<td>
									<b class="name">{c.code}</b>
									<small class="muted">{valueText(c)} de descuento</small>
								</td>
								<td>{eventText(c)}</td>
								<td class="small">
									{#if c.starts_at || c.ends_at}
										{c.starts_at ? `desde ${fmtDateTime(c.starts_at)}` : ''}
										{c.ends_at ? `hasta ${fmtDateTime(c.ends_at)}` : ''}
									{:else}
										<span class="muted">Sin fechas</span>
									{/if}
								</td>
								<td class="r num small">
									{plural(c.approved, 'aprobado', 'aprobados')}{#if c.held}
										+ {c.held} en reserva{/if}
									{c.max_uses !== null ? `de ${c.max_uses}` : '(sin límite)'}
									{#if c.discounted}<small class="muted">descontado {formatARS(c.discounted)}</small
										>{/if}
								</td>
								<td><Badge tone={tone(state)}>{state}</Badge></td>
								<td>
									<form method="POST" action="?/toggle" use:enhance>
										<input type="hidden" name="code" value={c.code} />
										<input type="hidden" name="active" value={c.active ? '0' : '1'} />
										<button type="submit" class="kv-btn ghost">
											{c.active ? 'Apagar' : 'Prender'}
										</button>
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
		Un <strong>uso</strong> es una compra (no una entrada): cuentan las compras aprobadas y las que están
		reservadas esperando el pago; si una reserva vence o se cancela, el uso se libera. Si el descuento
		deja el total en $&nbsp;0, las entradas se emiten sin pasar por Mercado Pago.
	</p>
</div>

<style>
	.name {
		font-family: ui-monospace, monospace;
		letter-spacing: 0.04em;
	}
	td small {
		display: block;
	}
	.small {
		font-size: var(--text-sm);
	}
	tr.inactive td:not(:last-child) {
		opacity: 0.7;
	}
	.plain {
		border: 0;
		margin: 0;
		padding: 0;
	}
	.plain legend {
		font-weight: 700;
		font-size: var(--text-sm);
		padding: 0;
		margin-bottom: 0.2rem;
	}
	.anchor {
		position: relative;
		top: -5rem;
	}
</style>
