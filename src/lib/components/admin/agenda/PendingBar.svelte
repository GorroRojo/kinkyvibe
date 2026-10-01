<script>
	/**
	 * Barra fija abajo con los eventos movidos en el calendario que todavía no se guardaron:
	 * "N cambios sin guardar · Guardar cambios · Descartar", y abajo los que no se pudieron guardar
	 * (con el motivo).
	 * "Guardar cambios" no guarda enseguida: primero muestra la lista de lo que se va a mover
	 * (`summary`, ver `pendingMovesSummary`) con Confirmar / Volver, y recién Confirmar guarda.
	 * Props: `count`, `saving`, `problems` ({ slug, title, message }[]), `summary`, `confirming`
	 * (bind: se está mostrando la confirmación). Eventos: `save` (confirmaron), `discard`,
	 * `open` (slug: tocaron el nombre de un evento con problema), `dismiss` (cerrar los problemas
	 * cuando ya no queda nada pendiente).
	 */
	import { createEventDispatcher } from 'svelte';
	import { ArrowLeft, Check, CircleAlert, Save, X } from '@lucide/svelte';

	export let count = 0;
	export let saving = false;
	/** @type {Array<{ slug: string, title: string, message: string }>} */
	export let problems = [];
	export let summary = '';
	export let confirming = false;

	const dispatch = createEventDispatcher();

	// Sin pendientes (o guardando) no hay nada que confirmar.
	$: if (confirming && (!count || saving)) confirming = false;

	/** @param {HTMLElement} el */
	function focusOnMount(el) {
		el.focus();
	}

	function confirmSave() {
		confirming = false;
		dispatch('save');
	}
</script>

<section class="pending-bar" aria-label="Cambios sin guardar">
	{#if problems.length}
		<ul class="problems" role="alert">
			{#each problems as p (p.slug)}
				<li>
					<CircleAlert size={15} aria-hidden="true" />
					<span
						><button class="link" type="button" on:click={() => dispatch('open', p.slug)}
							>«{p.title}»</button
						>: {p.message}</span
					>
				</li>
			{/each}
		</ul>
	{/if}
	<div class="row">
		{#if count && confirming}
			<p class="summary" role="status">{summary}</p>
			<div class="btns">
				<button class="kv-btn ghost" type="button" on:click={() => (confirming = false)}
					><ArrowLeft size={16} aria-hidden="true" /> Volver</button
				>
				<button class="kv-btn" type="button" use:focusOnMount on:click={confirmSave}
					><Check size={16} aria-hidden="true" /> Confirmar</button
				>
			</div>
		{:else if count}
			<p class="count" role="status">
				<span class="dot" aria-hidden="true"></span>
				<b>{count}</b>
				{count === 1 ? 'cambio sin guardar' : 'cambios sin guardar'}
			</p>
			<div class="btns">
				<button
					class="kv-btn ghost"
					type="button"
					on:click={() => dispatch('discard')}
					disabled={saving}><X size={16} aria-hidden="true" /> Descartar</button
				>
				<button class="kv-btn" type="button" on:click={() => (confirming = true)} disabled={saving}
					><Save size={16} aria-hidden="true" />
					{saving ? 'Guardando…' : 'Guardar cambios'}</button
				>
			</div>
		{:else}
			<p class="count">No quedan cambios sin guardar.</p>
			<div class="btns">
				<button class="kv-btn ghost" type="button" on:click={() => dispatch('dismiss')}
					><X size={16} aria-hidden="true" /> Cerrar</button
				>
			</div>
		{/if}
	</div>
</section>

<style>
	.pending-bar {
		position: sticky;
		/* En el celu, arriba de la barra de navegación de abajo (como los avisos flotantes). */
		bottom: calc(env(safe-area-inset-bottom, 0px) + 5rem);
		z-index: 5;
		margin-top: 1rem;
		background: var(--surface);
		color: var(--text);
		border: 2px dashed var(--warn);
		border-radius: var(--card-round);
		box-shadow: var(--shadow);
		padding: 0.6rem 0.8rem;
	}
	@media (min-width: 900px) {
		.pending-bar {
			bottom: 0.75rem;
		}
	}
	.row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem 1rem;
	}
	.count {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		margin: 0;
	}
	.summary {
		margin: 0;
		flex: 1 1 20rem;
		overflow-wrap: anywhere;
	}
	.dot {
		width: 0.65rem;
		height: 0.65rem;
		border-radius: 50%;
		background: var(--warn);
		flex: none;
	}
	.btns {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		margin-left: auto;
	}
	.problems {
		list-style: none;
		margin: 0 0 0.5rem;
		padding: 0 0 0.5rem;
		border-bottom: 1px solid var(--line);
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
		font-size: 0.88rem;
		max-height: 30vh;
		overflow-y: auto;
	}
	.problems li {
		display: flex;
		gap: 0.4rem;
		align-items: flex-start;
		color: var(--bad);
	}
	.problems li :global(svg) {
		flex: none;
		margin-top: 0.15rem;
	}
	.problems span {
		color: var(--text);
		overflow-wrap: anywhere;
	}
	.link {
		border: 0;
		background: none;
		padding: 0;
		font: inherit;
		font-weight: 700;
		color: var(--link);
		cursor: pointer;
		text-decoration: underline;
	}
</style>
