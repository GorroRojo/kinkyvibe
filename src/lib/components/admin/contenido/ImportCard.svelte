<script>
	/**
	 * Una categoría de Contenido → En la base: cuántos .md coinciden con la base, el botón que
	 * importa de a tandas (sigue solo hasta terminar) y la lista para revisar.
	 */
	import { deserialize, enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import Card from '$lib/components/admin/panel/Card.svelte';
	import Stat from '$lib/components/admin/panel/Stat.svelte';
	import CsvButton from '$lib/components/admin/panel/CsvButton.svelte';

	/** @type {{ key: string, title: string, one: string, many: string, status: import('$lib/server/contenido/status.js').ContentStatus, toDo: number, rows: import('$lib/server/contenido/importer.js').ImportRow[] }} */
	export let category;
	/** @type {Record<string, string>} */
	export let labels;
	/** @type {number} */
	export let chunk;

	let busy = false;
	/** @typedef {{ created: number, updated: number, errors: number, remaining: number, problems: { legacySlug: string, message: string }[] }} Progress */
	/** @type {Progress | null} */
	let progress = null;
	/** @type {string | null} */
	let failure = null;

	$: s = category.status;
	$: toDo = category.toDo;
	/** @param {number} n */
	$: noun = (/** @type {number} */ n) => (n === 1 ? category.one : category.many);

	/**
	 * Corre la importación de a tandas hasta que no quede nada (o hasta que una tanda no pueda
	 * escribir nada, para no quedar dando vueltas con un error).
	 * @type {import('@sveltejs/kit').SubmitFunction}
	 */
	const runAll = ({ cancel, action, formData }) => {
		cancel();
		busy = true;
		failure = null;
		progress = { created: 0, updated: 0, errors: 0, remaining: toDo, problems: [] };
		(async () => {
			try {
				for (;;) {
					const body = new FormData();
					body.set('categoria', String(formData.get('categoria') ?? ''));
					const res = await fetch(action, {
						method: 'POST',
						body,
						headers: { 'x-sveltekit-action': 'true' }
					});
					const result = deserialize(await res.text());
					const out = result.type === 'success' ? /** @type {any} */ (result.data) : null;
					if (!out?.importResult) {
						failure = 'No se pudo importar. Probá de nuevo en un rato.';
						break;
					}
					const ir = out.importResult;
					/** @type {Progress} */
					const p = progress ?? { created: 0, updated: 0, errors: 0, remaining: 0, problems: [] };
					progress = {
						created: p.created + ir.summary.created,
						updated: p.updated + ir.summary.updated,
						errors: p.errors + ir.summary.error,
						remaining: ir.remaining,
						problems: [...p.problems, ...ir.problems]
					};
					if (!ir.remaining || ir.summary.created + ir.summary.updated === 0) break;
				}
			} catch {
				failure = 'Se cortó la conexión. Lo importado quedó guardado: podés seguir.';
			} finally {
				busy = false;
				await invalidateAll();
			}
		})();
	};
</script>

<Card title={category.title}>
	<svelte:fragment slot="actions">
		<CsvButton href="/admin/contenido/base/importacion.csv?categoria={category.key}" />
	</svelte:fragment>
	<div class="kv-stats">
		<Stat label="Archivos .md" value={s.files} />
		<Stat label="En la base" value={s.imported} sub="importados de un .md" />
		<Stat label="Coinciden" value={s.same} sub="mismos datos que su .md" />
		<Stat label="Para importar" value={s.pending} sub="nuevos o con el .md cambiado" />
	</div>
	<div class="kv-stats">
		<Stat label="Editados en el panel" value={s.edited} sub="la importación no los pisa" />
		<Stat label="Borrados en el panel" value={s.deleted} />
		<Stat label="No se pueden importar" value={s.problems} sub="siguen saliendo del .md" />
		<Stat label="Solo en la base" value={s.onlyInDb} sub="creados en el panel" />
	</div>
	{#if s.drift}
		<p class="kv-flash warn">
			{s.drift}
			{noun(s.drift)}
			{s.drift === 1 ? 'importado no coincide' : 'importados no coinciden'} con lo que daría importar
			su .md hoy (cambió cómo se leen los .md). Están en «Para revisar», con los campos distintos.
		</p>
	{/if}
	<p class="kv-note">
		Se puede correr las veces que haga falta: lo que no cambió no se toca, y lo que se editó o borró
		en el panel tampoco. Va de a {chunk} por vez y sigue sola hasta terminar.
	</p>
	{#if progress}
		<p class="kv-flash" role="status">
			{busy ? 'Importando…' : 'Listo:'}
			{progress.created} nuevos, {progress.updated} actualizados{progress.errors
				? `, ${progress.errors} con error`
				: ''}{busy && progress.remaining ? ` (faltan ${progress.remaining})` : ''}.
		</p>
		{#if progress.problems.length}
			<ul class="problems">
				{#each progress.problems as p (p.legacySlug)}
					<li><code>{p.legacySlug}</code>: {p.message}</li>
				{/each}
			</ul>
		{/if}
	{/if}
	{#if failure}<p class="kv-flash bad" role="alert">{failure}</p>{/if}
	<form method="POST" action="?/importar" use:enhance={runAll}>
		<input type="hidden" name="categoria" value={category.key} />
		<button class="kv-btn" type="submit" disabled={busy || toDo === 0}>
			{busy ? 'Importando…' : toDo ? `Importar ${toDo} ${noun(toDo)}` : 'Nada para importar'}
		</button>
	</form>

	<h3 class="kv-subtitle">Para revisar</h3>
	{#if !category.rows.length}
		<p class="kv-note">Todo coincide: no hay nada para revisar.</p>
	{:else}
		<div class="kv-table-wrap">
			<table class="kv-table">
				<thead>
					<tr>
						<th>Archivo</th>
						<th>Qué pasa</th>
						<th>Detalle</th>
					</tr>
				</thead>
				<tbody>
					{#each category.rows as r (r.legacySlug)}
						<tr>
							<td>
								<strong>{r.title}</strong>
								<small class="muted block">{r.legacySlug}.md</small>
							</td>
							<td>{labels[r.action] ?? r.action}</td>
							<td class="small">
								{#if r.message}<span class="kv-error">{r.message}</span>{/if}
								{#if r.changed.length}<span class="block"
										>Campos distintos: {r.changed.join(', ')}</span
									>{/if}
								{#if r.warnings.length}<span class="muted block">{r.warnings.join(' · ')}</span
									>{/if}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</Card>

<style>
	.problems {
		margin: 0;
		padding-left: var(--space-s);
		font-size: var(--text-xs);
	}
	.block {
		display: block;
	}
	.small {
		font-size: var(--text-xs);
	}
	.muted {
		color: var(--kv-muted, #666);
	}
	h3 {
		margin: 1rem 0 0.5rem;
		font-size: var(--text-sm);
	}
</style>
