<script>
	/**
	 * Puerta con link (/puerta, /puerta/<slug>): sin el marco del panel ni del sitio. Solo los
	 * tokens del panel (`.kv-panel`, como el modo puerta del panel con `bare: true`), que usan la
	 * pantalla y sus diálogos. Ver $lib/server/tickets/doorLinks.js.
	 */
	import '$lib/admin/panel.scss';
</script>

<svelte:head>
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

<div class="kv-panel">
	<slot />
</div>
