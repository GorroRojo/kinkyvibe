<script>
	import ContentList from '$lib/components/admin/content/ContentList.svelte';

	/** @type {import('./$types').PageData} */
	export let data;
	/** @type {import('./$types').ActionData} */
	export let form;
</script>

<ContentList
	category="material"
	rows={data.rows}
	{form}
	title="Material"
	subtitle="Guías, fanzines, artículos y links de la biblioteca."
	newLabel="Nuevo material"
	canDuplicate={true}
/>
