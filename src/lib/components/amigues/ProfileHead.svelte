<script>
	/**
	 * `<head>` de la página de un perfil (título con pronombres, descripción e imagen para
	 * compartir). Lo usan las fichas .md y los perfiles de la base.
	 * Props: `title`, `pronoun` (link de pronombr.es o texto), `summary`, `image`, `url`,
	 * `canonical` (opcional), `noindex` (no listado).
	 * La vista previa al compartir (Open Graph, Twitter, canónica) la pone `SeoHead`.
	 */
	import { pronounLabel } from '$lib/utils/mentions';
	import SeoHead from '$lib/components/SeoHead.svelte';
	import { SITE_NAME } from '$lib/utils/seo.js';

	export let title = '';
	/** @type {string | null | undefined} */
	export let pronoun = undefined;
	/** @type {string | null | undefined} */
	export let summary = undefined;
	/** @type {string | null | undefined} */
	export let image = undefined;
	export let url = '';
	/** @type {string | null} */
	export let canonical = null;
	/** No listado: sin `noindex` los buscadores lo guardarían. */
	export let noindex = false;

	$: shownPronoun =
		pronoun && (pronoun + '').split('/').pop() != 'evitar'
			? (pronoun + '').startsWith('https')
				? pronounLabel(pronoun)
				: pronoun
			: '';
</script>

<svelte:head>
	<title>{title}{shownPronoun ? ` | ${shownPronoun}` : ''} · {SITE_NAME}</title>
	<link rel="icon" href="/favicon-32x32.png" />
	<meta name="theme-color" content="hsl(319, 90%, 60%)" />
	<!-- Sin `article:*`: son de `og:type` article y un perfil es `profile` (docs/compartir.md). -->
</svelte:head>
<SeoHead
	{title}
	description={summary || `${title} en Amigues de ${SITE_NAME}.`}
	{image}
	imageAlt={title}
	type="profile"
	canonical={canonical || url}
	{noindex}
/>
