<script>
	/**
	 * Error dentro del panel (404 de una dirección que no existe, una ficha que no está, un error
	 * del servidor): se dibuja adentro del marco del panel (+layout.svelte), con el menú y la barra
	 * de arriba, para seguir navegando. Las direcciones de /admin que no coinciden con ninguna ruta
	 * llegan acá por `[...rest]`. Sin permiso (403) o sin sesión, el layout del panel no carga y se
	 * ve la página de error del sitio.
	 */
	import { page } from '$app/stores';
	import { dev } from '$app/environment';
	import { SearchX, TriangleAlert } from '@lucide/svelte';
	import PageHeader from '$lib/components/admin/panel/PageHeader.svelte';
	import EmptyState from '$lib/components/admin/panel/EmptyState.svelte';
	import { panelErrorCopy } from '$lib/admin/panelError.js';

	$: status = $page.status;
	$: copy = panelErrorCopy(status, $page.error?.message ?? '', { dev });
</script>

<PageHeader title={copy.title} subtitle="Error {status}" />

<div class="error">
	<EmptyState icon={status === 404 ? SearchX : TriangleAlert} title={copy.title} text={copy.text}>
		{#if copy.detail}<p class="kv-note">{copy.detail}</p>{/if}
		{#if status >= 500}
			<button class="kv-btn" type="button" on:click={() => window.location.reload()}
				>Probar de nuevo</button
			>
		{/if}
		<a class="kv-btn ghost" href="/admin">Volver al Inicio</a>
	</EmptyState>
</div>

<style>
	.error {
		max-width: 44rem;
	}
</style>
