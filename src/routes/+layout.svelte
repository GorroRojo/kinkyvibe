<script>
	import '$lib/styles/style.scss';
	import {
		filteredTags,
		tagManager,
		togglePositiveTagFilterFn,
		wikiTagManager
	} from '$lib/utils/stores';
	import { page } from '$app/stores';
	import { useSiteTags } from '$lib/utils/siteTags.js';

	/** @type {import('./$types').LayoutData} */
	export let data;
	// El árbol de la base (docs/etiquetas.md); null = el del archivo (respaldo).
	$: useSiteTags(data.siteTags, [tagManager, wikiTagManager]);
	// onMount(() => {
	filteredTags.set([]);
	// });
	togglePositiveTagFilterFn.update(
		() =>
			function (checked, tag) {
				// PostList mirrors filteredTags into ?tags=
				filteredTags.update((fTags) =>
					checked ? [...fTags.filter((t) => t != tag), tag] : fTags.filter((t) => t != tag)
				);
			}
	);
</script>

<svelte:head>
	<link rel="icon" href="/favicon-32x32.png" />
	<meta name="theme-color" content="hsl(319, 90%, 60%)" />
	<meta property="og:url" content={$page.url.href} />
</svelte:head>

{#if $page.data.demoMode && /^\/(admin|edit)(\/|$)/.test($page.url.pathname)}
	<!-- Preview deploys only (docs/demo.md) -->
	<p class="demo-banner" role="status">
		🧪 <strong>Modo demo:</strong> los cambios se guardan solo en la base de prueba.
	</p>
{/if}

<slot></slot>

<style>
	.demo-banner {
		margin: 0;
		padding: 0.4em 1em;
		text-align: center;
		background: #fff3b0;
		color: #4a3b00;
		font-size: var(--step--1, 0.9rem);
		border-bottom: 2px dashed #d9b400;
	}
</style>
