<script>
	import { enhance } from '$app/forms';
	import Card from '$lib/components/admin/panel/Card.svelte';
	import Badge from '$lib/components/admin/panel/Badge.svelte';
	import CsvButton from '$lib/components/admin/panel/CsvButton.svelte';
	import EmptyState from '$lib/components/admin/panel/EmptyState.svelte';
	import { shortTime } from '$lib/admin/orderFormat.js';
	import { formatARS } from '$lib/utils/money.js';

	/** @type {import('./$types').PageData} */
	export let data;
	/** @type {import('./$types').ActionData} */
	export let form;

	$: e = data.event;
	let kind = 'percent';
	/** @type {Record<string, string>} */
	$: values = form?.create && 'values' in form.create ? form.create.values : {};
	/** @type {Record<string, string>} */
	$: errors = form?.create && 'errors' in form.create ? form.create.errors : {};

	/** @typedef {(typeof data.codes)[number]} Code */
	/** @param {Code} c */
	function codeState(c) {
		if (!c.active) return 'Inactivo';
		if (c.ends_at !== null && data.now >= c.ends_at) return 'Vencido';
		if (c.starts_at !== null && data.now < c.starts_at) return 'Todavía no empieza';
		if (c.max_uses !== null && c.approved + c.held >= c.max_uses) return 'Sin usos disponibles';
		return 'Activo';
	}
	/** @param {Code} c */
	const discount = (c) => (c.kind === 'percent' ? `${c.value} %` : formatARS(c.value));

	/** @type {import('$lib/admin/csv.js').CsvColumn<Code>[]} */
	const columns = [
		{ label: 'código', key: 'code' },
		{ label: 'descuento', value: discount },
		{ label: 'estado', value: codeState },
		{ label: 'aprobados', key: 'approved' },
		{ label: 'en reserva', key: 'held' },
		{ label: 'máximo', value: (c) => c.max_uses ?? '' },
		{ label: 'descontado', key: 'discounted' },
		{ label: 'creado por', key: 'created_by' }
	];
</script>

<svelte:head><title>Códigos · {e.title} · Panel</title></svelte:head>

{#if !data.dbAvailable}
	<p class="flash error">No hay base de datos disponible.</p>
{/if}
{#if form?.toggle}
	<p class="flash" class:error={!form.toggle.ok} role="status">{form.toggle.message}</p>
{/if}

<div class="grid">
	<Card title="Códigos de este evento">
		<svelte:fragment slot="actions">
			<CsvButton rows={data.codes} {columns} filename="codigos-{e.slug}.csv" />
		</svelte:fragment>
		{#if data.codes.length === 0}
			<EmptyState
				emoji="🏷️"
				title="Este evento no tiene códigos propios"
				text="Creá uno acá al lado."
			/>
		{:else}
			<div class="kv-table-wrap">
				<table class="kv-table">
					<thead>
						<tr><th>Código</th><th>Descuento</th><th class="r">Usos</th><th>Estado</th><th></th></tr
						>
					</thead>
					<tbody>
						{#each data.codes as c (c.code)}
							<tr>
								<td>
									<strong>{c.code}</strong>
									<small class="muted block"
										>{shortTime(c.created_at)} · {c.created_by}{#if c.ends_at}
											· hasta {shortTime(c.ends_at)}{/if}</small
									>
								</td>
								<td>{discount(c)}</td>
								<td class="r num"
									>{c.approved}{#if c.held}+{c.held}{/if}{c.max_uses !== null
										? ` / ${c.max_uses}`
										: ''}</td
								>
								<td>
									<Badge tone={codeState(c) === 'Activo' ? 'ok' : 'neutral'}>{codeState(c)}</Badge>
								</td>
								<td class="r">
									<form method="POST" action="?/toggle" use:enhance>
										<input type="hidden" name="code" value={c.code} />
										<input type="hidden" name="active" value={c.active ? '0' : '1'} />
										<button type="submit" class="kv-btn ghost small">
											{c.active ? 'Desactivar' : 'Activar'}
										</button>
									</form>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
		{#if data.global.length}
			<p class="muted small">
				También valen acá los códigos para todos los eventos:
				{data.global
					.map((c) => `${c.code} (${discount(c)}, ${codeState(c).toLowerCase()})`)
					.join(', ')}. Se manejan en <a href="/admin/entradas/codigos">Entradas → Códigos</a>.
			</p>
		{/if}
	</Card>

	<Card title="Nuevo código para este evento">
		{#if form?.create && 'ok' in form.create}
			<p class="flash" role="status">{form.create.message}</p>
		{:else if form?.create && 'error' in form.create}
			<p class="flash error" role="alert">{form.create.error}</p>
		{/if}
		<form method="POST" action="?/create" use:enhance class="new">
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
				{#if kind === 'percent'}<small>100 = entrada sin cargo.</small>{/if}
				{#if errors.value}<small class="error">{errors.value}</small>{/if}
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
				<small>Un uso es una compra (no una entrada). Vacío: sin límite.</small>
				{#if errors.max_uses}<small class="error">{errors.max_uses}</small>{/if}
			</label>
			<button type="submit" class="kv-btn">Crear código</button>
		</form>
	</Card>
</div>

<style>
	.grid {
		display: grid;
		gap: 1rem;
		grid-template-columns: repeat(auto-fit, minmax(min(100%, 24rem), 1fr));
		align-items: start;
	}
	.flash {
		background: var(--ok-bg);
		padding: 0.6rem 0.9rem;
		border-radius: 0.8rem;
		margin: 0 0 1rem;
	}
	.flash.error {
		background: var(--bad-bg);
	}
	.small {
		font-size: 0.85rem;
		margin: 0;
	}
	.block {
		display: block;
	}
	button.small {
		padding: 0.25rem 0.7rem;
		font-size: 0.82rem;
	}
	.new {
		display: flex;
		flex-direction: column;
		gap: 0.8rem;
	}
	.field {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
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
	.field input:not([type='radio']) {
		padding: 0.55rem 0.8rem;
		min-height: 2.75rem;
		box-sizing: border-box;
		border-radius: 0.8rem;
		border: 1px solid var(--line);
		background: var(--surface);
		min-width: 0;
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
	.row {
		display: grid;
		gap: 0.8rem;
		grid-template-columns: repeat(auto-fit, minmax(min(100%, 12rem), 1fr));
	}
	.new .kv-btn {
		align-self: flex-start;
	}
</style>
