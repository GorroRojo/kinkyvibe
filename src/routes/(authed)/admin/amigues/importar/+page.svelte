<script>
	/**
	 * Importar las fichas de amigues a la base y revisar su clasificación (persona, grupo o lugar).
	 */
	import '$lib/admin/panel-forms.scss';
	import { enhance } from '$app/forms';
	import { fmtDateTime } from '$lib/admin/format.js';
	import PageHeader from '$lib/components/admin/panel/PageHeader.svelte';
	import Card from '$lib/components/admin/panel/Card.svelte';
	import Stat from '$lib/components/admin/panel/Stat.svelte';
	import Badge from '$lib/components/admin/panel/Badge.svelte';
	import CsvButton from '$lib/components/admin/panel/CsvButton.svelte';

	export let data;
	export let form;

	/** @type {Record<string, string>} */
	const ACTIONS = {
		created: 'se crea',
		updated: 'se actualiza',
		unchanged: 'sin cambios',
		skipped_edited: 'editada en el panel: no se pisa',
		skipped_deleted: 'borrada en el panel: no se revive',
		error: 'error'
	};
	let busy = false;
	$: pending = data.rows.filter((r) => !r.confirmedAt && !r.deleted).length;
</script>

<PageHeader
	title="Importar y clasificar"
	subtitle="Las fichas .md de amigues pasan a perfiles en la base, con la misma dirección."
	back={{ href: '/admin/amigues', label: 'Amigues' }}
/>

<div class="kv-stack">
	{#if !data.flagOn}
		<p class="kv-flash warn">
			El interruptor «Perfiles públicos» está apagado: importar no cambia nada del sitio todavía.
			Revisá la lista y prendelo en Ajustes → Interruptores cuando esté todo bien.
		</p>
	{/if}

	<Card title="Importar">
		<div class="kv-stats">
			<Stat label="Nuevas" value={data.summary.created} />
			<Stat label="A actualizar" value={data.summary.updated} />
			<Stat label="Sin cambios" value={data.summary.unchanged} />
			<Stat
				label="No se tocan"
				value={data.summary.skipped_edited + data.summary.skipped_deleted}
				sub="editadas o borradas en el panel"
			/>
		</div>
		<p class="kv-note">
			Se puede correr las veces que haga falta: lo que no cambió no se toca, y lo que se editó o
			borró en el panel tampoco. Los .md quedan en el repo hasta que confirmes que todo coincide.
		</p>
		{#if form?.importResult}
			{@const r = form.importResult}
			<p class="kv-flash" role="status">
				Listo: {r.summary.created} nuevas, {r.summary.updated} actualizadas, {r.summary.unchanged}
				sin cambios{r.summary.error ? `, ${r.summary.error} con error` : ''}.
			</p>
			{#if r.problems.length}
				<ul class="problems">
					{#each r.problems as p (p.legacySlug)}
						<li><code>{p.legacySlug}</code>: {ACTIONS[p.action] ?? p.action} {p.message}</li>
					{/each}
				</ul>
			{/if}
		{/if}
		<form
			method="POST"
			action="?/importar"
			use:enhance={() => {
				busy = true;
				return async ({ update }) => {
					await update();
					busy = false;
				};
			}}
		>
			<button class="kv-btn" type="submit" disabled={busy}
				>{busy ? 'Importando…' : 'Importar las fichas'}</button
			>
		</form>
		<details>
			<summary>Qué va a pasar con cada ficha</summary>
			<ul class="preview">
				{#each data.preview as p (p.legacySlug)}
					<li>
						<code>{p.legacySlug}</code>
						{p.title} · {data.kinds[p.kind]} · <strong>{ACTIONS[p.action] ?? p.action}</strong>
						{#if p.warnings.length}<small class="muted">({p.warnings.join('; ')})</small>{/if}
						{#if p.message}<small class="kv-error">{p.message}</small>{/if}
					</li>
				{/each}
			</ul>
		</details>
	</Card>

	<Card title="Clasificación (a confirmar)">
		<svelte:fragment slot="actions">
			<CsvButton href="/admin/amigues/clasificacion.csv" />
		</svelte:fragment>
		<p class="kv-note">
			Cada ficha quedó como persona, grupo o lugar según algunas señales (cómo se presenta, si la
			firman varias personas, sus pronombres…). Confirmá o cambiá cada una.
			{#if data.rows.length}Faltan {pending}.{/if}
		</p>
		{#if form?.confirm}
			<p class="kv-flash" class:bad={!form.confirm.ok} role="status">{form.confirm.message}</p>
		{/if}
		{#if !data.rows.length}
			<p class="kv-note">Todavía no se importó nada.</p>
		{:else}
			<div class="kv-table-wrap">
				<table class="kv-table">
					<thead>
						<tr>
							<th>Ficha</th>
							<th>Por qué</th>
							<th>Tipo</th>
						</tr>
					</thead>
					<tbody>
						{#each data.rows as r (r.profileId)}
							<tr class:done={r.confirmedAt}>
								<td>
									<a href="/admin/amigues/{r.legacySlug}"><strong>{r.title}</strong></a>
									<small class="muted block">/amigues/{r.legacySlug}</small>
									{#if r.deleted}<Badge tone="bad">borrada</Badge>{/if}
								</td>
								<td class="small">{r.reason}</td>
								<td>
									{#if r.confirmedAt}
										{data.kinds[r.kind]}
										<small class="muted block"
											>confirmó @{r.confirmedBy}, {fmtDateTime(r.confirmedAt)}</small
										>
									{:else if !r.deleted}
										<form method="POST" action="?/confirmar" use:enhance class="kv-row">
											<input type="hidden" name="profile" value={r.profileId} />
											<input type="hidden" name="version" value={r.version} />
											<select name="kind" value={r.kind} aria-label="Tipo de {r.title}">
												{#each Object.entries(data.kinds) as [value, label] (value)}
													<option {value}>{label}</option>
												{/each}
											</select>
											<button class="kv-btn small" type="submit">Confirmar</button>
										</form>
									{/if}
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	</Card>
</div>

<style>
	.problems,
	.preview {
		margin: 0.5rem 0 0;
		padding-left: 1.2rem;
		font-size: 0.9rem;
	}
	.muted {
		color: var(--muted);
	}
	.block {
		display: block;
	}
	.small {
		font-size: 0.88rem;
	}
	.done {
		opacity: 0.75;
	}
	details summary {
		cursor: pointer;
		margin-top: 0.8rem;
	}
	select {
		border-radius: 2em;
		padding: 0.3em 0.6em;
	}
</style>
