<script>
	//@ts-nocheck
	export let data;
</script>

<svelte:head>
	<title>{data.title} - KinkyVibe.ar</title>
	<meta property="og:title" content={data.title} />
</svelte:head>
<article>
	{#if !data.error}
		<!-- <p>Published: {new Date(data.date)}</p> -->
		<svelte:component this={data.content} />
	{:else}
		{data.content}
	{/if}
</article>
