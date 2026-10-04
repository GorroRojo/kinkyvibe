<script>
	/**
	 * Mapa, «Cómo llegar» y «Accesibilidad» de las maquetas (VenueLocation `part="more"`), en una
	 * tarjeta blanca. En el celu, plegados detrás de «Ver mapa y cómo llegar», como en la página
	 * real (así no empujan el texto del evento para abajo).
	 * Props: `title` (encabezado opcional de la tarjeta), `fold` (plegar en el celu).
	 */
	import { ChevronDown } from '@lucide/svelte';
	import VenueLocation from '$lib/components/amigues/VenueLocation.svelte';
	import { venue } from './datos.js';

	export let title = '';
	export let fold = true;
	let open = false;
</script>

<section class="mapa surface-card" class:fold class:open aria-label="Mapa y cómo llegar">
	{#if title}<h2>{title}</h2>{/if}
	{#if fold}
		<!-- Las clases de Button (secundario del sitio) a mano: Button no pasa aria-expanded. -->
		<button
			type="button"
			class="pill-btn ghost toggle"
			aria-expanded={open}
			on:click={() => (open = !open)}
		>
			{open ? 'Ocultar mapa' : 'Ver mapa y cómo llegar'}
			<ChevronDown size="1em" aria-hidden="true" />
		</button>
	{/if}
	<div class="cuerpo">
		<VenueLocation view={venue} context="event" compact part="more" />
	</div>
</section>

<style>
	.mapa {
		padding: var(--space-xs) var(--space-s);
		font-size: var(--text-sm);
	}
	h2 {
		margin: 0 0 var(--space-2xs);
		font-size: var(--text-lg);
	}
	.toggle {
		display: none;
	}
	@media (max-width: 500px) {
		.fold .toggle {
			display: inline-flex;
		}
		.fold.open .toggle :global(svg) {
			rotate: 180deg;
		}
		.fold:not(.open) .cuerpo {
			display: none;
		}
		.fold.open .cuerpo {
			margin-top: var(--space-2xs);
		}
		/* Sin título, plegado: solo el botón (sin la tarjeta alrededor), como en la página real. */
		.fold:not(.open):not(:has(h2)) {
			padding: 0;
			background: none;
			box-shadow: none;
			text-align: center;
		}
	}
</style>
