<script>
	import ContentEditor from '$lib/components/admin/content/ContentEditor.svelte';
	import ProfileDbEditor from '$lib/components/admin/amigues/ProfileDbEditor.svelte';

	/** @type {any} */
	export let data;
	/** @type {any} */
	export let form;
</script>

{#if data.editor === 'db'}
	{#key data.profile.id}
		<ProfileDbEditor {data} {form} />
	{/key}
{:else}
	{#key data.slug}
		<ContentEditor {data} {form} />
	{/key}
{/if}
