<script>
	import '$lib/admin/panel-forms.scss';
	import PageHeader from '$lib/components/admin/panel/PageHeader.svelte';
	import Card from '$lib/components/admin/panel/Card.svelte';
	import ProfileEditorForm from '$lib/components/admin/amigues/ProfileEditorForm.svelte';

	/** @type {any} */
	export let data;
	/** @type {any} */
	export let form;

	$: values = structuredClone(form?.perfil?.values ?? data.values);
</script>

<PageHeader
	title="Perfil nuevo"
	subtitle="Persona, proyecto o lugar. Se publica en Amigues al guardar."
	back={{ href: '/admin/comunidad/perfiles', label: 'Perfiles' }}
/>
<Card>
	{#if form?.perfil && !form.perfil.ok}
		<p class="kv-flash bad" role="alert">{form.perfil.message}</p>
	{/if}
	<ProfileEditorForm
		{values}
		errors={form?.perfil?.errors ?? {}}
		action="?/crearPerfil"
		submitLabel="Crear y publicar"
		kinds={data.kinds}
	/>
</Card>
