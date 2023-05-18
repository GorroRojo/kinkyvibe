<script>
	//@ts-nocheck
	export let data;
</script>

<svelte:head>
	<title>KinkyVibe - {data.title}</title>
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

<style lang="scss">
	article {
		max-width: 800px;
		width: 100%;
		position: relative;
		margin-inline: auto;
		margin-top: 3em;
	}
	h1 {
		font-size: 2em;
	}
	:global(img) {
		margin-inline: auto;
		position: relative;
		width: 100%;
		object-fit: contain;
	}
	:global(pre) {
		padding: 1em;
		border-radius: 1em;
		box-shadow: inset 0 0 1em rgba(1, 1, 1, 0.1);
	}
	:global(code) {
		padding: 0.1em 0.4em;
		border-radius: 0.4em;
		font-family: 'Courier New', Courier, monospace !important;
		font-size: .9em;
		span.token  {
			font-family: 'Courier New', Courier, monospace !important;

		}
	}
	:global(code, pre) {
		background: var(--3);
	}
</style>
