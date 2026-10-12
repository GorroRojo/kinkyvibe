<script>
	import '$lib/admin/panel-forms.scss';
	import { enhance } from '$app/forms';
	import PageHeader from '$lib/components/admin/panel/PageHeader.svelte';
	import Card from '$lib/components/admin/panel/Card.svelte';
	import Notice from '$lib/components/ui/Notice.svelte';
	import { describeTier, rowsFromTiers } from '$lib/utils/waitlistSettingsForm.js';

	/** @type {import('./$types').PageData} */
	export let data;
	/** @type {import('./$types').ActionData} */
	export let form;

	/** @type {Record<string, string>} */
	$: sent = form && 'values' in form ? (form.values ?? {}) : {};
	// Las filas de los tramos: las que se mandaron (si hubo un error) o las guardadas.
	$: rows = Object.keys(sent).some((k) => k.startsWith('tier_'))
		? Array.from({ length: data.limits.maxTiers }, (_, i) => i)
				.filter((i) => sent[`tier_over_${i}`] !== undefined)
				.map((i) => ({ over: sent[`tier_over_${i}`] ?? '', hold: sent[`tier_hold_${i}`] ?? '' }))
		: rowsFromTiers(data.current.tiers);
	$: mode = sent.mode ?? data.current.mode;
	$: broadcast = sent.broadcast_under ?? String(data.current.broadcastUnderHours);
	$: endBefore = sent.end_before ?? String(data.current.endBeforeStartMinutes);
</script>

<PageHeader
	title="Lista de espera"
	subtitle="Cuánto se le guarda el lugar a quien le toca, cuándo se le avisa a toda la lista a la vez y cuándo cierra. Cada evento se prende en su editor."
/>

<form
	class="kv-form settings"
	method="POST"
	action="?/save"
	use:enhance={() =>
		async ({ update }) =>
			update({ reset: false })}
>
	{#if !data.enabled}
		<Notice tone="warn" role={null}>
			<span
				>Prueba: la lista de espera está apagada en <a href="/admin/ajustes/interruptores"
					>Interruptores</a
				>. Lo que guardes acá se usa cuando se prenda.</span
			>
		</Notice>
	{/if}
	{#if !data.dbAvailable}
		<p class="kv-flash bad">No hay base de datos disponible: se usan los de por defecto.</p>
	{/if}
	{#if data.problem}
		<p class="kv-flash bad">{data.problem} Mientras tanto se usan los de por defecto.</p>
	{/if}
	{#if form && 'message' in form && form.message}
		<p class="kv-flash" role="status">{form.message}</p>
	{:else if form && 'error' in form && form.error}
		<p class="kv-flash bad" role="alert">{form.error}</p>
	{/if}

	<Card title="De a quién se le avisa">
		<fieldset class="kv-field plain">
			<legend>Cuando se libera un lugar</legend>
			<label class="kv-check">
				<input type="radio" name="mode" value="one" checked={mode !== 'all'} />
				<span
					>De a una persona por vez: se le guarda el lugar un rato y, si no compra, pasa a la
					siguiente</span
				>
			</label>
			<label class="kv-check">
				<input type="radio" name="mode" value="all" checked={mode === 'all'} />
				<span>A toda la lista a la vez: se lo queda quien compre primero</span>
			</label>
		</fieldset>
		<label class="kv-field">
			<span>Avisar a toda la lista a la vez cuando faltan menos de (horas)</span>
			<input
				type="number"
				name="broadcast_under"
				min="0"
				max={data.limits.maxBroadcastUnderHours}
				value={broadcast}
				inputmode="numeric"
				required
			/>
			<small class="kv-note"
				>Cerca del evento no hay tiempo de ir de a une. Por defecto, {data.defaults
					.broadcastUnderHours} h.</small
			>
		</label>
		<label class="kv-field">
			<span>La lista cierra antes del comienzo (minutos)</span>
			<input
				type="number"
				name="end_before"
				min="0"
				max={data.limits.maxEndBeforeStartMinutes}
				value={endBefore}
				inputmode="numeric"
				required
			/>
			<small class="kv-note"
				>Ninguna reserva pasa de ahí (ni del cierre de la venta). Por defecto, {data.defaults
					.endBeforeStartMinutes} minutos.</small
			>
		</label>
	</Card>

	<Card title="Cuánto se guarda el lugar">
		<p class="kv-note">
			Según cuánto falta para el evento. Por defecto: {data.defaults.tiers
				.map(describeTier)
				.join('; ')}.
		</p>
		<div class="tiers">
			<span class="head" aria-hidden="true">Si faltan (horas) o más</span>
			<span class="head" aria-hidden="true">Se guarda (horas)</span>
			{#each rows as r, i (i)}
				<input
					type="number"
					name="tier_over_{i}"
					min="0"
					max={data.limits.maxOverHours}
					value={r.over}
					inputmode="numeric"
					aria-label="Tramo {i + 1}: si faltan (horas) o más"
				/>
				<input
					type="number"
					name="tier_hold_{i}"
					min="1"
					max={data.limits.maxHoldHours}
					value={r.hold}
					inputmode="numeric"
					aria-label="Tramo {i + 1}: se guarda (horas)"
				/>
			{/each}
		</div>
		<small class="kv-note"
			>Para sacar un tramo, vacialo. Hasta {data.limits.maxTiers} tramos; una reserva dura de 1 a {data
				.limits.maxHoldHours} horas. Cada evento puede tener los suyos (Editar → Entradas → Lista de espera
			→ Avanzado).</small
		>
	</Card>

	<div class="kv-row">
		<button class="kv-btn" type="submit">Guardar</button>
		{#if !data.isDefault}
			<button class="kv-btn ghost" type="submit" name="defaults" value="1"
				>Volver a los de por defecto</button
			>
		{/if}
	</div>
</form>

<style>
	.settings {
		max-width: 48rem;
	}
	.plain {
		border: 0;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 0.4em;
	}
	.tiers {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 12rem));
		gap: 0.4em 0.8em;
		align-items: center;
	}
	.head {
		font-size: 0.9em;
		font-weight: 700;
	}
	.tiers input {
		min-width: 0;
	}
</style>
