<script>
	import '$lib/admin/panel-forms.scss';
	import ContentEditor from '$lib/components/admin/content/ContentEditor.svelte';
	import PageHeader from '$lib/components/admin/panel/PageHeader.svelte';
	import Card from '$lib/components/admin/panel/Card.svelte';
	import ProfileEditorForm from '$lib/components/admin/amigues/ProfileEditorForm.svelte';

	/** @type {any} */
	export let data;
	/** @type {any} */
	export let form;

	$: values = structuredClone(form?.perfil?.values ?? data.values);
</script>

{#if data.editor === 'db'}
	<PageHeader
		title="Perfil nuevo"
		subtitle="Persona, proyecto o lugar. Se publica en Amigues al guardar."
		back={{ href: '/admin/amigues', label: 'Amigues' }}
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
{:else}
	{#key data.slug + data.mode + (data.source?.slug ?? '')}
		<ContentEditor {data} {form} />
	{/key}
{/if}
