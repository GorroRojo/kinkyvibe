<script>
	/**
	 * La vista previa al compartir una lista (Calendario, Material, Amigues, Todo), con sus filtros
	 * de la dirección (`?tags=`, `?q=` y, en Amigues, `?tipo=`): «Amigues · terapia» /
	 * «Amigues con la etiqueta terapia. Profesionales, proyectos…». Las etiquetas se nombran como se ven
	 * (alias resueltos, árbol de la base). `og:url` guarda los filtros (normalizados y ordenados);
	 * la canónica, no: para los buscadores la lista es una sola (docs/compartir.md).
	 *
	 * Props: `section` (clave de `LIST_SECTIONS`, que tiene el título y la descripción de cada
	 * sección), `description` sin filtros si no es la de la sección (el calendario suma los
	 * próximos eventos), `card`
	 * (la tarjeta de la sección, clave de `OG_CARDS`) y `kinds` (los `?tipo=` que la lista conoce).
	 */
	import { page } from '$app/stores';
	import { tagManager } from '$lib/utils/stores';
	import SeoHead from './SeoHead.svelte';
	import {
		LIST_SECTIONS,
		cardImage,
		filteredListUrl,
		listFilters,
		listPreview
	} from '$lib/utils/seo.js';

	/** @type {keyof typeof import('$lib/utils/seo.js').LIST_SECTIONS} */
	export let section;
	/** @type {string | undefined} */
	export let description = undefined;
	/** @type {keyof typeof import('$lib/utils/ogCards.js').OG_CARDS} */
	export let card = 'default';
	/** @type {Readonly<Record<string, string>> | undefined} */
	export let kinds = undefined;

	$: filters = listFilters($page.url, $tagManager, { kinds });
	$: plain = {
		title: LIST_SECTIONS[section].heading,
		description: description ?? LIST_SECTIONS[section].description
	};
	$: preview = listPreview(section, filters, plain);
	$: image = cardImage(card);
</script>

<SeoHead
	title={preview.title}
	description={preview.description}
	image={image.url}
	imageInfo={image}
	ogUrl={filteredListUrl($page.url, filters)}
/>
