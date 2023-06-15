<script>
	//@ts-nocheck
	export let data;
	import PostList from '$lib/components/PostList.svelte';
	
</script>
<svelte:head>
	<title>KinkyVibe.ar - Artículos, links y descargables</title>
</svelte:head>
<PostList posts={data.posts}/>
