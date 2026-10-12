<script>
	/**
	 * Tarjeta «Combo con otro evento» de la pestaña Códigos de la ficha (interruptor
	 * `combo_codigos`, docs/tickets.md «Códigos combo»): los combos de este evento con sus números
	 * y el formulario para armar uno (o cambiar el de un evento que ya tiene combo).
	 */
	import { enhance } from '$app/forms';
	import { Badge, Card } from '$lib/components/ui';
	import { shortTime } from '$lib/admin/orderFormat.js';

	/** El evento de la ficha (A). */
	export let eventTitle = '';
	/** @type {import('$lib/server/tickets/combos.js').ComboRow[]} */
	export let combos = [];
	/** Los eventos que se pueden elegir (otros, con la venta abierta o por abrir). */
	/** @type {{ slug: string, title: string }[]} */
	export let targets = [];
	/**
	 * Lo que devolvió la última action (`comboSave` / `comboToggle`).
	 * @type {{ ok?: boolean, message?: string, error?: string, errors?: Record<string, string>,
	 *   values?: Record<string, string> } | null | undefined}
	 */
	export let result = null;
	/** @type {{ ok: boolean, message: string } | null | undefined} */
	export let toggleResult = null;

	$: values = result?.values ?? {};
	$: errors = result?.errors ?? {};
	let kind = 'percent';
	$: if (values.kind === 'percent' || values.kind === 'fixed') kind = values.kind;

	/**
	 * Al guardar bien, el formulario se vacía (`update` lo resetea) y el reset deja los radios sin
	 * elegir: vuelve a «Porcentaje», como al entrar.
	 * @type {import('@sveltejs/kit').SubmitFunction}
	 */
	const afterSave =
		() =>
		async ({ update, result }) => {
			await update();
			if (result.type === 'success') kind = 'percent';
		};
</script>

<Card title="Combo con otro evento">
	<p class="intro">
		Quien compre una entrada online de <strong>{eventTitle}</strong> recibe en el mail de sus entradas
		un código de descuento para el otro evento: de un solo uso y solo para su email. Si la compra se reembolsa,
		el código deja de valer. Las ventas en la puerta y las cargadas a mano no generan códigos.
	</p>

	{#if toggleResult}
		<p class="flash" class:error={!toggleResult.ok} role="status">{toggleResult.message}</p>
	{/if}

	{#if combos.length}
		<ul class="combos">
			{#each combos as c (c.target_slug)}
				<li>
					<div class="what">
						<strong>{c.target_title}</strong>
						<span>{c.discount}</span>
						<small class="muted">
							{c.ends_at ? `Hasta ${shortTime(c.ends_at)}` : 'Hasta que cierre su venta'} ·
							{c.issued}
							{c.issued === 1 ? 'código generado' : 'códigos generados'} · {c.used}
							{c.used === 1 ? 'usado' : 'usados'}{#if c.held}
								&nbsp;(+{c.held} en reserva){/if}{#if c.revoked}
								· {c.revoked} {c.revoked === 1 ? 'anulado' : 'anulados'} por reembolso{/if}
						</small>
					</div>
					<Badge tone={c.active ? 'ok' : 'neutral'}>{c.active ? 'Prendido' : 'Apagado'}</Badge>
					<form method="POST" action="?/comboToggle" use:enhance>
						<input type="hidden" name="target_slug" value={c.target_slug} />
						<input type="hidden" name="active" value={c.active ? '0' : '1'} />
						<button type="submit" class="kv-btn ghost small">
							{c.active ? 'Apagar' : 'Prender'}
						</button>
					</form>
				</li>
			{/each}
		</ul>
		<p class="muted small">
			Apagar un combo frena los códigos nuevos; los que ya se mandaron siguen valiendo.
		</p>
	{/if}

	{#if result?.ok}
		<p class="flash" role="status">{result.message}</p>
	{:else if result?.error}
		<p class="flash error" role="alert">{result.error}</p>
	{/if}

	{#if targets.length === 0}
		<p class="muted">No hay otros eventos con la venta abierta para armar un combo.</p>
	{:else}
		<form method="POST" action="?/comboSave" use:enhance={afterSave} class="new">
			<label class="field">
				<span>Evento donde vale el código</span>
				<select name="target_slug" required value={values.target_slug ?? ''}>
					<option value="" disabled>Elegí un evento</option>
					{#each targets as t (t.slug)}
						<option value={t.slug}>{t.title}</option>
					{/each}
				</select>
				<small
					>Si ya tiene un combo, se cambia el descuento de los códigos que se generen desde ahora.</small
				>
				{#if errors.target_slug}<small class="error">{errors.target_slug}</small>{/if}
			</label>
			<fieldset class="field">
				<legend>Tipo de descuento</legend>
				<label class="radio">
					<input type="radio" name="kind" value="percent" bind:group={kind} /> Porcentaje del total
				</label>
				<label class="radio">
					<input type="radio" name="kind" value="fixed" bind:group={kind} /> Monto fijo en pesos (por
					compra)
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
				{#if errors.value}<small class="error">{errors.value}</small>{/if}
			</label>
			<label class="field">
				<span>Válido hasta (opcional)</span>
				<input name="ends_at" type="datetime-local" value={values.ends_at ?? ''} />
				<small>Vacío: hasta que cierre la venta de ese evento.</small>
				{#if errors.ends_at}<small class="error">{errors.ends_at}</small>{/if}
			</label>
			<button type="submit" class="kv-btn">Guardar combo</button>
		</form>
	{/if}
</Card>

<style>
	.intro {
		margin: 0 0 var(--space-xs);
	}
	.flash {
		background: var(--ok-bg);
		padding: var(--space-2xs) var(--space-xs);
		border-radius: var(--radius-m);
		margin: 0 0 1rem;
	}
	.flash.error {
		background: var(--error-bg);
		color: var(--error);
	}
	.small {
		font-size: var(--text-xs);
		margin: 0 0 var(--space-xs);
	}
	.combos {
		list-style: none;
		padding: 0;
		margin: 0 0 var(--space-2xs);
		display: flex;
		flex-direction: column;
		gap: var(--space-2xs);
	}
	.combos li {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2xs);
		padding: var(--space-2xs) 0;
		border-bottom: 1px solid var(--line, var(--field));
	}
	.what {
		display: flex;
		flex-direction: column;
		flex: 1 1 14rem;
		min-width: 0;
	}
	button.small {
		padding: var(--space-3xs) var(--space-2xs);
		font-size: var(--text-xs);
	}
	.new {
		display: flex;
		flex-direction: column;
		gap: var(--space-xs);
	}
	.field {
		display: flex;
		flex-direction: column;
		gap: var(--space-3xs);
		border: 0;
		padding: 0;
		margin: 0;
		min-width: 0;
	}
	.field > span,
	.field > legend {
		font-weight: 700;
		padding: 0;
	}
	.field small {
		color: var(--muted);
	}
	.field .error {
		color: var(--bad);
	}
	.field input:not([type='radio']),
	.field select {
		padding: var(--space-2xs) var(--space-xs);
		min-height: 2.75rem;
		box-sizing: border-box;
		border-radius: 3em;
		border: 1px solid var(--field);
		background: var(--surface);
		min-width: 0;
		max-width: 100%;
	}
	.radio {
		display: flex;
		gap: 0.4rem;
		align-items: center;
		min-height: 2rem;
	}
	.radio input {
		accent-color: var(--accent);
	}
	.new .kv-btn {
		align-self: flex-start;
	}
</style>
