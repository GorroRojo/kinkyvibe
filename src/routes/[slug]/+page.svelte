<script>
	//@ts-nocheck
	export let data;
</script>

<svelte:head>
	<title>{data.title} - KinkyVibe.ar</title>
	<link rel="icon" href="favicon.png" />
	
	<meta name="theme-color" content="hsl(319, 90%, 60%)" />

	<meta property="og:title" content={data.title} />
	<meta name="twitter:title" content={data.title} />
	
	<meta name="description" content={data.summary} />
	<meta name="twitter:description" content={data.summary} />
	<meta property="og:description" content={data.summary} />

	<meta property="og:image" content={data.featured} />
	<meta name="twitter:image" content={data.featured} />
	
	<meta name="twitter:site" content="@kinkyvibearg" />
	<meta name="twitter:card" content="summary_large_image" />
	<meta property="og:type" content="article" />

	<meta property="article:published_time" content={data.published_date} />
	<meta property="article:modified_time" content={data.updated_date} />
	<meta property="article:author" content={data.authors} />
	<!-- <meta property="article:section" content="" /> -->
	<meta property="article:tag" content={data.tags} />

</svelte:head>
<article>
	{#if !data.error}
		<!-- <p>Published: {new Date(data.date)}</p> -->
		<svelte:component this={data.content} />
	{:else}
		{data.content}
	{/if}
</article>
