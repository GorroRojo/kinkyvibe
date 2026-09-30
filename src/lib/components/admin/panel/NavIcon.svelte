<script>
	/**
	 * Ícono de una sección del panel: el de Lucide (`item.icon`) o el emoji (`item.emoji`), según
	 * `ICON_MODE` en `$lib/admin/nav.js` (un solo lugar para cambiar todos).
	 * Props: `item` (un NavItem o cualquier `{ icon?, emoji }`), `size` (px, default 20),
	 * `strokeWidth` (default 2).
	 */
	import { ICON_MODE } from '$lib/admin/nav.js';
	/** @type {{ icon?: any, emoji?: string }} */
	export let item;
	export let size = 20;
	export let strokeWidth = 2;
</script>

{#if ICON_MODE === 'lucide' && item.icon}
	<svelte:component this={item.icon} {size} {strokeWidth} aria-hidden="true" />
{:else}
	<span class="emoji" style="font-size:{size * 0.9}px" aria-hidden="true">{item.emoji ?? ''}</span>
{/if}

<style>
	.emoji {
		display: inline-block;
		line-height: 1;
		width: 1.2em;
		text-align: center;
	}
</style>
