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
	subtitle="Los eventos y el material se guardan en la base del sitio, con la misma dirección y su historial. Esta página es sobre todo para quien mantiene el sitio."
/>

<div class="kv-stack">
	<p class="kv-flash">
		El sitio muestra los eventos y el material desde la base, y el panel los guarda ahí. Para cargar
		o editar no hace falta nada de esta página.
	</p>
	<details class="tech">
		<summary>Para técnicos</summary>
		<p class="kv-note">
			Importar trae un .md nuevo del repo (por ejemplo, de un PR): lo que ya está en la base no se
			pisa. Las imágenes viejas siguen en el repo.
		</p>
	</details>

	{#each data.categories as category (category.key)}
		<ImportCard {category} labels={data.labels} chunk={data.chunk} />
	{/each}

	<p class="kv-note">
		<a class="kv-btn" href="/admin/contenido/base/descargar.tar" download>Descargar todo</a>
		Los eventos y el material de la base como archivos .md (en un .tar), para tenerlos guardados.
	</p>

	<p class="kv-note">
		La wiki no está acá: sus textos pasan a ser el cuerpo de las etiquetas (Etiquetas). Los .md de
		eventos y material quedan en el repo solo como respaldo: el sitio ya no los lee.
	</p>
</div>

<style>
	.tech summary {
		cursor: pointer;
		color: var(--muted);
		font-size: var(--text-sm);
	}
</style>
