<script>
	/**
	 * Chip simple, con el mismo aspecto que el de etiqueta (`.kv-tag` de style.scss) pero sin
	 * etiqueta detrás: para filtros o selecciones que no son etiquetas del árbol. Para una etiqueta
	 * usá `TagChip` (pone su color y su emoji solo).
	 *
	 * Props:
	 * - `color`: color CSS del chip (default: el rosa de la marca). Mejor un token (`var(--2)`).
	 * - `emoji`: opcional, adelante del texto (los emoji son para contenido; en la interfaz, Lucide).
	 * - `icon`: componente de Lucide, opcional.
	 * - `selected`: lleno (elegido).
	 * - `href`: el chip es un link.
	 * - `pressable`: el chip es un <button> con `aria-pressed={selected}` (evento `click`).
	 * Slot default: el texto.
	 */
	/** @type {string | undefined} */
	export let color = undefined;
	/** @type {string} */
	export let emoji = '';
	/** @type {any} */
	export let icon = null;
	export let selected = false;
	/** @type {string | undefined} */
	export let href = undefined;
	export let pressable = false;
</script>

{#if href}
	<a class="kv-tag" class:on={selected} {href} style:--tag-color={color}
		>{#if emoji}<span aria-hidden="true">{emoji}</span>{/if}{#if icon}<svelte:component
				this={icon}
				size={12}
				aria-hidden="true"
			/>{/if}<slot /></a
	>
{:else if pressable}
	<button
		type="button"
		class="kv-tag chip-btn"
		aria-pressed={selected}
		style:--tag-color={color}
		on:click
		>{#if emoji}<span aria-hidden="true">{emoji}</span>{/if}{#if icon}<svelte:component
				this={icon}
				size={12}
				aria-hidden="true"
			/>{/if}<slot /></button
	>
{:else}
	<span class="kv-tag" class:on={selected} style:--tag-color={color}
		>{#if emoji}<span aria-hidden="true">{emoji}</span>{/if}{#if icon}<svelte:component
				this={icon}
				size={12}
				aria-hidden="true"
			/>{/if}<slot /></span
	>
{/if}

<style>
	.chip-btn {
		font-family: inherit;
		cursor: pointer;
	}
</style>
