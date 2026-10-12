<script>
	/**
	 * La miniatura de un evento en el recuadro «Hoy» del Inicio del panel: la portada que usan las
	 * tarjetas del sitio, en un cuadrado fijo de 64 px (no mueve nada mientras carga). En producción
	 * va achicada (`thumbnailUrl`, seo.js); sin portada no se muestra nada (ni un cuadrado vacío).
	 */
	import { thumbnailUrl } from '$lib/utils/seo.js';

	/** La portada del evento (`thumb` de los eventos próximos); '' si no tiene. */
	export let src = '';
	/** El host de la página: solo en producción se pide la versión achicada. */
	export let host = '';
	/** '' cuando el título ya está al lado (el caso del recuadro «Hoy»). */
	export let alt = '';

	$: url = thumbnailUrl(src, host);
</script>

{#if url}
	<img class="today-thumb" src={url} {alt} width="64" height="64" loading="lazy" decoding="async" />
{/if}

<style>
	.today-thumb {
		flex: none;
		display: block;
		width: 64px;
		height: 64px;
		object-fit: cover;
		border-radius: var(--radius-s);
		background: var(--surface-2);
		box-shadow: 0 0 0 2px color-mix(in srgb, var(--surface) 55%, transparent);
	}
</style>
