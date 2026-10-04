<script>
	// Solo en previews y en dev (ver +page.js): en producción la página da 404.
	/** @type {import('./$types').PageData} */
	export let data;
</script>

<svelte:head>
	<title>Maqueta de evento · Kinky Vibe</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<svelte:component this={data.Mockup} opcion={data.opcion} />
