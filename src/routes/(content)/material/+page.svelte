<script>
	//@ts-nocheck
	export let data;
	import PostList from '$lib/components/PostList.svelte';
</script>
<PostList posts={data.posts} />
