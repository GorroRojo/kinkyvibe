<script>
	/**
	 * Los `<link rel="alternate">` de los feeds Atom y JSON Feed de una página (docs/seo.md): así
	 * los lectores de feeds los encuentran con la dirección de la página.
	 * Props: `base` (la ruta de la página, sin barra al final: «/calendario»), `title` y, si la
	 * página tiene uno, `ics` (la dirección de su calendario .ics, para suscribirse).
	 */
	/** @type {string} */
	export let base;
	/** @type {string} */
	export let title;
	/** @type {string | undefined} */
	export let ics = undefined;
</script>

<svelte:head>
	<link
		rel="alternate"
		type="application/atom+xml"
		title="{title} (Atom)"
		href="{base}/feed.atom"
	/>
	<link
		rel="alternate"
		type="application/feed+json"
		title="{title} (JSON Feed)"
		href="{base}/feed.json"
	/>
	{#if ics}
		<link rel="alternate" type="text/calendar" title="{title} (iCalendar)" href={ics} />
	{/if}
</svelte:head>
