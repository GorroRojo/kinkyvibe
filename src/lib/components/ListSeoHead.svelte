<script>
	/**
	 * La vista previa al compartir una lista (Calendario, Material, Amigues, Todo), con sus filtros
	 * de la dirección (`?tags=`, `?q=` y, en Amigues, `?tipo=`): «Amigues · terapia» /
	 * «Profesionales y proyectos con la etiqueta terapia.». Las etiquetas se nombran como se ven
	 * (alias resueltos, árbol de la base). `og:url` guarda los filtros (normalizados y ordenados);
	 * la canónica, no: para los buscadores la lista es una sola (docs/compartir.md).
	 *
	 * Props: `section` (clave de `LIST_SECTIONS`), `title` y `description` sin filtros, `card`
	 * (la tarjeta de la sección, clave de `OG_CARDS`) y `kinds` (los `?tipo=` que la lista conoce).
	 */
	import { page } from '$app/stores';
	import { tagManager } from '$lib/utils/stores';
	import SeoHead from './SeoHead.svelte';
	import { cardImage, filteredListUrl, listFilters, listPreview } from '$lib/utils/seo.js';

	/** @type {keyof typeof import('$lib/utils/seo.js').LIST_SECTIONS} */
	export let section;
	export let title = '';
	export let description = '';
	/** @type {keyof typeof import('$lib/utils/ogCards.js').OG_CARDS} */
	export let card = 'default';
	/** @type {Readonly<Record<string, string>> | undefined} */
	export let kinds = undefined;

	$: filters = listFilters($page.url, $tagManager, { kinds });
	$: preview = listPreview(section, filters, { title, description });
	$: image = cardImage(card);
</script>

<SeoHead
	title={preview.title}
	description={preview.description}
	image={image.url}
	imageInfo={image}
	ogUrl={filteredListUrl($page.url, filters)}
/>
