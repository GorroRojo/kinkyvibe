<script>
	/**
	 * Agregar, cambiar o borrar la nota de un día de la agenda, en una hoja (abajo en el celu,
	 * centrada en desktop). Guarda sola por las actions `noteSave` / `noteDelete` de
	 * /admin/eventos/agenda (D1, solo admins).
	 * Props: `open` (bind), `note` (la nota a cambiar, o null para una nueva), `date` (el día de una
	 * nota nueva). Eventos: `saved` (detail: la nota guardada), `deleted` (detail: su id).
	 */
	import { createEventDispatcher, tick } from 'svelte';
	import { Save, Trash2 } from '@lucide/svelte';
	import '$lib/admin/panel-forms.scss';
	import Sheet from '$lib/components/admin/door/Sheet.svelte';
	import { postDayNote, postDayNoteDelete } from '$lib/admin/agendaSave.js';
	import { askConfirm } from '$lib/admin/confirm.js';
	import {
		DAY_NOTE_COLORS,
		DAY_NOTE_MAX,
		DEFAULT_DAY_NOTE_COLOR,
		dayNoteStyles,
		validateDayNote
	} from '$lib/utils/dayNotes.js';

	export let open = false;
	/** @type {import('$lib/utils/dayNotes.js').DayNote | null} */
	export let note = null;
	export let date = '';

	const dispatch = createEventDispatcher();
	const uid = Math.random().toString(36).slice(2, 8);

	let values = { date: '', body: '', color: /** @type {string} */ (DEFAULT_DAY_NOTE_COLOR) };
	/** @type {{ date?: string, body?: string, color?: string }} */
	let errors = {};
	let message = '';
	let busy = false;
	/** @type {HTMLInputElement} */
	let bodyInput;

	// Cada vez que se abre, arranca con la nota (o vacía, en el día elegido).
	let wasOpen = false;
	$: if (open !== wasOpen) {
		wasOpen = open;
		if (open) reset();
	}

	async function reset() {
		values = note
			? { date: note.date, body: note.body, color: note.color }
			: { date, body: '', color: DEFAULT_DAY_NOTE_COLOR };
		errors = {};
		message = '';
		await tick();
		bodyInput?.focus();
	}

	async function save() {
		if (busy) return;
		const v = validateDayNote(values);
		if (!v.ok) {
			errors = v.errors;
			return;
		}
		busy = true;
		errors = {};
		message = '';
		const r = await postDayNote({ id: note?.id ?? null, ...v.value });
		busy = false;
		if (!r) return;
		if (r.ok && r.note) {
			dispatch('saved', r.note);
			open = false;
		} else {
			errors = r.errors ?? {};
			message = r.message;
		}
	}

	async function remove() {
		if (!note || busy) return;
		const ok = await askConfirm({
			title: '¿Borrar esta nota?',
			text: note.body,
			confirmLabel: 'Borrar',
			tone: 'permanent'
		});
		if (!ok || !note) return;
		busy = true;
		message = '';
		const r = await postDayNoteDelete(note.id);
		busy = false;
		if (!r) return;
		if (r.ok) {
			dispatch('deleted', note.id);
			open = false;
		} else {
			message = r.message;
		}
	}
</script>

<Sheet bind:open title={note ? 'Nota del día' : 'Nueva nota del día'}>
	<form class="kv-form" on:submit|preventDefault={save}>
		<label class="kv-field">
			<span>Día</span>
			<input
				type="date"
				bind:value={values.date}
				required
				aria-invalid={errors.date ? 'true' : undefined}
				aria-describedby={errors.date ? `dn-date-err-${uid}` : undefined}
			/>
			{#if errors.date}<small id="dn-date-err-{uid}" class="kv-error">{errors.date}</small>{/if}
		</label>
		<label class="kv-field">
			<span>Nota</span>
			<input
				bind:this={bodyInput}
				bind:value={values.body}
				maxlength={DAY_NOTE_MAX}
				placeholder="Feriado, no reservar el lugar…"
				required
				aria-invalid={errors.body ? 'true' : undefined}
				aria-describedby="dn-body-help-{uid}"
			/>
			<small id="dn-body-help-{uid}" class:kv-error={errors.body}
				>{errors.body ??
					'Corta: se ve en el día, en el calendario y en la planilla. Solo la ven les admins.'}</small
			>
		</label>
		<fieldset class="colors">
			<legend>Color</legend>
			<div class="swatches">
				{#each DAY_NOTE_COLORS as c (c.id)}
					<label class="swatch" style={dayNoteStyles(c.id).join('; ')}>
						<input type="radio" name="dn-color-{uid}" value={c.id} bind:group={values.color} />
						<span>{c.label}</span>
					</label>
				{/each}
			</div>
			{#if errors.color}<small class="kv-error">{errors.color}</small>{/if}
		</fieldset>

		{#if message}<p class="kv-flash bad" role="status">{message}</p>{/if}

		<div class="btns">
			{#if note}
				<button type="button" class="kv-btn ghost danger" on:click={remove} disabled={busy}
					><Trash2 size={16} aria-hidden="true" /> Borrar</button
				>
			{/if}
			<button class="kv-btn" disabled={busy}
				><Save size={16} aria-hidden="true" /> {busy ? 'Guardando…' : 'Guardar'}</button
			>
		</div>
	</form>
</Sheet>

<style>
	.colors {
		border: 0;
		margin: 0;
		padding: 0;
		min-width: 0;
	}
	legend {
		font-weight: 700;
		font-size: var(--text-sm);
		padding: 0;
		margin-bottom: 0.4rem;
	}
	.swatches {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
	}
	.swatch {
		display: inline-flex;
		align-items: center;
		gap: var(--space-3xs);
		min-height: 2.5rem;
		padding: 0 var(--space-xs) 0 var(--space-2xs);
		border-radius: 3em;
		border-left: 4px solid var(--tone);
		background: var(--tone-bg);
		cursor: pointer;
		font-weight: 700;
	}
	.swatch input {
		accent-color: var(--tone);
		width: 1rem;
		height: 1rem;
		margin: 0;
	}
	.swatch:has(input:checked) {
		box-shadow: inset 0 0 0 2px var(--tone);
	}
	.swatch:has(input:focus-visible) {
		outline: 2px solid var(--link);
		outline-offset: 2px;
	}
	.btns {
		display: flex;
		flex-wrap: wrap;
		justify-content: flex-end;
		gap: var(--space-2xs);
	}
	.danger {
		margin-right: auto;
	}
</style>
