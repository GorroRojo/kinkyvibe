<script>
	/**
	 * Pista chica «g e» a la derecha de una sección del menú lateral (`NavEntry`, Inicio en
	 * `SideNav`). Sale de `shortcutOf()` (`$lib/admin/commands.js`); sin atajo no muestra nada.
	 *
	 * - Solo se ve en una compu con mouse y pantalla ancha (la misma consulta que `HINTS_MEDIA` en
	 *   `$lib/admin/shortcutHints.js`): nunca en el celu, la tablet ni el panel "Más".
	 * - `aria-hidden`: los lectores de pantalla no leen «g e» en cada link. No hay
	 *   `aria-keyshortcuts` en el link: ese atributo describe teclas juntas («Control+K»), no una
	 *   secuencia, y «g e» ahí querría decir «g» o «e». Los atajos están en la hoja de `?`.
	 * - Para que los nombres largos («Ventas en el tiempo») no se corten, con pistas la barra lateral
	 *   es más ancha (layout del panel).
	 * - Se enciende (color de acento) mientras `g` espera su segunda tecla (`goPending`).
	 * Props: `id` (id de NAV).
	 */
	import { shortcutOf } from '$lib/admin/commands.js';
	import { goPending } from '$lib/admin/shortcutHints.js';

	/** @type {string} */
	export let id;

	$: keys = shortcutOf(id);
</script>

{#if keys}<kbd class="kv-nav-sc" class:lit={$goPending} aria-hidden="true">{keys}</kbd>{/if}

<style>
	.kv-nav-sc {
		display: none;
	}
	/* La misma consulta que HINTS_MEDIA (shortcutHints.js). */
	@media (hover: hover) and (pointer: fine) and (min-width: 1100px) {
		.kv-nav-sc {
			display: inline-block;
			flex: none;
			margin-left: auto;
			font: inherit;
			font-size: 0.7rem;
			font-weight: 400;
			line-height: 1.35;
			word-spacing: 0.12em;
			white-space: nowrap;
			color: var(--muted);
			background: var(--surface-2);
			border: 1px solid var(--line);
			border-radius: 0.35em;
			padding: 0 0.35em;
			opacity: 0.75;
			transition:
				color 120ms,
				background 120ms,
				border-color 120ms,
				opacity 120ms;
		}
		/* Después de un contador o de «prueba» (que ya empujan a la derecha). */
		:global(.count) + .kv-nav-sc,
		:global(.tag) + .kv-nav-sc {
			margin-left: 0.3rem;
		}
		.kv-nav-sc.lit {
			opacity: 1;
			color: var(--accent-ink);
			background: var(--accent);
			border-color: var(--accent);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.kv-nav-sc {
			transition: none;
		}
	}
</style>
