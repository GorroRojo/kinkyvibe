<script>
	/**
	 * Contenido → En la base: importar los eventos a la base y ver si coinciden con sus .md.
	 */
	import '$lib/admin/panel-forms.scss';
	import { deserialize, enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import PageHeader from '$lib/components/admin/panel/PageHeader.svelte';
	import Card from '$lib/components/admin/panel/Card.svelte';
	import Stat from '$lib/components/admin/panel/Stat.svelte';
	import CsvButton from '$lib/components/admin/panel/CsvButton.svelte';

	export let data;

	let busy = false;
	/** @typedef {{ created: number, updated: number, errors: number, remaining: number, problems: { legacySlug: string, message: string }[] }} Progress */
	/** @type {Progress | null} */
	let progress = null;
	/** @type {string | null} */
	let failure = null;

	$: s = data.status;
	$: toDo = data.summary.created + data.summary.updated;

	/**
	 * Corre la importación de a tandas hasta que no quede nada (o hasta que una tanda no pueda
	 * escribir nada, para no quedar dando vueltas con un error).
	 * @type {import('@sveltejs/kit').SubmitFunction}
	 */
	const runAll = ({ cancel, action }) => {
		cancel();
		busy = true;
		failure = null;
		progress = { created: 0, updated: 0, errors: 0, remaining: toDo, problems: [] };
		(async () => {
			try {
				for (;;) {
					const res = await fetch(action, {
						method: 'POST',
						body: new FormData(),
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

<PageHeader
	title="Contenido en la base"
	subtitle="Los eventos (.md de calendario) pasan a la base, con la misma dirección y su historial."
/>

<div class="kv-stack">
	{#if !data.flagOn}
		<p class="kv-flash warn">
			El interruptor «Contenido desde la base» está apagado: importar no cambia nada del sitio
			todavía. Cuando todo coincida, prendelo en Ajustes → Interruptores.
		</p>
	{:else}
		<p class="kv-flash">
			El interruptor «Contenido desde la base» está prendido: el sitio muestra los eventos de la
			base. Los que no están en la base siguen saliendo de su .md.
		</p>
	{/if}

	<Card title="Eventos">
		<svelte:fragment slot="actions">
			<CsvButton href="/admin/contenido/base/importacion.csv" />
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
				{s.drift === 1 ? 'evento importado no coincide' : 'eventos importados no coinciden'} con lo que
				daría importar su .md hoy (cambió cómo se leen los .md). Están abajo, con los campos distintos.
			</p>
		{/if}
		<p class="kv-note">
			Se puede correr las veces que haga falta: lo que no cambió no se toca, y lo que se editó o
			borró en el panel tampoco. Va de a {data.chunk} eventos por vez y sigue sola hasta terminar. Las
			imágenes siguen en el repo. Los .md quedan hasta que confirmes que todo coincide.
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
			<button class="kv-btn" type="submit" disabled={busy || toDo === 0}>
				{busy
					? 'Importando…'
					: toDo
						? `Importar ${toDo} ${toDo === 1 ? 'evento' : 'eventos'}`
						: 'Nada para importar'}
			</button>
		</form>
	</Card>

	<Card title="Para revisar">
		{#if !data.rows.length}
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
						{#each data.rows as r (r.legacySlug)}
							<tr>
								<td>
									<strong>{r.title}</strong>
									<small class="muted block">{r.legacySlug}.md</small>
								</td>
								<td>{/** @type {Record<string, string>} */ (data.labels)[r.action] ?? r.action}</td>
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
</div>

<style>
	.problems {
		margin: 0;
		padding-left: 1.2rem;
		font-size: 0.85rem;
	}
	.block {
		display: block;
	}
	.small {
		font-size: 0.85rem;
	}
	.muted {
		color: var(--kv-muted, #666);
	}
</style>
