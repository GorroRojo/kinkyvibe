<script>
	import ContentEditor from '$lib/components/admin/content/ContentEditor.svelte';
	import DeleteLink from '$lib/components/admin/panel/DeleteLink.svelte';

	/** @type {import('./$types').PageData} */
	export let data;
	/** @type {import('./$types').ActionData} */
	export let form;
</script>

{#key data.slug}
	<ContentEditor {data} {form} />
{/key}
<DeleteLink kind="material" slug={data.slug} />
