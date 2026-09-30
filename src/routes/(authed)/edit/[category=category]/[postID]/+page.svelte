<script>
	import { page } from '$app/stores';
	import PostEditor from '$lib/components/admin/PostEditor.svelte';

	/** @type {import('./$types').PageData} */
	export let data;
	/** @type {import('./$types').ActionData} */
	export let form;
</script>

<PostEditor
	{data}
	{form}
	category={$page.params.category ?? ''}
	postID={$page.params.postID ?? ''}
/>
