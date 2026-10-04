<script>
	/**
	 * Carga rápida de la agenda, en una hoja: al tocar un día vacío (o «Evento»), «¿Querés duplicar
	 * un evento que ya existe?» (buscador) o «Empezar de cero» (solo el título). Las dos crean un
	 * borrador en ese día sin salir de la agenda (lo hace la página, con la action `crearBorrador`):
	 * no listado y «anunciado», para completarlo y confirmarlo después.
	 * Props: `open` (bind), `date` / `startTime` / `endTime` (bind: el día y las horas elegidos),
	 * `candidates` (para duplicar), `busy` (guardando), `error` (el último problema),
	 * `notesEnabled`. Eventos: `duplicate` { slug }, `scratch` { title }, `note` (la fecha).
	 */
	import { createEventDispatcher, tick } from 'svelte';
	import { FilePlus2, Plus, StickyNote, SquarePen } from '@lucide/svelte';
	import Sheet from '$lib/components/admin/door/Sheet.svelte';
	import DuplicateChooser from '$lib/components/admin/DuplicateChooser.svelte';
	import { newEventHref } from '$lib/utils/calendario.js';
	import { describeDate, isValidDate } from '$lib/utils/eventDraft.js';

	export let open = false;
	export let date = '';
	export let startTime = '';
	export let endTime = '';
	/** @type {import('$lib/utils/quickDraft.js').DuplicateCandidate[]} */
	export let candidates = [];
	export let busy = false;
	export let error = '';
	export let notesEnabled = false;

	const dispatch = createEventDispatcher();
	let title = '';
	let scratch = false;
	/** @type {HTMLInputElement | undefined} */
	let titleInput;

	$: if (!open) {
		title = '';
		scratch = false;
	}
	$: dayText = isValidDate(date) ? describeDate(date) : '';
	$: heading = dayText ? `Cargar un evento el ${dayText}` : 'Cargar un evento';

	async function startScratch() {
		scratch = true;
		await tick();
		titleInput?.focus();
	}
</script>

<Sheet bind:open title={heading}>
	<div class="when">
		<label>
			<span>Día</span>
			<input type="date" bind:value={date} disabled={busy} required />
		</label>
		<label>
			<span>Empieza</span>
			<input type="time" bind:value={startTime} disabled={busy} />
		</label>
		{#if startTime}
			<label>
				<span>Termina</span>
				<input type="time" bind:value={endTime} disabled={busy} />
			</label>
		{/if}
	</div>
	<small class="muted"
		>Se crea como borrador: no aparece en el calendario hasta que lo confirmes. Sin hora, usa la del
		evento que duplicás.</small
	>

	{#if error}<p class="error" role="alert">{error}</p>{/if}

	<DuplicateChooser
		pick
		{candidates}
		busy={busy || !isValidDate(date)}
		on:pick={(e) => dispatch('duplicate', { slug: e.detail.slug })}
	/>

	<div class="scratch">
		{#if !scratch}
			<button class="kv-btn ghost" type="button" disabled={busy} on:click={startScratch}
				><FilePlus2 size={16} aria-hidden="true" /> Empezar de cero</button
			>
		{:else}
			<form
				on:submit|preventDefault={() => {
					if (title.trim() && isValidDate(date)) dispatch('scratch', { title: title.trim() });
				}}
			>
				<label for="kv-quick-title">Empezar de cero: título</label>
				<div class="row">
					<input
						id="kv-quick-title"
						bind:this={titleInput}
						bind:value={title}
						maxlength="200"
						autocomplete="off"
						disabled={busy}
						placeholder="Nombre del evento"
					/>
					<button class="kv-btn" disabled={busy || !title.trim() || !isValidDate(date)}
						><Plus size={16} aria-hidden="true" /> Crear borrador</button
					>
				</div>
			</form>
		{/if}
	</div>

	<div class="more">
		<a class="kv-btn ghost small" href={newEventHref({ date, startTime, endTime })}
			><SquarePen size={16} aria-hidden="true" /> Abrir el formulario completo</a
		>
		{#if notesEnabled}
			<button
				class="kv-btn ghost small"
				type="button"
				disabled={busy}
				on:click={() => dispatch('note', date)}
				><StickyNote size={16} aria-hidden="true" /> Nota del día</button
			>
		{/if}
	</div>
</Sheet>

<style>
	.when {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2xs) var(--space-xs);
	}
	.when label,
	.scratch label {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
		font-size: var(--text-xs);
		color: var(--muted);
	}
	input {
		min-height: 2.6rem;
		border: 1px solid var(--line);
		border-radius: var(--radius-s);
		padding: 0 var(--space-2xs);
		background: var(--surface);
		color: var(--text);
		font: inherit;
	}
	.error {
		margin: 0;
		background: var(--error-bg);
		color: var(--error);
		border-radius: var(--radius-s);
		padding: 0.4rem var(--space-2xs);
	}
	.scratch {
		border-top: 1px solid var(--line);
		padding-top: var(--space-xs);
	}
	.scratch form {
		display: flex;
		flex-direction: column;
		gap: var(--space-3xs);
	}
	.row {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2xs);
	}
	.row input {
		flex: 1 1 14rem;
		min-width: 0;
	}
	.more {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2xs);
		border-top: 1px solid var(--line);
		padding-top: var(--space-xs);
	}
</style>
