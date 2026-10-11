<script>
	import PostEditor from '$lib/components/admin/PostEditor.svelte';
	import PartesEditor from '$lib/components/admin/PartesEditor.svelte';
	import '$lib/admin/panel-editor.scss';

	/** @type {import('./$types').PageData} */
	export let data;
	/** @type {import('./$types').ActionData} */
	export let form;
</script>

<!-- Al guardar se vuelve a leer la página: el editor se arma de nuevo con el archivo guardado. -->
{#key data.post}
	<PostEditor {data} {form} category="calendario" postID={data.event.slug} embedded>
		<!-- Talleres en varias partes (docs/talleres-partes.md): en la columna del formulario y en
		el índice, pero se guarda por su cuenta (no manda el formulario del evento). -->
		<svelte:fragment slot="extra">
			<PartesEditor state={data.partes} slug={data.event.slug} />
		</svelte:fragment>
	</PostEditor>
{/key}
