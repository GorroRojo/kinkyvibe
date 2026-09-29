<script>
	import { enhance } from '$app/forms';

	let { data, form } = $props();

	/** @type {Record<string, string>} */
	let errors = $derived(form && 'errors' in form ? (form.errors ?? {}) : {});
	/** @param {string} key */
	function value(key) {
		if (form && 'values' in form && form.values) return String(form.values[key] ?? '');
		return String(/** @type {Record<string, any>} */ (data.settings ?? {})[key] ?? '');
	}
	let transferSet = $derived(data.fields.some((f) => value(f.key).trim()));
	/** Comisión que se usa si el campo queda vacío (TICKETS_MP_FEE_PERCENT o 2 %). */
	let feeDefault = $derived(String(data.env.feePercent).replace('.', ','));

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
</script>

<svelte:head>
	<title>Ajustes de venta - KV Admin</title>
</svelte:head>

<div class="settings-page">
	<p><a href="/admin/entradas">← Entradas</a></p>
	<h1>Ajustes de venta</h1>

	{#if !data.dbAvailable}
		<p class="flash error">
			No hay base de datos disponible (o faltan las migraciones): se usan las variables de entorno.
		</p>
	{/if}
	{#if form?.message}
		<p class="flash" role="status">{form.message}</p>
	{:else if form?.error}
		<p class="flash error" role="alert">{form.error}</p>
	{/if}

	<form
		method="POST"
		action="?/save"
		use:enhance={() =>
			async ({ update }) =>
				update({ reset: false })}
	>
		<fieldset>
			<legend>Datos para transferir</legend>
			<p class="note">
				Es lo que ve quien elige pagar por transferencia (en la página de su compra y en el mail).
				Texto libre; se muestran solo los campos completos.
				{#if transferSet}
					La opción <strong>Transferencia</strong> se ofrece en los eventos que la habilitan (<code
						>payment_methods</code
					>).
				{:else if data.env.transfer}
					Vacío: se usan los datos de la variable <code>TICKETS_TRANSFER_INFO</code> del servidor.
				{:else}
					<strong>Vacío: no se ofrece pagar por transferencia</strong> en ningún evento.
				{/if}
			</p>
			{#each data.fields as f (f.key)}
				<label class="field">
					<span>{f.label}</span>
					<input
						type="text"
						name={f.key}
						value={value(f.key)}
						maxlength={f.max}
						autocomplete="off"
						spellcheck="false"
						aria-invalid={errors[f.key] ? 'true' : undefined}
					/>
					{#if errors[f.key]}<span class="field-error">{errors[f.key]}</span>{/if}
				</label>
			{/each}
		</fieldset>

		<fieldset>
			<legend>Mercado Pago</legend>
			<label class="field">
				<span>Comisión que se suma como recargo (%)</span>
				<input
					type="text"
					name="mp_fee_percent"
					inputmode="decimal"
					value={form && 'values' in form
						? value('mp_fee_percent')
						: value('mp_fee_percent') || feeDefault}
					placeholder={feeDefault}
					maxlength="6"
					autocomplete="off"
					aria-invalid={errors.mp_fee_percent ? 'true' : undefined}
				/>
				{#if errors.mp_fee_percent}<span class="field-error">{errors.mp_fee_percent}</span>{/if}
			</label>
			<p class="note">
				Se suma al pagar con Mercado Pago para que, después de la comisión, llegue el precio de la
				entrada. La comisión real cambia según el plan y el plazo de acreditación de la cuenta de
				MP: revisala y ajustala acá (con <code>0</code>, sin recargo). Si un evento tiene
				<code>mp_fee_percent</code> en su frontmatter, manda ese. Vacío: {feeDefault} % (la variable
				<code>TICKETS_MP_FEE_PERCENT</code> o, si no está, 2 %).
			</p>
		</fieldset>

		<button type="submit">Guardar ajustes</button>
		{#if data.settings?.updatedAt}
			<p class="note">
				Último cambio: {date(data.settings.updatedAt)} por {data.settings.updatedBy}.
			</p>
		{/if}
	</form>
</div>

<style>
	.settings-page {
		max-width: 36rem;
		margin: 0 auto;
		padding: 0 16px 3em;
	}
	h1 {
		font-size: var(--step-3);
	}
	form {
		display: flex;
		flex-direction: column;
		gap: 1.2em;
	}
	fieldset {
		border: 0;
		margin: 0;
		padding: 0.8em 1em 1em;
		border-radius: 0.8em;
		background: white;
		outline: 2px solid color-mix(in srgb, var(--2) 30%, transparent);
		display: flex;
		flex-direction: column;
		gap: 0.7em;
		min-width: 0;
	}
	legend {
		font-weight: bold;
		font-size: var(--step-1);
		padding: 0 0.3em;
	}
	.field {
		display: flex;
		flex-direction: column;
		gap: 0.25em;
	}
	.field > span:first-child {
		font-weight: bold;
		font-size: var(--step--1);
	}
	input {
		font: inherit;
		padding: 0.55em 0.7em;
		min-height: 2.8em;
		border-radius: 0.5em;
		border: 2px solid color-mix(in srgb, var(--2) 45%, transparent);
		min-width: 0;
	}
	.note {
		font-size: var(--step--1);
		color: #555;
		margin: 0;
	}
	button {
		font: inherit;
		font-weight: bold;
		align-self: flex-start;
		border: 0;
		border-radius: 0.6em;
		padding: 0.8em 1.4em;
		min-height: 3em;
		background: var(--3-dark);
		color: white;
		cursor: pointer;
	}
	.flash {
		background: var(--3-light);
		padding: 0.5em 0.7em;
		border-radius: 0.5em;
	}
	.flash.error {
		background: hsl(0, 90%, 90%);
	}
	.field-error {
		color: hsl(0, 75%, 40%);
		font-size: var(--step--1);
	}
</style>
