<script>
	//@ts-nocheck
	export let data;
</script>

<h1>{data.title}</h1>
<p>Published: {data.date}</p>
<svelte:component this={data.content} />
