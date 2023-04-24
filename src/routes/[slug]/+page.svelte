<script>
	//@ts-nocheck
	export let data;
</script>

<svelte:head>
	<title>KinkyVibe - {data.title}</title>
	<meta property="og:title" content={data.title} />
</svelte:head>
<article>
	
	<h1>{data.title}</h1>
	{#if !data.error}
		<!-- <p>Published: {new Date(data.date)}</p> -->
		<svelte:component this={data.content} />
	{:else}
		{data.content}
	{/if}
</article>
<style>
	article {
		max-width: 800px;
		width: 100%;
		position: relative;
		margin-inline: auto;
	}
	h1 {
		font-size: 3em;
		margin-top: 2em;
	}
	img {
		margin-inline: auto;
		position: relative;
		width: 100%;
		object-fit: contain;
	}
</style>
