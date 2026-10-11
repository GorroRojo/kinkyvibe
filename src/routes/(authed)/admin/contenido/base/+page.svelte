<script>
	/**
	 * Contenido → En la base: «Descargar todo».
	 */
	import '$lib/admin/panel-forms.scss';
	import PageHeader from '$lib/components/admin/panel/PageHeader.svelte';
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

	<p class="kv-note">
		<a class="kv-btn" href="/admin/contenido/base/descargar.tar" download>Descargar todo</a>
		Los eventos y el material de la base como archivos .md (en un .tar), para tenerlos guardados. Para
		restaurar, están los backups de la base.
	</p>

	<p class="kv-note">La wiki no está acá: sus textos son el cuerpo de las etiquetas (Etiquetas).</p>
</div>
