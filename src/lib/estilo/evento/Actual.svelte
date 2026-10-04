<script>
	/**
	 * Referencia: la página real del evento (calendario/[event]/+page.svelte) con los mismos datos
	 * inventados que las maquetas, para compararlas sin buscar un evento parecido en la base.
	 */
	import Page from '../../../routes/(content)/calendario/[event]/+page.svelte';
	import ContenidoLargo from './ContenidoLargo.svelte';
	import { pageData } from './datos.js';

	/** @type {any} */
	const data = { ...pageData(), content: ContenidoLargo, html: undefined, css: '', parts: null };
</script>

<Page {data} />
