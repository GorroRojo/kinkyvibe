<script>
	import PostList from '$lib/components/PostList.svelte';
	import PageHeader from '$lib/components/admin/panel/PageHeader.svelte';
	import EmptyState from '$lib/components/admin/panel/EmptyState.svelte';
	export let data;
</script>

<PageHeader
	title="Publicaciones no listadas"
	subtitle="Borradores y páginas ocultas: no aparecen en el calendario ni en las listas, pero se pueden abrir con su link."
/>

{#if data.unlisted_posts.length}
	<PostList posts={data.unlisted_posts} />
{:else}
	<EmptyState emoji="🙈" title="No hay publicaciones no listadas" />
{/if}
