<script>
	/**
	 * "Edición N de <serie>" con links a la edición anterior y a la siguiente (página de un evento).
	 * Props: `series` = { name, href, icon, number, total, prev, next } (de eventSeries en
	 * $lib/server/series/index.js; `prev`/`next` son Edition o null).
	 */
	import { ChevronLeft, ChevronRight } from '@lucide/svelte';
	import { editionDateLabel } from '$lib/utils/series.js';

	/** @type {{ name: string, href: string, icon: string, number: number, total: number, prev: import('$lib/utils/series.js').Edition | null, next: import('$lib/utils/series.js').Edition | null }} */
	export let series;
</script>

<nav class="edition-nav" aria-label="Ediciones de {series.name}">
	<p class="which">
		Edición {series.number} de
		<a href={series.href}>{series.icon ? `${series.icon} ` : ''}{series.name}</a>
	</p>
	<div class="steps">
		{#if series.prev}
			<a class="step prev" href={series.prev.path} rel="prev">
				<ChevronLeft size={18} aria-hidden="true" />
				<span
					><small>Anterior · #{series.prev.number}</small>{editionDateLabel(series.prev.start)}</span
				>
			</a>
		{:else}
			<span class="step none"></span>
		{/if}
		{#if series.next}
			<a class="step next" href={series.next.path} rel="next">
				<span
					><small>Siguiente · #{series.next.number}</small>{editionDateLabel(
						series.next.start
					)}</span
				>
				<ChevronRight size={18} aria-hidden="true" />
			</a>
		{/if}
	</div>
</nav>

<style>
	.edition-nav {
		width: min(40rem, 100%);
		margin: 0.4em auto 1em;
		display: grid;
		gap: 0.4em;
		text-align: center;
	}
	.which {
		margin: 0;
		font-size: var(--step-0);
		color: var(--muted);
	}
	.which a {
		color: var(--2-dark);
		font-weight: 700;
	}
	.steps {
		display: flex;
		justify-content: space-between;
		gap: 0.6em;
	}
	.step {
		display: inline-flex;
		align-items: center;
		gap: 0.3em;
		min-height: var(--tap);
		padding: 0.3em 0.8em;
		border-radius: var(--round-pill);
		background: var(--surface);
		box-shadow: var(--shadow);
		color: var(--ink);
		text-decoration: none;
		font-size: var(--step--1);
	}
	.step:hover {
		background: var(--2-tint);
	}
	.step span {
		display: grid;
		text-align: left;
	}
	.step.next span {
		text-align: right;
	}
	.step small {
		color: var(--muted);
		font-size: var(--step--2);
	}
	.step.none {
		visibility: hidden;
	}
</style>
