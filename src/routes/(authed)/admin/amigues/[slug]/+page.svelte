<script>
	import ContentEditor from '$lib/components/admin/content/ContentEditor.svelte';
	import ProfileDbEditor from '$lib/components/admin/amigues/ProfileDbEditor.svelte';
	import DeleteLink from '$lib/components/admin/panel/DeleteLink.svelte';

	/** @type {any} */
	export let data;
	/** @type {any} */
	export let form;
</script>

{#if data.editor === 'db'}
	<!-- Perfil de la base (#137): «Borrar desde el panel» (#142) todavía borra solo archivos .md
	     (deleteBackend en $lib/server/admin/deletions.js), así que acá no se ofrece. -->
	{#key data.profile.id}
		<ProfileDbEditor {data} {form} />
	{/key}
{:else}
	{#key data.slug}
		<ContentEditor {data} {form} />
	{/key}
	<DeleteLink kind="amigues" slug={data.slug} />
{/if}
