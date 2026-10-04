<script>
	/**
	 * Editor de la plantilla general de un mail (Mensajes → Plantillas → el mail). El editor y la
	 * vista previa están en MailTemplateEditor (los comparte con la pestaña Mails de cada evento).
	 */
	import PageHeader from '$lib/components/admin/panel/PageHeader.svelte';
	import Badge from '$lib/components/admin/panel/Badge.svelte';
	import MailTemplateEditor from '$lib/components/admin/MailTemplateEditor.svelte';

	export let data;
	export let form;
</script>

<PageHeader
	title={data.def.label}
	subtitle={data.def.when}
	back={{ href: '/admin/mensajes/plantillas', label: 'Plantillas' }}
>
	<svelte:fragment slot="meta">
		{#if data.saved}<Badge tone="info">texto propio</Badge>{:else}<Badge>original</Badge>{/if}
	</svelte:fragment>
</PageHeader>

<MailTemplateEditor
	def={data.def}
	limits={data.limits}
	mode="general"
	saved={data.saved}
	recipients={data.recipients}
	{form}
	previewUrl="/admin/mensajes/plantillas/{data.def.id}/vista-previa"
/>
