<!--
	Un solo «Volver arriba», al final de un texto con títulos (material, Kinkipedia, eventos). Antes
	había uno al lado de cada título (customRehype.js): una parada de Tab extra por título y un ícono
	casi invisible. Solo aparece si el texto tiene títulos con ancla (`.linktothis`), que es cuando
	el texto es largo. Lleva al `#title` de la página (el h1 o el artículo).
-->
<script>
	import { ArrowUp } from '@lucide/svelte';

	/** El HTML del texto (`data.html`).
	 * @type {string | null | undefined} */
	export let html = '';
	/** Las partes, si el texto tiene interactivos (`data.parts`).
	 * @type {unknown[] | null | undefined} */
	export let parts = undefined;

	$: show =
		/class="linktothis"/.test(html ?? '') || JSON.stringify(parts ?? []).includes('linktothis');
</script>

{#if show}
	<p class="volver-arriba">
		<a href="#title" class="pill-btn ghost small"
			><ArrowUp size={16} aria-hidden="true" /> Volver arriba</a
		>
	</p>
{/if}

<style>
	.volver-arriba {
		display: flex;
		justify-content: flex-end;
		margin-block: var(--space-m) 0;
	}
</style>
