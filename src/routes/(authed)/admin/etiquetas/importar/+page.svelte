<script>
	/**
	 * Importar las etiquetas (archivo + textos de la wiki) a la base, por tandas.
	 */
	import '$lib/admin/panel-forms.scss';
	import { enhance } from '$app/forms';
	import PageHeader from '$lib/components/admin/panel/PageHeader.svelte';
	import Card from '$lib/components/admin/panel/Card.svelte';
	import Stat from '$lib/components/admin/panel/Stat.svelte';
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
		skipped_panel: 'ya existe (creada en el panel): no se toca',
		pending: 'queda para la próxima tanda',
		error: 'error'
	};
	/** Tandas como mucho por click (cada una hace ~120 escrituras). */
	const MAX_ROUNDS = 20;
	let busy = false;
	let rounds = 0;
	/** @type {HTMLFormElement} */
	let formEl;
	let totals = { created: 0, updated: 0, error: 0 };
	/** @type {{ key: string, action: string, message: string }[]} */
	let problems = [];
	let done = false;

	/** @type {import('$lib/admin/csv.js').CsvColumn<any>[]} */
	const csvColumns = [
		{ key: 'key', label: 'Etiqueta' },
		{ label: 'Alias', value: (p) => (p.alias ? 'sí' : '') },
		{ label: 'Qué pasa', value: (p) => ACTIONS[p.action] ?? p.action },
		{ key: 'message', label: 'Detalle' }
	];
</script>

<PageHeader
	title="Importar etiquetas"
	subtitle="El árbol de etiquetas y los textos de la Kinkipedia pasan a la base, con los mismos nombres."
	back={{ href: '/admin/etiquetas', label: 'Etiquetas' }}
>
	<svelte:fragment slot="actions">
		{#if !data.missing}
			<CsvButton rows={data.preview} columns={csvColumns} filename="etiquetas-importar.csv" />
		{/if}
	</svelte:fragment>
</PageHeader>

<div class="kv-stack">
	{#if data.missing}
		<p class="kv-flash bad">
			La base de este entorno todavía no tiene la migración 0029 (etiquetas). Hasta que se aplique,
			no se puede importar.
		</p>
	{:else}
		<p class="kv-flash warn">
			Importar no cambia nada del sitio: las páginas siguen leyendo el archivo hasta que se prenda
			el interruptor «Etiquetas desde la base» (<a href="/admin/ajustes/interruptores"
				>Ajustes → Interruptores</a
			>). Con el interruptor prendido, lo que edites en Etiquetas se guarda en la base y reimportar
			no lo pisa.
		</p>

		<Card title="Importar">
			<div class="kv-stats">
				<Stat label="Nuevas" value={data.summary.created} />
				<Stat label="A actualizar" value={data.summary.updated} />
				<Stat label="Sin cambios" value={data.summary.unchanged} />
				<Stat
					label="No se tocan"
					value={data.summary.skipped_edited +
						data.summary.skipped_deleted +
						data.summary.skipped_panel}
					sub="editadas, borradas o creadas en el panel"
				/>
			</div>
			<p class="kv-note">
				Se puede correr las veces que haga falta: lo que no cambió no se toca, y lo que se editó o
				borró en el panel tampoco. Va por tandas: la página sigue sola hasta terminar. El archivo y
				los textos de la wiki quedan en el repo.
			</p>
			{#if form?.importResult || rounds}
				<p class="kv-flash" role="status">
					{#if busy}
						Importando… tanda {rounds}: {totals.created} nuevas, {totals.updated} actualizadas.
					{:else if done}
						Listo: {totals.created} nuevas, {totals.updated} actualizadas{totals.error
							? `, ${totals.error} con error`
							: ''}.
					{:else}
						Quedó por la mitad ({form?.importResult?.pending ?? '?'} pendientes): volvé a apretar el botón
						para seguir.
					{/if}
				</p>
				{#if problems.length}
					<ul class="problems">
						{#each problems as p (p.key + p.action)}
							<li><code>{p.key}</code>: {ACTIONS[p.action] ?? p.action}. {p.message}</li>
						{/each}
					</ul>
				{/if}
			{/if}
			<form
				method="POST"
				action="?/importar"
				bind:this={formEl}
				use:enhance={() => {
					busy = true;
					rounds += 1;
					return async ({ result, update }) => {
						await update({ reset: false });
						/** @type {{ summary: Record<string, number>, pending: number, problems: { key: string, action: string, message: string }[] } | null} */
						const r =
							result.type === 'success' ? /** @type {any} */ (result.data)?.importResult : null;
						if (r) {
							totals = {
								created: totals.created + r.summary.created,
								updated: totals.updated + r.summary.updated,
								error: totals.error + r.summary.error
							};
							problems = [...problems, ...r.problems.filter((p) => p.action !== 'pending')];
							if (r.pending > 0 && rounds < MAX_ROUNDS) {
								formEl.requestSubmit();
								return;
							}
							done = r.pending === 0;
						}
						busy = false;
					};
				}}
			>
				<button
					class="kv-btn"
					type="submit"
					disabled={busy}
					on:click={() => {
						if (!busy) {
							rounds = 0;
							totals = { created: 0, updated: 0, error: 0 };
							problems = [];
							done = false;
						}
					}}>{busy ? 'Importando…' : 'Importar las etiquetas'}</button
				>
			</form>
			{#if data.warnings.length}
				<details>
					<summary>Avisos del archivo ({data.warnings.length})</summary>
					<ul class="preview">
						{#each data.warnings as w (w)}<li>{w}</li>{/each}
					</ul>
				</details>
			{/if}
			<details>
				<summary>Qué va a pasar con cada etiqueta ({data.preview.length})</summary>
				<ul class="preview">
					{#each data.preview as p (p.key)}
						<li>
							<code>{p.key}</code>
							{#if p.alias}<small class="muted">(alias)</small>{/if} ·
							<strong>{ACTIONS[p.action] ?? p.action}</strong>
							{#if p.message}<small class="kv-error">{p.message}</small>{/if}
						</li>
					{/each}
				</ul>
			</details>
		</Card>
	{/if}
</div>

<style>
	.problems,
	.preview {
		margin: 0.5rem 0 0;
		padding-left: 1.2rem;
		font-size: 0.9rem;
	}
	.preview {
		max-height: 24rem;
		overflow: auto;
	}
	small.muted {
		color: var(--kv-muted, #666);
	}
</style>
