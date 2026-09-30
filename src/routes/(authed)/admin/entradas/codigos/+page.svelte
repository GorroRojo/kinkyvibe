<script>
	import { enhance } from '$app/forms';
	import { formatARS } from '$lib/utils/money.js';

	let { data, form } = $props();

	let kind = $state('percent');
	/** @type {Record<string, string>} */
	let values = $derived(form?.create && 'values' in form.create ? form.create.values : {});
	/** @type {Record<string, string>} */
	let errors = $derived(form?.create && 'errors' in form.create ? form.create.errors : {});
	let titles = $derived(Object.fromEntries(data.events.map((e) => [e.slug, e.title])));

	/** @param {number | null} ms */
	function date(ms) {
		return ms
			? new Date(ms).toLocaleString('es-AR', {
					dateStyle: 'short',
					timeStyle: 'short',
					hourCycle: 'h23',
					timeZone: 'America/Argentina/Buenos_Aires'
				})
			: '';
	}

	/** @param {(typeof data.codes)[number]} c */
	function codeState(c) {
		if (!c.active) return 'Inactivo';
		if (c.ends_at !== null && data.now >= c.ends_at) return 'Vencido';
		if (c.starts_at !== null && data.now < c.starts_at) return 'Todavía no empieza';
		if (c.max_uses !== null && c.approved + c.held >= c.max_uses) return 'Sin usos disponibles';
		return 'Activo';
	}
</script>

<svelte:head>
	<title>Códigos de descuento - KV Admin</title>
</svelte:head>

