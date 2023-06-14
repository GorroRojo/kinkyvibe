<script>
	//@ts-nocheck
	export let data;
	import PostList from '$lib/components/PostList.svelte';
	import { filteredTags, tagsConfig } from '$lib/utils/stores';
	import { onMount } from 'svelte';
	// onMount(()=>{
		tagsConfig.set(data.tagsConfig);
		filteredTags.set([]) //TODO turn into js Set instead of Array
	// })
</script>
<svelte:head>
	<title>KinkyVibe.ar - Artículos, links y descargables</title>
</svelte:head>
<PostList posts={data.posts}/>
