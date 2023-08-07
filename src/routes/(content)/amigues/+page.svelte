<script>
	//@ts-nocheck
	import { ArrowLeft } from 'lucide-svelte';
	export let data;
	import PostList from '$lib/components/PostList.svelte';
	let pinned = ['Gorro_Rojo', 'DemonWeb', 'TallarinesConTuco']
	data.posts.sort((a, b) => {
		if (pinned.includes(a.path) && !pinned.includes(b.path)) {
			return -1;
		} else return 0;
	});
</script>

<svelte:head>
	<title>KinkyVibe.ar - Emprendimientos y profesionales</title>
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
