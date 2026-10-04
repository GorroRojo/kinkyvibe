<script>
	import DeleteLink from '$lib/components/admin/panel/DeleteLink.svelte';
	import ProfileDbEditor from '$lib/components/admin/amigues/ProfileDbEditor.svelte';

	/** @type {any} */
	export let data;
	/** @type {any} */
	export let form;
</script>

<!-- Todo perfil vive solo en la base: se edita, se borra y se deshace ahí (sin GitHub; ver
     deleteBackend en src/lib/server/admin/deletions.js). -->
{#key data.profile.id}
	<ProfileDbEditor {data} {form} />
{/key}
<DeleteLink kind="amigues" slug={data.profile.urlSlug} />
