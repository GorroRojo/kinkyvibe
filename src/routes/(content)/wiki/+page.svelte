<script>
	import SeoHead from '$lib/components/SeoHead.svelte';
	import { cardImage, kinkipediaPreview, linkPreviewOf } from '$lib/utils/seo.js';
	import { page } from '$app/stores';
	// La vista previa con los textos del panel y la tarjeta de la Kinkipedia (docs/compartir.md).
	$: lp = linkPreviewOf($page.data);
	$: KINKIPEDIA_CARD = cardImage('wiki', lp);
	$: KINKIPEDIA_PREVIEW = kinkipediaPreview(lp.texts);
	import GlosarioTree from '$lib/components/GlosarioTree.svelte';
	import { wikiTagManager, query, searchOpen, searchPrefill } from '$lib/utils/stores';
	import { SearchX } from '@lucide/svelte';
	import EmptyState from '$lib/components/admin/panel/EmptyState.svelte';
	import { goto } from '$app/navigation';
	import { freshSiteTags } from '$lib/utils/siteTags.js';
	import SeriesGrid from '$lib/components/series/SeriesGrid.svelte';
	import ChipCombobox from '$lib/components/admin/ChipCombobox.svelte';
	import {
		filterWikiTree,
		wikiOptions,
		wikiSections,
		wikiSuggestions
	} from '$lib/utils/wikiIndex.js';

	/** @type {import('./$types').PageData} */
	export let data;

	query.set('');

	/** El árbol filtrado con lo último escrito (lo usan el árbol de abajo y la lista del buscador,
	 * así no importa cuál pregunte primero). */
	let filtered = { q: '', tree: freshSiteTags() };
	/** @param {string} q */
	function filteredTree(q) {
		if (filtered.q !== q) filtered = { q, tree: filterWikiTree(freshSiteTags(), q) };
		return filtered.tree;
	}
	query.subscribe((newQuery) => {
		wikiTagManager.update(() => (newQuery?.trim() ? filteredTree(newQuery) : freshSiteTags()));
	});
	// El índice y el buscador salen del árbol entero (no del filtrado mientras se escribe).
	const fullTree = freshSiteTags();
	const sections = wikiSections(fullTree);
	const options = wikiOptions(fullTree);
	/** «Ir a una entrada»: el buscador de etiquetas del sitio (ChipCombobox, como en Lo que sigo). */
	const search = (/** @type {string} */ q) => wikiSuggestions(options, q, fullTree);
	/** Sin coincidencias, lo dice en vez de cerrar la lista (como el buscador de las listas). Si
	 * tampoco hay texto que coincida, la lista se cierra: abajo lo dice el EmptyState (si no, la
	 * lista lo tapaba y prometía un filtro que no encontró nada). */
	const extra = (
		/** @type {string} */ q,
		/** @type {string[]} */ _v,
		/** @type {unknown[]} */ found
	) =>
		q.trim() && !found.length && wikiSections(filteredTree(q)).length > 0
			? {
					value: '',
					label: `Ninguna entrada se llama «${q.trim()}»: abajo filtramos el texto.`,
					disabled: true
				}
			: null;
	// Sin nada que coincida con lo escrito, en vez de una página vacía: EmptyState y el buscador
	// de todo el sitio.
	$: noResults = Boolean($query?.trim()) && wikiSections($wikiTagManager).length === 0;
	/** Elegir una sugerencia lleva a su página (no queda como chip). */
	const pick = (/** @type {string[]} */ values, /** @type {string} */ href) => {
		if (href) goto(href);
		return values;
	};
	import LDTag from '$lib/components/LDTag.svelte';
	import { kinkipediaSchema } from '$lib/utils/jsonLd.js';
</script>

<svelte:head>
	<title>Kinkipedia - Enciclopedia Fetichista</title>
</svelte:head>
<!-- La vista previa al compartir (docs/compartir.md). -->
<SeoHead
	title={KINKIPEDIA_PREVIEW.title}
	description={KINKIPEDIA_PREVIEW.description}
	image={KINKIPEDIA_CARD.url}
	imageInfo={KINKIPEDIA_CARD}
