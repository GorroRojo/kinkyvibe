<script>
	import '$lib/styles/style.scss';
	import {
		filteredTags,
		tagManager,
		togglePositiveTagFilterFn,
		wikiTagManager
	} from '$lib/utils/stores';
	import { page } from '$app/stores';
	import { browser } from '$app/environment';
	import { useSiteTags } from '$lib/utils/siteTags.js';
	import { withTagDetails } from '$lib/utils/tagDetails.js';

	/** @type {import('./$types').LayoutData} */
	export let data;
	// El árbol de la base (docs/etiquetas.md); null = el del archivo (respaldo). Llega liviano; las
	// páginas que muestran descripciones o relacionadas mandan esos detalles aparte
	// (`siteTagDetails`, $lib/utils/tagDetails.js). Solo en el navegador: en el servidor los stores
	// ya tienen el árbol completo de este pedido (hooks.server.js) y no hay que pisarlo.
	$: if (browser)
		useSiteTags(withTagDetails(data.siteTags, $page.data.siteTagDetails), [
			tagManager,
			wikiTagManager
		]);

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
	<link rel="icon" href="/favicon-32x32.png" />
	<meta name="theme-color" content="hsl(262, 90%, 60%)" />
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
