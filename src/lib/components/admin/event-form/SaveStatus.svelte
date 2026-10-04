<script>
	/**
	 * En qué quedó el último guardado, al lado del botón de la barra fija de guardar: «Guardado. Se
	 * ve enseguida en el sitio.» (o lo que corresponda: `savedSummary` en $lib/admin/saveCopy.js).
	 * También lo anuncia a los lectores de pantalla (y «Guardando…» al empezar) con la región fija
	 * de $lib/admin/announce.js, que sigue ahí aunque el editor se arme de nuevo al guardar.
	 *
	 * Props: `saving`; `message`: la confirmación (vacía = nada que mostrar); `savingText`. Los
	 * errores los muestra cada formulario como siempre (con `role="alert"`).
	 */
	import { onMount } from 'svelte';
	import { CircleCheck } from '@lucide/svelte';
	import { announce } from '$lib/admin/announce.js';

	export let saving = false;
	export let message = '';
	export let savingText = 'Guardando…';

	let mounted = false;
	onMount(() => {
		mounted = true;
	});
	$: if (mounted && saving) announce(savingText);
	$: if (mounted && !saving && message) announce(message);
</script>

{#if message && !saving}
	<span class="save-status" id="save-status">
		<CircleCheck size={18} aria-hidden="true" />
		<span>{message}</span>
	</span>
{/if}

<style>
	.save-status {
		display: inline-flex;
		align-items: center;
		gap: 0.35em;
		flex: 1 1 14em;
		color: var(--ok, #1b7a3d);
		font-weight: 700;
	}
	.save-status :global(svg) {
		flex: none;
	}
</style>
