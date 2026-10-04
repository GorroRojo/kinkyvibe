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
	<PostEditor {data} {form} category="calendario" postID={data.event.slug} embedded />
{/key}

<!-- Talleres en varias partes (docs/talleres-partes.md): va aparte del formulario del evento. -->
<div class="kv-admin embedded">
	<PartesEditor state={data.partes} slug={data.event.slug} />
</div>
