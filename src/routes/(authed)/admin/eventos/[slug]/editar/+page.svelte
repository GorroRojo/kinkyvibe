<script>
	import PostEditor from '$lib/components/admin/PostEditor.svelte';
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
