<script>
	import '$lib/admin/panel-forms.scss';
	import { enhance } from '$app/forms';
	import { AJUSTES_TABS, fieldErrors, fieldValue } from '$lib/admin/ajustes.js';
	import { fmtDateTime } from '$lib/admin/format.js';
	import PageHeader from '$lib/components/admin/panel/PageHeader.svelte';
	import Card from '$lib/components/admin/panel/Card.svelte';
	import Tabs from '$lib/components/admin/panel/Tabs.svelte';

	export let data;
	export let form;

	$: errors = fieldErrors(form);
	/** @type {(key: string) => string} */
	$: value = (key) => fieldValue(form, data.settings, key);
	$: transferSet = data.fields.some((f) => value(f.key).trim());
	/** Comisión que se usa si el campo queda vacío (TICKETS_MP_FEE_PERCENT o 2 %). */
	$: feeDefault = String(data.env.feePercent).replace('.', ',');
	$: feeValue =
		form && 'values' in form ? value('mp_fee_percent') : value('mp_fee_percent') || feeDefault;
</script>

<PageHeader title="Cobros" subtitle="Datos para transferir y recargo de Mercado Pago." />
<Tabs tabs={[...AJUSTES_TABS]} />

<form
	class="kv-form settings"
	method="POST"
	action="?/save"
	use:enhance={() =>
		async ({ update }) =>
			update({ reset: false })}
>
	{#if !data.dbAvailable}
		<p class="kv-flash bad">
			No hay base de datos disponible (o faltan las migraciones): se usan las variables de entorno.
		</p>
	{/if}
	{#if form?.message}
		<p class="kv-flash" role="status">{form.message}</p>
	{:else if form?.error}
		<p class="kv-flash bad" role="alert">{form.error}</p>
	{/if}

	<Card title="Datos para transferir">
		<p class="kv-note">
			Es lo que ve quien elige pagar por transferencia (en la página de su compra y en el mail).
			Texto libre; se muestran solo los campos completos.
			{#if transferSet}
				La opción <strong>Transferencia</strong> se ofrece en los eventos que la habilitan.
			{:else if data.env.transfer}
				Vacío: se usan los datos de la variable <code>TICKETS_TRANSFER_INFO</code> del servidor.
			{:else}
				<strong>Vacío: no se ofrece pagar por transferencia</strong> en ningún evento.
			{/if}
		</p>
		<div class="kv-grid-2">
			{#each data.fields as f (f.key)}
				<label class="kv-field">
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
					{#if errors[f.key]}<small class="kv-error field-error">{errors[f.key]}</small>{/if}
				</label>
			{/each}
		</div>
	</Card>

	<Card title="Mercado Pago">
		<label class="kv-field narrow">
			<span>Comisión que se suma como recargo (%)</span>
			<input
				type="text"
				name="mp_fee_percent"
				inputmode="decimal"
				value={feeValue}
				placeholder={feeDefault}
				maxlength="6"
				autocomplete="off"
				aria-invalid={errors.mp_fee_percent ? 'true' : undefined}
			/>
			{#if errors.mp_fee_percent}<small class="kv-error field-error">{errors.mp_fee_percent}</small
				>{/if}
		</label>
		<p class="kv-note">
			Se suma al pagar con Mercado Pago para que, después de la comisión, llegue el precio de la
			entrada. La comisión real cambia según el plan y el plazo de acreditación de la cuenta de MP:
			revisala y ajustala acá (con <code>0</code>, sin recargo). Si un evento tiene
			<code>mp_fee_percent</code> en su frontmatter, manda ese. Vacío: {feeDefault} % (la variable
			<code>TICKETS_MP_FEE_PERCENT</code> o, si no está, 2 %).
		</p>
	</Card>

	<div class="kv-row">
		<button class="kv-btn" type="submit">Guardar ajustes</button>
		{#if data.settings?.updatedAt}
			<span class="kv-note">
				Último cambio en ajustes: {fmtDateTime(data.settings.updatedAt)} por {data.settings
					.updatedBy}.
			</span>
		{/if}
	</div>
</form>

<style>
	.settings {
		max-width: 48rem;
	}
	.narrow {
		max-width: 18rem;
	}
</style>
