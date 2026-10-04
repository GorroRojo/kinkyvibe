<script>
	import GlosarioTree from '$lib/components/GlosarioTree.svelte';
	import { wikiTagManager, query } from '$lib/utils/stores';
	import { goto } from '$app/navigation';
	import { freshSiteTags } from '$lib/utils/siteTags.js';
	import SeriesGrid from '$lib/components/series/SeriesGrid.svelte';
	import ChipCombobox from '$lib/components/admin/ChipCombobox.svelte';
	import { wikiOptions, wikiSections, wikiSuggestions } from '$lib/utils/wikiIndex.js';

	/** @type {import('./$types').PageData} */
	export let data;

	query.set('');

	/**
	 * @param {string | undefined} a
	 * @param {string} q
	 */
	function includesNormalized(a, q) {
		if (a === undefined) {
			return false;
		}
		let normalize = (/** @type {string} */ s) =>
			s
				.toLowerCase()
				.replaceAll('á', 'a')
				.replaceAll('é', 'e')
				.replaceAll('í', 'i')
				.replaceAll('ó', 'o')
				.replaceAll('ú', 'u');
		return normalize(a).includes(normalize(q));
	}
	query.subscribe((newQuery) => {
		if (newQuery == undefined || newQuery.trim() == '') {
			wikiTagManager.update(() => freshSiteTags());
			// $page.url.searchParams.delete('q');
		} else {
			// $page.url.searchParams.set('q', newQuery);
			wikiTagManager.update((wtm) => {
				/**@type {TagID[]}*/
				let del = [];
				let temp = freshSiteTags();
				/**@type TagID[]*/
				let include = [];
				temp.tagsData().forEach((t) => {
					// console.log(t, newQuery);
					if (
						!includesNormalized(t.id, newQuery) &&
						!includesNormalized(t.visible_name, newQuery) &&
						!includesNormalized(t.description, newQuery) &&
						!includesNormalized(t.aka?.join(' '), newQuery) &&
						!includesNormalized(t.related?.join(' '), newQuery)
					) {
						// console.log('i.n. ', includesNormalized(t.id, newQuery), t.id, newQuery);
						// console.log('deleting', t.id);
						del.push(t.id);
					} else {
						include.push(...t.getAllParents());
					}
				});
				if (del.length > 0) {
					// console.log(temp.entries().length);
					del.forEach((t) => (!include.includes(t) ? temp.delete(t) : null));
					// console.log(temp.entries().length);
					return temp;
				} else return wtm;
			});
		}
	});
	// El índice y el buscador salen del árbol entero (no del filtrado mientras se escribe).
	const fullTree = freshSiteTags();
	const sections = wikiSections(fullTree);
	const options = wikiOptions(fullTree);
	/** «Ir a una entrada»: el buscador de etiquetas del sitio (ChipCombobox, como en Lo que sigo). */
	const search = (/** @type {string} */ q) => wikiSuggestions(options, q, fullTree);
	/** Sin coincidencias, lo dice en vez de cerrar la lista (como el buscador de las listas). */
	const extra = (
		/** @type {string} */ q,
		/** @type {string[]} */ _v,
		/** @type {unknown[]} */ found
	) =>
		q.trim() && !found.length
			? {
					value: '',
					label: `Ninguna entrada se llama «${q.trim()}»: abajo filtramos el texto.`,
					disabled: true
				}
			: null;
	/** Elegir una sugerencia lleva a su página (no queda como chip). */
	const pick = (/** @type {string[]} */ values, /** @type {string} */ href) => {
		if (href) goto(href);
		return values;
	};
</script>

<svelte:head>
	<title>Kinkipedia - Enciclopedia Fetichista</title>
</svelte:head>
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
					<li><a href="#series"><span aria-hidden="true">🔁</span> Series</a></li>
				{/if}
				{#each sections as sec (sec.id)}
					<li>
						<a href={sec.anchor}
							>{#if sec.icon}<span aria-hidden="true">{sec.icon}</span>
							{/if}{sec.name}</a
						>
					</li>
				{/each}
			</ul>
		</nav>
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
