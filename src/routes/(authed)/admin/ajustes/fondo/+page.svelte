<script>
	import '$lib/admin/panel-forms.scss';
	import { enhance } from '$app/forms';
	import { AJUSTES_TABS, fieldErrors, fieldValue } from '$lib/admin/ajustes.js';
	import { fmtDateTime } from '$lib/admin/format.js';
	import PageHeader from '$lib/components/admin/panel/PageHeader.svelte';
	import Card from '$lib/components/admin/panel/Card.svelte';
	import Tabs from '$lib/components/admin/panel/Tabs.svelte';
	import Badge from '$lib/components/admin/panel/Badge.svelte';

	export let data;
	export let form;

	$: errors = fieldErrors(form);
	/** @type {(key: string) => string} */
	$: value = (key) => fieldValue(form, data.settings, key);

	/** @type {Record<string, { tone: 'ok' | 'warn' | 'bad' | 'info' | 'neutral', label: string }>} */
	const SOURCES = {
		admin: { tone: 'warn', label: 'fijado a mano' },
		live: { tone: 'ok', label: 'automático' },
		stored: { tone: 'warn', label: 'último dato guardado' },
		override: { tone: 'info', label: 'valor de prueba' },
		none: { tone: 'bad', label: 'sin dato' }
	};
	$: source = SOURCES[data.fondo.source] ?? SOURCES.none;
</script>

<PageHeader title="Fondo" subtitle="Descuento del Fondo KinkyVibe en las entradas." />
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

	<Card title="Descuento del Fondo ahora">
		<p class="fondo-now">
			<span class="big num">{data.fondo.percent} %</span>
			<Badge tone={source.tone}>{source.label}</Badge>
		</p>
		<p class="kv-note">
			{#if data.fondo.source === 'admin'}
				Fijado a mano acá abajo (vaciá el campo para que vuelva a ser automático).
			{:else if data.fondo.source === 'live'}
				Se actualiza solo desde
				<a href="https://fondo.kinkyvibe.ar" target="_blank" rel="noopener">fondo.kinkyvibe.ar</a
				>{#if data.fondo.updatedAt}; último dato: {fmtDateTime(data.fondo.updatedAt)}{/if}.
			{:else if data.fondo.source === 'stored'}
				fondo.kinkyvibe.ar no responde ahora: se usa el último dato ({fmtDateTime(
					data.fondo.updatedAt
				)}).
			{:else if data.fondo.source === 'override'}
				Valor de prueba (FONDO_PERCENT_OVERRIDE, solo en desarrollo).
			{:else}
				No se pudo leer de fondo.kinkyvibe.ar y no hay un dato anterior: sin descuento.
			{/if}
		</p>
	</Card>

	<Card title="Fijar el porcentaje a mano">
		<label class="kv-field narrow">
			<span>Fijar el porcentaje a mano (%)</span>
			<input
				type="text"
				name="fondo_percent_override"
				inputmode="numeric"
				value={value('fondo_percent_override')}
				placeholder="Vacío = automático"
				maxlength="4"
				autocomplete="off"
				aria-invalid={errors.fondo_percent_override ? 'true' : undefined}
			/>
			{#if errors.fondo_percent_override}<small class="kv-error field-error"
					>{errors.fondo_percent_override}</small
				>{/if}
		</label>
		<p class="kv-note">
			Vacío = automático: el porcentaje del mes de fondo.kinkyvibe.ar, en todos los tipos de entrada
			con precio (no en los a la gorra) de los eventos con la etiqueta KinkyVibe (los demás no usan
			el Fondo). Fijarlo a mano es para emergencias, si fondo.kinkyvibe.ar no anda. Cada compra
			guarda el porcentaje con el que se calculó.
		</p>
	</Card>

	<div class="kv-row">
		<button class="kv-btn" type="submit">Guardar ajustes</button>
	</div>
</form>

<style>
	.settings {
		max-width: 48rem;
	}
	.narrow {
		max-width: 18rem;
	}
	.fondo-now {
		display: flex;
		align-items: center;
		gap: var(--space-2xs);
		margin: 0;
	}
	.big {
		font-size: var(--text-2xl);
		font-weight: 700;
	}
</style>
