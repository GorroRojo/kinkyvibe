<script>
	/**
	 * «Borrados que podés recuperar» (Actividad): publicaciones borradas desde el panel que
	 * todavía no se deshicieron, cada una con «Recuperar» (POST `?/recuperar` con su `id`).
	 * Props: `rows` (listRecoverable de deletions.js), `result` (lo que devolvió la acción).
	 */
	import '$lib/admin/panel-forms.scss';
	import { enhance } from '$app/forms';
	import { RotateCcw } from '@lucide/svelte';
	import { csvFilename } from '$lib/admin/csv.js';
	import { undoneMessage } from '$lib/admin/deleteText.js';
	import Card from './Card.svelte';
	import CsvButton from './CsvButton.svelte';
	import UndoToast from './UndoToast.svelte';
	import PublishStatus from '../PublishStatus.svelte';

	/** @type {Array<{ id: number, kind: string, slug: string, title: string, deletedAt: number, deletedBy: string, mediaCount: number, prNumber: number | null }>} */
	export let rows = [];
	/** @type {any} */
	export let result = null;

	/** @type {number | null} */
	let busy = null;

	const KIND = /** @type {Record<string, string>} */ ({
		calendario: 'Evento',
		material: 'Material',
		amigues: 'Amigues'
	});
	const whenFmt = new Intl.DateTimeFormat('es-AR', {
		timeZone: 'America/Argentina/Buenos_Aires',
		day: 'numeric',
		month: 'short',
		hour: '2-digit',
		minute: '2-digit'
	});
</script>

{#if rows.length || result?.undone || result?.error}<div class="recover">
		{#if result?.undone}
			<UndoToast canUndo={false} message={undoneMessage(result.undone)} />
			{#if result.undone.publish}<PublishStatus pr={result.undone.publish} />{/if}
		{:else if result?.error}
			<p class="kv-flash bad" role="alert">{result.error}</p>
		{/if}

		{#if rows.length}
			<Card title="Borrados que podés recuperar">
				<svelte:fragment slot="actions">
					<CsvButton
						{rows}
						columns={[
							{ key: 'kind', label: 'tipo' },
							{ key: 'slug', label: 'slug' },
							{ key: 'title', label: 'titulo' },
							{ label: 'borrado', value: (r) => new Date(r.deletedAt) },
							{ key: 'deletedBy', label: 'por' }
						]}
						filename={csvFilename('borrados-recuperables')}
					/>
				</svelte:fragment>
				<ul class="list">
					{#each rows as r (r.id)}
						<li>
							<div class="what">
								<b>{r.title}</b>
								<small class="muted"
									>{KIND[r.kind] ?? r.kind} · <code>{r.slug}</code> · {whenFmt.format(r.deletedAt)} por
									@{r.deletedBy}{r.mediaCount
										? ` · ${r.mediaCount} ${r.mediaCount === 1 ? 'imagen' : 'imágenes'}`
										: ''}</small
								>
							</div>
							<form
								method="POST"
								action="?/recuperar"
								use:enhance={() => {
									busy = r.id;
									return async ({ update }) => {
										await update();
										busy = null;
									};
								}}
							>
								<input type="hidden" name="id" value={r.id} />
								<button class="kv-btn ghost small" disabled={busy !== null}
									><RotateCcw size={16} aria-hidden="true" />
									{busy === r.id ? 'Recuperando…' : 'Recuperar'}</button
								>
							</form>
						</li>
					{/each}
				</ul>
			</Card>
		{/if}
	</div>{/if}

<style>
	.recover {
		display: flex;
		flex-direction: column;
		gap: 0.7rem;
		margin-bottom: 1rem;
	}
	.list {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	li {
		display: flex;
		align-items: center;
		justify-content: space-between;
		flex-wrap: wrap;
		gap: 0.5rem 1rem;
		padding: 0.6rem 0;
		border-bottom: 1px solid var(--line);
	}
	li:last-child {
		border-bottom: 0;
	}
	.what {
		display: flex;
		flex-direction: column;
		min-width: 0;
		overflow-wrap: anywhere;
	}
</style>
