<script>
	/**
	 * Contenido → En la base: importar los eventos y el material a la base y ver si coinciden con
	 * sus .md (una tarjeta por categoría).
	 */
	import '$lib/admin/panel-forms.scss';
	import PageHeader from '$lib/components/admin/panel/PageHeader.svelte';
	import ImportCard from '$lib/components/admin/contenido/ImportCard.svelte';

	export let data;
</script>

<PageHeader
	title="Contenido en la base"
	subtitle="Los eventos y el material (.md) pasan a la base, con la misma dirección y su historial. Las imágenes siguen en el repo."
/>

<div class="kv-stack">
	{#if !data.flagOn}
		<p class="kv-flash warn">
			El interruptor «Contenido desde la base» está apagado: importar no cambia nada del sitio
			todavía. Cuando todo coincida, prendelo en Ajustes → Interruptores.
		</p>
	{:else}
		<p class="kv-flash">
			El interruptor «Contenido desde la base» está prendido: el sitio muestra los eventos y el
			material de la base. Lo que no está en la base sigue saliendo de su .md.
		</p>
	{/if}

	{#each data.categories as category (category.key)}
		<ImportCard {category} labels={data.labels} chunk={data.chunk} />
	{/each}

	<p class="kv-note">
		<a class="kv-btn" href="/admin/contenido/base/descargar.tar" download>Descargar todo</a>
		Los eventos y el material de la base como archivos .md (en un .tar), para tenerlos guardados o volver
		a los .md.
	</p>

	<p class="kv-note">
		La wiki no está acá: sus textos pasan a ser el cuerpo de las etiquetas (Etiquetas). Los .md
		quedan en el repo hasta que confirmes que todo coincide.
	</p>
</div>
