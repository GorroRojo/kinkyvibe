<script>
	//@ts-nocheck
	export let data;
</script>

<svelte:head>
	<title>KinkyVibe - {data.title}</title>
	<meta property="og:title" content={data.title} />
</svelte:head>
<h1>{data.title}</h1>
{#if !data.error}
	<!-- <p>Published: {new Date(data.date)}</p> -->
	<svelte:component this={data.content} />
{:else}
	{data.content}
{/if}
