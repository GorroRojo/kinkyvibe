<script>
	import '$lib/admin/panel-forms.scss';
	import PageHeader from '$lib/components/admin/panel/PageHeader.svelte';
	import Card from '$lib/components/admin/panel/Card.svelte';
	import ProfileEditorForm from '$lib/components/admin/amigues/ProfileEditorForm.svelte';
	import { draftKey } from '$lib/admin/draft.js';

	/** @type {any} */
	export let data;
	/** @type {any} */
	export let form;

	$: values = structuredClone(form?.perfil?.values ?? data.values);
	// Con «Oculto» elegido (de entrada, como desde «Enlaces que faltan», o al cambiarlo) no se
	// publica: el botón y el subtítulo lo dicen (gorrite, 3/11/2026).
	$: hidden = values.visibility === 'hidden';
</script>

<PageHeader
	title="Perfil nuevo"
	subtitle={hidden
		? 'Persona, proyecto o lugar. Queda oculto: no aparece en Amigues hasta que lo cambies.'
		: 'Persona, proyecto o lugar. Se publica en Amigues al guardar.'}
	back={{ href: '/admin/comunidad/perfiles', label: 'Perfiles' }}
/>
<Card>
	{#if form?.perfil && !form.perfil.ok}
		<p class="kv-flash bad" role="alert">{form.perfil.message}</p>
	{/if}
	<ProfileEditorForm
		bind:values
		errors={form?.perfil?.errors ?? {}}
		action="?/crearPerfil"
		submitLabel={hidden ? 'Crear oculto' : 'Crear y publicar'}
		kinds={data.kinds}
		draftKey={draftKey('perfil', 'nuevo')}
	/>
</Card>
