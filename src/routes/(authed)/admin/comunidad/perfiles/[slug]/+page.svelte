<script>
	import ContentEditor from '$lib/components/admin/content/ContentEditor.svelte';
	import DeleteLink from '$lib/components/admin/panel/DeleteLink.svelte';
	import ProfileDbEditor from '$lib/components/admin/amigues/ProfileDbEditor.svelte';

	/** @type {any} */
	export let data;
	/** @type {any} */
	export let form;
</script>

<!-- Borrar desde el panel es para el .md (por PR). Los perfiles de la base todavía no se borran
     desde acá: ver deleteBackend en src/lib/server/admin/deletions.js. -->
{#if data.editor === 'db'}
	{#key data.profile.id}
		<ProfileDbEditor {data} {form} />
	{/key}
{:else}
	{#key data.slug}
		<ContentEditor {data} {form} />
	{/key}
	<DeleteLink kind="amigues" slug={data.slug} />
{/if}
