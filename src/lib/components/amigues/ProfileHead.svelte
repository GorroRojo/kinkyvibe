<script>
	/**
	 * `<head>` de la página de un perfil (título con pronombres, descripción e imagen para
	 * compartir). Lo usan las fichas .md y los perfiles de la base.
	 * Props: `title`, `pronoun` (link de pronombr.es o texto), `summary`, `image`, `url`,
	 * `published`, `modified`, `authors`, `tags`, `canonical` (opcional), `noindex` (no listado).
	 * La vista previa al compartir (Open Graph, Twitter, canónica) la pone `SeoHead`.
	 */
	import { pronounLabel } from '$lib/utils/mentions';
	import SeoHead from '$lib/components/SeoHead.svelte';
	import { SITE_NAME } from '$lib/utils/seo.js';
	import { isoDateTime } from '$lib/utils/dates.js';

	export let title = '';
	/** @type {string | null | undefined} */
	export let pronoun = undefined;
	/** @type {string | null | undefined} */
	export let summary = undefined;
	/** @type {string | null | undefined} */
	export let image = undefined;
	export let url = '';
	/** @type {string | null | undefined} */
	export let published = undefined;
	/** @type {string | null | undefined} */
	export let modified = undefined;
	/** @type {string[]} */
	export let authors = [];
	/** @type {string[]} */
	export let tags = [];
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
	<title>{title} {shownPronoun ? `| ${shownPronoun}` : ''}</title>
	<link rel="icon" href="/favicon-32x32.png" />
	<meta name="theme-color" content="hsl(319, 90%, 60%)" />
	<meta property="article:published_time" content={isoDateTime(published)} />
	<meta property="article:modified_time" content={isoDateTime(modified)} />
	<meta property="article:author" content={authors.join(', ')} />
	<meta property="article:tag" content={tags.join(', ')} />
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
