<script>
	//@ts-nocheck
	export let data;
	import { ArrowLeft } from 'lucide-svelte';
	import PostList from '$lib/components/PostList.svelte';
</script>

<svelte:head>
	<title>KinkyVibe.ar - Artículos, links y descargables</title>
</svelte:head>
<PostList posts={data.posts} />

<style>
	a.back {
		display: block;
		width: 100%;
		max-width: 900px;
		margin: 1.5em auto -2em;
		padding-left: 1em;
		color: var(--2);
		text-decoration: none;
	}
</style>
