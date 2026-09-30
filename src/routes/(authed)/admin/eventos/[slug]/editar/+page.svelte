<script>
	import PostEditor from '$lib/components/admin/PostEditor.svelte';
	import '$lib/admin/panel-editor.scss';

	/** @type {import('./$types').PageData} */
	export let data;
	/** @type {import('./$types').ActionData} */
	export let form;
</script>

<PostEditor {data} {form} category="calendario" postID={data.event.slug} embedded />
