<script>
	/**
	 * Una nota de un día como chip con su color (planilla de la agenda). Es un botón: tocarlo abre
	 * la nota para cambiarla o borrarla. Props: `note`, `disabled`. Evento: `open` (detail: note).
	 */
	import { createEventDispatcher } from 'svelte';
	import { StickyNote } from '@lucide/svelte';
	import { dayNoteStyles } from '$lib/utils/dayNotes.js';

	/** @type {import('$lib/utils/dayNotes.js').DayNote} */
	export let note;
	export let disabled = false;

	const dispatch = createEventDispatcher();
</script>

<button
	type="button"
	class="day-note"
	style={dayNoteStyles(note.color).join('; ')}
	{disabled}
	title="Cambiar o borrar la nota"
	aria-label="Nota: {note.body}. Cambiarla o borrarla"
	on:click={() => dispatch('open', note)}
	><StickyNote size={13} aria-hidden="true" /><span>{note.body}</span></button
>

<style>
	.day-note {
		display: inline-flex;
		align-items: center;
		gap: 0.3em;
		max-width: 100%;
		border: 0;
		border-left: 3px solid var(--tone);
		border-radius: 0.4rem;
		background: var(--tone-bg);
		color: var(--text);
		font: inherit;
		font-size: var(--text-xs);
		font-weight: 700;
		line-height: 1.3;
		padding: 0.15rem var(--space-2xs);
		cursor: pointer;
		text-align: left;
	}
	.day-note :global(svg) {
		flex: none;
		color: var(--tone);
	}
	.day-note span {
		overflow-wrap: anywhere;
	}
	.day-note:hover:not(:disabled) {
		box-shadow: inset 0 0 0 1px var(--tone);
	}
	.day-note:focus-visible {
		outline: 2px solid var(--link);
		outline-offset: 1px;
	}
	.day-note:disabled {
		cursor: default;
	}
</style>
