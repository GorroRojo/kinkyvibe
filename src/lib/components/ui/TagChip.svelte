<script>
	/**
	 * Chip de una etiqueta con su emoji, su nombre y SU color (decisión de gorrite, 4/10; estilo
	 * `.kv-tag` en style.scss, ver docs/estilo.md, «Piezas»). El color y el emoji salen del árbol
	 * de etiquetas en uso (`$tagManager`: `getColor()`, que hereda el color de la madre, e `icon`);
	 * sin color, el rosa de la marca. Es el mismo chip en todos lados: el panel, la página del
	 * evento, las listas del sitio y sus filtros.
	 * Props: `tag` (id; los alias se resuelven), `href` (opcional: el chip es un link),
	 * `selected` (opcional: lleno, para filtros y selectores), `checkbox` (opcional: el chip es una
	 * casilla, para los filtros; `selected` es si está tildada y se puede usar con `bind:selected`;
	 * avisa con `on:change`), `name` (el `name` de la casilla), `label` (opcional: otro texto en
	 * vez del nombre de la etiqueta, por ejemplo un plural dentro de una frase).
	 * Slot: lo que va después del nombre, dentro del chip (un «»», un botón para sacarla).
	 */
	import { tagManager } from '$lib/utils/stores';

	/** @type {string} */
	export let tag;
	/** @type {string | undefined} */
	export let href = undefined;
	export let selected = false;
	export let checkbox = false;
	/** @type {string | undefined} */
	export let name = undefined;
	/** @type {string | undefined} */
	export let label = undefined;

	$: config = $tagManager.get(tag);
	$: color = config?.getColor?.() ?? undefined;
	$: icon = (config?.icon ?? '').trim();
	$: text = label ?? config?.visible_name ?? tag;
</script>

{#if checkbox}
	<label class="kv-tag-check tap-target">
		<input type="checkbox" {name} value={tag} bind:checked={selected} on:change />
		<span class="kv-tag" class:on={selected} style:--tag-color={color}
			>{#if icon}<span aria-hidden="true">{icon}</span>{/if}{text}<slot /></span
		>
	</label>
{:else if href}
	<a class="kv-tag tap-target" class:on={selected} {href} rel="tag" style:--tag-color={color}
		>{#if icon}<span aria-hidden="true">{icon}</span>{/if}{text}<slot /></a
	>
{:else}
	<span class="kv-tag" class:on={selected} style:--tag-color={color}
		>{#if icon}<span aria-hidden="true">{icon}</span>{/if}{text}<slot /></span
	>
{/if}
