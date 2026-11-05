<script>
	import ContentEditor from '$lib/components/admin/content/ContentEditor.svelte';
	import DeleteLink from '$lib/components/admin/panel/DeleteLink.svelte';
	import PageVisitsCard from '$lib/components/admin/stats/PageVisitsCard.svelte';

	/** @type {import('./$types').PageData} */
	export let data;
	/** @type {import('./$types').ActionData} */
	export let form;
</script>

{#key data.slug}
	<ContentEditor {data} {form} />
{/key}
<!-- Visitas de la página del material (docs/analiticas.md, «Visitas de una página»). -->
<div class="visits"><PageVisitsCard visits={data.visits} /></div>
<DeleteLink kind="material" slug={data.slug} />

<style>
	.visits {
		margin-top: var(--space-s);
	}
</style>