<div class="codes-page">
	<p><a href="/admin/entradas">← Entradas</a></p>
	<h1>Códigos de descuento</h1>
	<p class="note">
		La persona escribe el código al comprar. Un <strong>uso</strong> es una compra (no una entrada): cuentan
		las compras aprobadas y las que están reservadas esperando el pago; si una reserva vence o se cancela,
		el uso se libera. Si el descuento deja el total en $&nbsp;0, las entradas se emiten sin pasar por
		Mercado Pago.
	</p>
	{#if !data.dbAvailable}
		<p class="flash error">No hay base de datos disponible.</p>
	{/if}

	{#if form?.toggle}
		<p class="flash" class:error={!form.toggle.ok} role="status">{form.toggle.message}</p>
	{/if}

	<section aria-labelledby="lista">
		<h2 id="lista">Códigos</h2>
		{#if data.codes.length === 0}
			<p>Todavía no hay códigos.</p>
		{/if}
		<ul class="codes">
			{#each data.codes as c (c.code)}
				<li class="code" class:inactive={codeState(c) !== 'Activo'}>
					<div class="head">
						<strong class="name">{c.code}</strong>
						<span class="value">
							{c.kind === 'percent' ? `${c.value}%` : formatARS(c.value)} de descuento
						</span>
						<span class="state">{codeState(c)}</span>
					</div>
					<dl>
						<dt>Evento</dt>
						<dd>{c.event_slug ? (titles[c.event_slug] ?? c.event_slug) : 'Todos los eventos'}</dd>
						<dt>Vigencia</dt>
						<dd>
							{#if c.starts_at || c.ends_at}
								{c.starts_at ? `desde ${date(c.starts_at)}` : ''}
								{c.ends_at ? `hasta ${date(c.ends_at)}` : ''}
							{:else}
								Sin fechas
							{/if}
						</dd>
						<dt>Usos</dt>
						<dd>
							{c.approved} aprobados{#if c.held}
								+ {c.held} en reserva{/if}
							{c.max_uses !== null ? `de ${c.max_uses}` : '(sin límite)'}
							{#if c.discounted}· descontado {formatARS(c.discounted)}{/if}
						</dd>
						<dt>Creado</dt>
						<dd>{date(c.created_at)} por {c.created_by}</dd>
					</dl>
					<form method="POST" action="?/toggle" use:enhance>
						<input type="hidden" name="code" value={c.code} />
						<input type="hidden" name="active" value={c.active ? '0' : '1'} />
						<button type="submit" class:secondary={c.active}>
							{c.active ? 'Desactivar' : 'Activar'}
						</button>
					</form>
				</li>
			{/each}
		</ul>
	</section>

	<section aria-labelledby="nuevo" class="new">
		<h2 id="nuevo">Nuevo código</h2>
		{#if form?.create && 'ok' in form.create}
			<p class="flash" role="status">{form.create.message}</p>
		{:else if form?.create && 'error' in form.create}
			<p class="flash error" role="alert">{form.create.error}</p>
		{/if}
		<form method="POST" action="?/create" use:enhance>
			<label class="field">
				<span>Código</span>
				<input
					name="code"
					required
					maxlength="32"
					autocomplete="off"
					autocapitalize="characters"
					placeholder="AMIGUES20"
					value={values.code ?? ''}
				/>
				<small>3 a 32 letras, números, - o _. No distingue mayúsculas.</small>
				{#if errors.code}<small class="error">{errors.code}</small>{/if}
			</label>

			<fieldset class="field">
				<legend>Tipo de descuento</legend>
				<label class="radio">
					<input type="radio" name="kind" value="percent" bind:group={kind} />
					Porcentaje del total
				</label>
				<label class="radio">
					<input type="radio" name="kind" value="fixed" bind:group={kind} />
					Monto fijo en pesos (por compra)
				</label>
				{#if errors.kind}<small class="error">{errors.kind}</small>{/if}
			</fieldset>

			<label class="field">
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
				/>
				{#if kind === 'percent'}<small>100 = entrada sin cargo.</small>{/if}
				{#if errors.value}<small class="error">{errors.value}</small>{/if}
			</label>

			<label class="field">
				<span>Evento</span>
				<select name="event_slug" value={values.event_slug ?? ''}>
					<option value="">Todos los eventos</option>
					{#each data.events as e (e.slug)}
						<option value={e.slug}>{e.title}</option>
					{/each}
				</select>
				{#if errors.event_slug}<small class="error">{errors.event_slug}</small>{/if}
			</label>

			<div class="row">
				<label class="field">
					<span>Válido desde (opcional)</span>
					<input name="starts_at" type="datetime-local" value={values.starts_at ?? ''} />
					{#if errors.starts_at}<small class="error">{errors.starts_at}</small>{/if}
				</label>
				<label class="field">
					<span>Válido hasta (opcional)</span>
					<input name="ends_at" type="datetime-local" value={values.ends_at ?? ''} />
					{#if errors.ends_at}<small class="error">{errors.ends_at}</small>{/if}
				</label>
			</div>
			<small>Hora de Argentina. Vacío: sin límite de fecha.</small>

			<label class="field">
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
				{#if errors.max_uses}<small class="error">{errors.max_uses}</small>{/if}
			</label>

			<button type="submit">Crear código</button>
		</form>
	</section>
</div>

<style>
	.codes-page {
		max-width: 50rem;
		margin: 0 auto;
		padding: 0 16px 2em;
	}
	h1 {
		font-size: var(--step-2);
	}
	.note,
	small {
		color: #555;
		font-size: var(--step--1);
	}
	.flash {
		background: var(--3-light);
		padding: 0.5em;
		border-radius: 0.5em;
	}
	.flash.error {
		background: hsl(0, 90%, 90%);
	}
	.codes {
		list-style: none;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.6em;
	}
	.code {
		background: white;
		border-radius: 0.7em;
		padding: 0.7em 0.9em;
		outline: 2px solid var(--3);
	}
	.code.inactive {
		outline-color: #ccc;
		background: #fafafa;
	}
	.head {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 0.3em 0.8em;
	}
	.name {
		font-family: ui-monospace, monospace;
		font-size: var(--step-1);
	}
	.state {
		margin-left: auto;
		font-size: var(--step--1);
		font-weight: bold;
	}
	dl {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: 0.2em 1em;
		font-size: var(--step--1);
		margin: 0.5em 0;
	}
	dt {
		font-weight: bold;
	}
	dd {
		margin: 0;
	}
	.new {
		margin-top: 2em;
		padding: 0.8em 1em 1em;
		border-radius: 0.8em;
		background: color-mix(in srgb, var(--2) 6%, white);
	}
	.new form {
		display: flex;
		flex-direction: column;
		gap: 0.8em;
	}
	.field {
		display: flex;
		flex-direction: column;
		gap: 0.25em;
		border: 0;
		padding: 0;
		margin: 0;
	}
	.field > span,
	legend {
		font-weight: bold;
		font-size: var(--step--1);
	}
	.radio {
		display: flex;
		gap: 0.5em;
		align-items: center;
	}
	.row {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.6em;
	}
	input:not([type='radio']),
	select {
		font: inherit;
		padding: 0.5em 0.7em;
		border-radius: 0.5em;
		border: 2px solid color-mix(in srgb, var(--2) 45%, transparent);
		background: white;
		min-height: 2.6em;
	}
	button {
		font: inherit;
		font-weight: bold;
		border: 0;
		border-radius: 0.5em;
		padding: 0.6em 1.1em;
		min-height: 2.6em;
		background: var(--2);
		color: white;
		cursor: pointer;
	}
	button.secondary {
		background: white;
		color: var(--1-dark);
		outline: 2px solid var(--1);
	}
	.error {
		color: hsl(0, 75%, 40%);
	}
	@media (max-width: 500px) {
		.row {
			grid-template-columns: 1fr;
		}
	}
</style>
