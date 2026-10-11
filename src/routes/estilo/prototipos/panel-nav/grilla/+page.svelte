<script>
	// Solo en previews y en dev (ver +page.js): en producción la página da 404.
	/** @type {import('./$types').PageData} */
	export let data;
</script>

<svelte:head>
	<title>Navegación B: grilla · Prototipo · Kinky Vibe</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<svelte:component this={data.Prototipo} />
