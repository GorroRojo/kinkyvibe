<script>
	/**
	 * `<head>` de la página de un perfil (título con pronombres, descripción e imagen para
	 * compartir). Lo usan las fichas .md y los perfiles de la base.
	 * Props: `title`, `pronoun` (link de pronombr.es o texto), `summary`, `image`, `url`,
	 * `published`, `modified`, `authors`, `tags`, `canonical` (opcional).
	 */
	import { pronounLabel } from '$lib/utils/mentions';

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
	{#if canonical}<link rel="canonical" href={canonical} />{/if}

	<meta property="og:url" content={url} />

	<meta property="og:title" content={title} />
	<meta name="twitter:title" content={title} />

	<meta name="description" content={summary ?? ''} />
	<meta name="twitter:description" content={summary ?? ''} />
	<meta property="og:description" content={summary ?? ''} />

	<meta property="og:image" content={image + ''} />
	<meta name="twitter:image" content={image + ''} />

	<meta name="twitter:site" content="@kinkyvibearg" />
	<meta name="twitter:card" content="summary_large_image" />
	<meta property="og:type" content="article" />

	<meta property="article:published_time" content={published?.toString()} />
	<meta property="article:modified_time" content={modified?.toString()} />
	<meta property="article:author" content={authors.join(', ')} />
	<meta property="article:tag" content={tags.join(', ')} />
</svelte:head>
