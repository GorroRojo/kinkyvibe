<script>
	//@ts-nocheck
	export let data;
	import { ArrowLeft } from 'lucide-svelte';
	import PostList from '$lib/components/PostList.svelte';
</script>

<svelte:head>
	<title>KinkyVibe.ar</title>
</svelte:head>
<PostList posts={data.posts} />


