<script>
	/**
	 * La vista previa de la página al compartir el link (WhatsApp, Telegram, Instagram, X…) y lo
	 * que leen los buscadores: `description`, Open Graph (`og:*`), Twitter (`twitter:*`) y la
	 * dirección canónica. Todas las direcciones van enteras (`https://…`). No pone el `<title>`:
	 * cada página pone el suyo. Las etiquetas salen de `seoTags` (src/lib/utils/seo.js; ver
	 * docs/compartir.md).
	 *
	 * Props: `title`, `description`, `image` (relativa o entera; sin imagen, el logo),
	 * `imageInfo` (medidas y texto alternativo, si se conocen), `imageAlt` (texto alternativo si
	 * `imageInfo` no trae), `type` (`website`, `article`, `event`, `profile`), `canonical`
	 * (relativa o entera; por defecto, la dirección de la página sin `?…`), `ogUrl` (la dirección
	 * para `og:url` si no es la canónica: una lista filtrada guarda sus filtros) y `noindex`
	 * (no listado).
	 */
	import { page } from '$app/stores';
	import { absoluteUrl, canonicalUrl, previewImage, seoTags } from '$lib/utils/seo.js';

	export let title = '';
	/** @type {unknown} */
	export let description = '';
	/** @type {unknown} */
	export let image = undefined;
	/** @type {import('$lib/utils/seo.js').ImageInfo | null | undefined} */
	export let imageInfo = undefined;
	export let imageAlt = '';
	/** @type {'website' | 'article' | 'event' | 'profile'} */
	export let type = 'website';
	/** @type {string | null | undefined} */
	export let canonical = undefined;
	/** @type {string | null | undefined} */
	export let ogUrl = undefined;
	export let noindex = false;

	$: url = absoluteUrl(canonical, $page.url.origin) || canonicalUrl($page.url);
	$: tags = seoTags({
		title,
		description,
		url: absoluteUrl(ogUrl, $page.url.origin) || url,
		image: previewImage(image, $page.url.origin, imageInfo, imageAlt),
		type,
		noindex
	});
</script>

<svelte:head>
	<link rel="canonical" href={url} />
	{#each tags as [attr, key, content] (key)}
		{#if attr === 'property'}
			<meta property={key} {content} />
		{:else}
			<meta name={key} {content} />
		{/if}
	{/each}
</svelte:head>
