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
	// Lato latin 400 y 700 (las de style.scss): con `?url` Vite da la misma URL con hash que usa el
	// @font-face, así el preload y el CSS piden el mismo archivo.
	import lato400 from '$lib/styles/fonts/lato-latin-400-normal.woff2?url';
	import lato700 from '$lib/styles/fonts/lato-latin-700-normal.woff2?url';

	/** @type {import('./$types').LayoutData} */
	export let data;
	// El árbol de la base (docs/etiquetas.md); null = el del archivo (respaldo).
	$: useSiteTags(data.siteTags, [tagManager, wikiTagManager]);

	// Modo demo (docs/demo.md): constante de compilación, como PREVIEW_BUILD en el servidor. En
	// el build de producción es `false` y el botón de recargar datos no entra en el bundle.
	const PREVIEW = __DEPLOY_BRANCH__ !== '' && __DEPLOY_BRANCH__ !== 'main';
	/** @type {any} */
	let DemoReload = null;
	if (PREVIEW) {
		import('$lib/components/admin/DemoReload.svelte').then((m) => (DemoReload = m.default));
	}
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
	<!-- Las dos letras de casi todo el texto se piden ya con el HTML, sin esperar a que llegue y se
	     lea el CSS: menos tiempo con la letra de reemplazo y menos salto al cambiar (`font-display`
	     sigue en `swap`). Solo las latin: las latin-ext casi nunca hacen falta. -->
	<link rel="preload" as="font" type="font/woff2" href={lato400} crossorigin="anonymous" />
	<link rel="preload" as="font" type="font/woff2" href={lato700} crossorigin="anonymous" />
	<link rel="icon" href="/favicon-32x32.png" />
	<meta name="theme-color" content="hsl(319, 90%, 60%)" />
</svelte:head>

{#if $page.data.demoMode && /^\/(admin|edit)(\/|$)/.test($page.url.pathname)}
	<!-- Preview deploys only (docs/demo.md) -->
	<p class="demo-banner" role="status">
		🧪 <strong>Modo demo:</strong> los cambios se guardan solo en la base de prueba.
		{#if DemoReload && $page.data.user?.admin && $page.url.pathname.startsWith('/admin')}
			<svelte:component this={DemoReload} />
		{/if}
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
