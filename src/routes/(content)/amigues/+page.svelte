<script>
	//@ts-nocheck
	import { ArrowLeft } from 'lucide-svelte';
	export let data;
	import PostList from '$lib/components/PostList.svelte';
</script>

<a class="back" href="/"><ArrowLeft size="20" style="translate: 0 .3em" /> Volver</a>

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