/>
<article class="content">
	<h1>Kinkipedia</h1>
	<p class="callout" style:--callout-color="var(--1-dark)">
		El BDSM no es inherentemente abusivo, pero sí puede usarse para ejercer violencia. Si estás en
		una situación de violencia podés contactarte con nosotres o consultar <a
			target="_blank"
			href="https://recursero.info/violencia-sexual/">el recursero</a
		>.
	</p>

	<div class="searchbox">
		<label class="visually-hidden" for="wiki-buscar">Buscar en la Kinkipedia</label>
		<ChipCombobox
			values={[]}
			id="wiki-buscar"
			look="search"
			placeholder="Buscá una práctica, un implemento, una serie…"
			{search}
			{extra}
			add={pick}
			onQuery={(q) => query.set(q)}
			addedMessage={(label) => `Abriendo ${label}…`}
		/>
	</div>
	{#if sections.length && !$query?.trim()}
		<nav class="sections" aria-label="Secciones de la Kinkipedia">
			<ul>
				{#if data.series?.length}
					<li>
						<a class="tap-target" href="#series"><span aria-hidden="true">🔁</span> Series</a>
					</li>
				{/if}
				{#each sections as sec (sec.id)}
					<li>
						<a class="tap-target" href={sec.anchor}
							>{#if sec.icon}<span aria-hidden="true">{sec.icon}</span>
							{/if}{sec.name}</a
						>
					</li>
				{/each}
			</ul>
		</nav>
	{/if}

	{#if noResults}
		<EmptyState
			icon={SearchX}
			title="No encontramos «{$query.trim()}» en la Kinkipedia"
			text="Probá con otra palabra, o buscalo en todo el sitio: eventos, material y amigues."
		>
			<button
				type="button"
				class="pill-btn ghost"
				on:click={() => {
					searchPrefill.set($query.trim());
					searchOpen.set(true);
				}}>Buscar en todo el sitio</button
			>
		</EmptyState>
	{/if}
	<dl>
		{#key $wikiTagManager}
			<GlosarioTree />
		{/key}
	</dl>
	{#if data.series?.length && !$query?.trim()}
		<section class="series" id="series" aria-labelledby="series-title">
			<h2 id="series-title">Series</h2>
			<p class="series-intro">
				Eventos que se repiten: cada serie tiene su página con todas sus ediciones.
			</p>
			<SeriesGrid series={data.series} />
		</section>
	{/if}
	<p
		class="callout"
		style:--callout-color="var(--4)"
		style:--callout-secondary="white"
		style:color="var(--1-ink)"
	>
		Esta kinkipedia está escrita, editada y organizada con sudor y posicionamiento político por <a
			href="/amigues/DemonWeb">@DemonWeb <small class="p-pronoun">él</small></a
		> <a href="/amigues/Gorro_Rojo">@Gorro_Rojo <small class="p-pronoun">eso/elle</small></a> y
		<a href="/amigues/KinkyBunny">@KinkyBunny <small class="p-pronoun">ellx</small></a>.
	</p>
</article>
<!-- La Kinkipedia como conjunto de términos (schema.org, jsonLd.js). -->
<LDTag schema={kinkipediaSchema()} />

<style lang="scss">
	.callout {
		--callout-color: var(--1);
		--callout-secondary: var(--2);
		font-size: var(--step-0);
		background: var(--callout-color);
		color: white;
		padding: 0.6em 0.9em;
		border-radius: var(--round);

		a {
			text-decoration: underline var(--callout-secondary);
			&:hover {
				color: var(--callout-secondary);
			}
		}
	}
	article {
		max-width: 50rem;
		margin: auto;
		font-size: var(--step-1);
		h1 {
			text-align: left;
		}
	}
	.series {
		margin: 1.5em 0;
		h2 {
			text-align: left;
			margin-bottom: 0.2em;
		}
	}
	.series-intro {
		margin: 0 0 0.8em;
		font-size: var(--step-0);
	}
	.searchbox {
		width: 100%;
		position: relative;
		margin: 1em 0 0.6em;
		font-size: var(--step-0);
	}
	.sections ul {
		list-style: none;
		margin: 0 0 1em;
		padding: 0;
		display: flex;
		flex-wrap: wrap;
		gap: 0.4em;
		font-size: var(--step--1);
	}
	.sections li {
		margin: 0;
		&::before {
			content: none;
		}
	}
	.sections a {
		display: inline-flex;
		align-items: center;
		gap: 0.3em;
		padding: 0.25em 0.75em;
		border-radius: 2em;
		outline: 1px solid var(--1-light);
		text-decoration: none;
		color: var(--1-dark, var(--1));
		&:hover,
		&:focus-visible {
			background: color-mix(in srgb, var(--1) 12%, transparent);
		}
	}
</style>
