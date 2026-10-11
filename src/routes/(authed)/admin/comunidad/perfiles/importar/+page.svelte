<script>
	/**
	 * Revisar la clasificación de los perfiles que vinieron de las fichas .md (persona, proyecto o
	 * lugar).
	 */
	import '$lib/admin/panel-forms.scss';
	import { enhance } from '$app/forms';
	import { fmtDateTime } from '$lib/admin/format.js';
	import PageHeader from '$lib/components/admin/panel/PageHeader.svelte';
	import Card from '$lib/components/admin/panel/Card.svelte';
	import Badge from '$lib/components/admin/panel/Badge.svelte';
	import CsvButton from '$lib/components/admin/panel/CsvButton.svelte';

	export let data;
	export let form;

	$: pending = data.rows.filter((r) => !r.confirmedAt && !r.deleted).length;
</script>

<PageHeader
	title="Clasificar perfiles"
	subtitle="Los perfiles que vinieron de las fichas de amigues: persona, proyecto o lugar."
	back={{ href: '/admin/comunidad/perfiles', label: 'Perfiles' }}
/>

<div class="kv-stack">
	<Card title="Clasificación (a confirmar)">
		<svelte:fragment slot="actions">
			<CsvButton href="/admin/comunidad/perfiles/clasificacion.csv" />
		</svelte:fragment>
		<p class="kv-note">
			Cada ficha quedó como persona, proyecto o lugar según algunas señales (cómo se presenta, si la
			firman varias personas, sus pronombres…). Confirmá o cambiá cada una.
			{#if data.rows.length}Faltan {pending}.{/if}
		</p>
		{#if form?.confirm}
			<p class="kv-flash" class:bad={!form.confirm.ok} role="status">{form.confirm.message}</p>
		{/if}
		{#if !data.rows.length}
			<p class="kv-note">No hay perfiles que hayan venido de las fichas.</p>
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
									<a href="/admin/comunidad/perfiles/{r.legacySlug}"><strong>{r.title}</strong></a>
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
	.muted {
		color: var(--muted);
	}
	.block {
		display: block;
	}
	.small {
		font-size: var(--text-sm);
	}
	.done {
		opacity: 0.75;
	}
	select {
		border-radius: 2em;
		padding: 0.3em 0.6em;
	}
</style>
