<script>
	// Botón "Agregar a mi calendario" de la página de un evento, con el mismo estilo que
	// "Compartir" (ShareEventButton): el botón es nuestro y el menú de calendarios (Google, Apple,
	// .ics...) lo abre add-to-calendar-button con `atcb_action`. La librería (~290 KB) se baja
	// después de cargar la página para no demorarla.
	import { onMount } from 'svelte';
	import { CalendarPlus } from '@lucide/svelte';

	/**
	 * Los datos del evento para add-to-calendar-button (name, startDate, startTime, endDate,
	 * endTime, timeZone, options...).
	 * @type {Parameters<typeof import('add-to-calendar-button').atcb_action>[0]}
	 */
	export let event;

	/** @type {HTMLButtonElement} */
	let button;
	/** @type {Promise<typeof import('add-to-calendar-button')> | undefined} */
	let lib;
	const load = () => (lib ??= import('add-to-calendar-button'));

	onMount(() => {
		load().catch(() => (lib = undefined));
	});

	/** @param {MouseEvent} e */
	async function open(e) {
		try {
			const { atcb_action } = await load();
			// `detail` 0: lo activaron con el teclado (así la librería maneja el foco del menú).
			atcb_action({ ...event }, button, e.detail === 0);
		} catch (err) {
			lib = undefined;
			console.error(err);
		}
	}
</script>

<button type="button" class="trigger" bind:this={button} on:click={open}>
	<CalendarPlus size="20" aria-hidden="true" /> Agregar a mi calendario
</button>

<style>
	/* Igual que el botón de ShareEventButton.svelte: si cambia uno, cambiá el otro. */
	.trigger {
		display: inline-flex;
		align-items: center;
		gap: 0.45em;
		font: inherit;
		font-weight: bold;
		color: var(--2-dark);
		background: white;
		border: 2px solid var(--2);
		border-radius: var(--radius-pill);
		padding: 0.45em 1.2em;
		cursor: pointer;
	}
	.trigger:hover,
	.trigger:focus-visible {
		background: var(--2);
		color: white;
	}
</style>
