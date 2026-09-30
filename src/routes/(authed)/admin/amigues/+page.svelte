<script>
	import ContentList from '$lib/components/admin/content/ContentList.svelte';

	/** @type {import('./$types').PageData} */
	export let data;
	/** @type {import('./$types').ActionData} */
	export let form;
</script>

<ContentList
	category="amigues"
	rows={data.rows}
	{form}
	title="Amigues"
	subtitle="Perfiles de personas y proyectos amigues (se usan en «Organizan» y «Autores»)."
	newLabel="Nuevo perfil"
	canDuplicate={false}
/>
