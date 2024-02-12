<script>
	import GlosarioTree from '$lib/components/GlosarioTree.svelte';
	import { wikiTagManager, tagManager, query } from '$lib/utils/stores';
	import { page } from '$app/stores';
	import { Search, Construction } from 'lucide-svelte';
	import tagsFactory from '$lib/utils/tags';

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
			wikiTagManager.update(() => tagsFactory());
			$page.url.searchParams.delete('q');
		} else {
			$page.url.searchParams.set('q', newQuery);
			wikiTagManager.update((wtm) => {
				/**@type {TagID[]}*/
				let del = [];
				wtm.tagsData().forEach((t) => {
					console.log(t, newQuery);
					if (
						!includesNormalized(t.id, newQuery) &&
						!includesNormalized(t.visible_name, newQuery) &&
						!includesNormalized(t.description, newQuery) &&
						!includesNormalized(t.aka?.join(' '), newQuery) &&
						!includesNormalized(t.related?.join(' '), newQuery)
					) {
						console.log('i.n. ', includesNormalized(t.id, newQuery), t.id, newQuery);
						console.log('deleting', t.id);
						del.push(t.id);
					}
				});
				if (del.length > 0) {
					let temp = tagsFactory();
					del.forEach((t) => temp.delete(t));
					console.log(temp.entries().length);
					return temp;
				} else return wtm;
			});
		}
	});
	const style = `
	font-size: var(--step-1);
	position:absolute;
	left: .6em;
	translate: 0 .5em;
	color: var(--1);
	z-index: 1;
	`;
	const wip_style = `
	font-size: var(--step-1);
	translate: 0 .1em;
	color: white;
	z-index: 1;
	`;
</script>

<svelte:head>
	<title>Kinkipedia - Enciclopedia Fetichista</title>
</svelte:head>
<p class="callout building" style:--callout-color="var(--2-dark)" style:width="100%">
	<Construction style={wip_style} />
	&ThickSpace; &ThickSpace; En construcción &ThickSpace; &ThickSpace;
	<Construction style={wip_style} />
</p>
<article class="content">
	<h1>Kinkipedia</h1>
	<p class="callout" style:--callout-color="var(--1)">
		El BDSM no es inherentemente abusivo, pero sí puede usarse para ejercer violencia. Si estás en
		una situación de violencia podés contactarte con nosotres o consultar <a
			target="_blank"
			href="https://recursero.info/violencia-sexual/">el recursero</a
		>.
	</p>
	<dl>
		<div class="searchbox">
			<Search {style} />
			<input class="searchbox" type="search" bind:value={$query} />
		</div>
		{#key $wikiTagManager}
			<GlosarioTree />
		{/key}
	</dl>
</article>

<style lang="scss">
	.callout {
		--callout-color: var(--1);
		font-size: var(--step-0);
		background: var(--callout-color);
		color: white;
		padding: 0.5em 0.76em;
		border-radius: 1rem;

		&.building {
			max-width: 100%;
			text-align: center;
			padding-block: 0.3em;
			text-transform: uppercase;
			margin-bottom: 2em;
		}
		a {
			text-decoration: underline var(--2);
			&:hover {
				color: var(--2);
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
	.searchbox {
		width: 100%;
		position: relative;
		/* z-index: -1; */
		/* pointer-events: none; */
	}
	.searchbox input {
		position: relative;
		width: 100%;
		border-radius: 10em;
		font-size: var(--step-1);
		padding: 0.4em 0.8em;
		padding-left: 2em;
		margin-bottom: 1em;
		border: 0;
		outline: 1px solid var(--1-light);

		transition: 100ms;
		&:focus {
			outline-width: 3px;
		}
	}
</style>
