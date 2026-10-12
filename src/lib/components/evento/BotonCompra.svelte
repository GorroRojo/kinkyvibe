<script>
	/**
	 * El botón grande de comprar de la página de un evento (docs/estilo.md: «el botón de comprar
	 * entradas es otro y queda distinto»). Lo usan «Comprar entradas» de la venta propia
	 * (Compra.svelte) y el link de inscripción o de entradas en otro sitio (`link`), con el mismo
	 * peso (gorrite, 10/10).
	 *
	 * Props: `href`, `title` (el texto grande), `external` (link web: se abre en otra pestaña, con
	 * el ícono de link externo y «Se abre en <sitio>» abajo, así no sorprende que salga del sitio).
	 * Slot default: la línea chica de abajo (precio, cuántas quedan); con `external`, va antes de
	 * «Se abre en…».
	 */
	import { ExternalLink } from '@lucide/svelte';

	/** @type {string} */
	export let href;
	/** @type {string} */
	export let title;
	export let external = false;

	/** El sitio del link («entradas.example.com»), sin «www.». */
	$: site = external ? hostOf(href) : '';

	/** @param {string} link */
	function hostOf(link) {
		try {
			return new URL(link).hostname.replace(/^www\./, '');
		} catch {
			return '';
		}
	}
</script>

<a
	class="buy-button"
	{href}
	target={external ? '_blank' : undefined}
	rel={external ? 'noopener' : undefined}
>
	<span class="buy-title"
		>{title}{#if external}<ExternalLink class="buy-ext" aria-hidden="true" />{/if}</span
	>
	{#if $$slots.default || site}
		<span class="buy-meta"
			><slot />{#if site}<span class="buy-site">Se abre en {site}</span>{/if}</span
		>
	{/if}
</a>

<style>
	.buy-button {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.15em;
		padding: 0.8em 1.2em;
		border-radius: var(--round);
		background: var(--1);
		color: white;
		text-decoration: none;
		text-align: center;
		box-shadow: 0 0.2em 0.8em color-mix(in srgb, var(--1) 40%, transparent);
	}
	.buy-button:hover,
	.buy-button:focus-visible {
		background: var(--1-dark);
		color: white;
		text-decoration: none;
	}
	.buy-title {
		font-size: var(--step-2);
		font-weight: 700;
		line-height: 1.2;
	}
	.buy-title :global(.buy-ext) {
		width: 0.7em;
		height: 0.7em;
		margin-inline-start: 0.3em;
		vertical-align: baseline;
	}
	.buy-meta {
		font-size: var(--step-0);
	}
	.buy-site {
		display: block;
	}
</style>
