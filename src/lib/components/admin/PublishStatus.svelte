<script>
	/**
	 * En qué quedó un guardado del panel. Todo se guarda en la base y se ve enseguida (decisión
	 * 0032: el panel ya no abre PRs de contenido en GitHub). `pr` es de cuando un guardado era un PR
	 * que se mergeaba solo: ya no llega, pero se acepta para no cambiar a quien lo usa.
	 */

	/** @type {null | undefined | {number?: number, url?: string}} */
	export let pr = null;
	/** Link a lo guardado (en la base: la página de la publicación). */
	/** @type {string | null | undefined} */
	export let commitUrl = null;
	$: shownUrl = commitUrl ?? pr?.url ?? null;
</script>

{#if shownUrl?.startsWith('/')}
	<!-- Se guardó en la base y ya se ve (sin PR ni deploy). -->
	<span class="publish-status" role="status">
		Guardado en la base: ya se ve en el sitio (<a href={shownUrl} target="_blank" rel="noreferrer"
			>ver</a
		>).
	</span>
{:else if pr}
	<span class="publish-status" role="status">Guardado: ya se ve en el sitio.</span>
{/if}

<style>
	.publish-status {
		overflow-wrap: anywhere;
	}
</style>
