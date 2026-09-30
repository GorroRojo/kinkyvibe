<script>
	import ContentEditor from '$lib/components/admin/content/ContentEditor.svelte';

	/** @type {import('./$types').PageData} */
	export let data;
	/** @type {import('./$types').ActionData} */
	export let form;
</script>

{#key data.slug + data.mode + (data.source?.slug ?? '')}
	<ContentEditor {data} {form} />
{/key}
