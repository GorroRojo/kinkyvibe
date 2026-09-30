<script>
	// Tarjeta de le autore al pie de un evento o un material (antes copiada igual en las dos
	// páginas). Se ve como un perfil de la lista de amigues: pill blanca con borde violeta.
	/** @type {string} */
	export let href;
	/** @type {string} */
	export let image;
	/** @type {string} */
	export let title;
	/** @type {string} */
	export let summary = '';
</script>

<a class="author-callout" rel="author" {href}>
	<img class="author-image" src={image} alt="" loading="lazy" />
	<span class="author-title">{title}</span>
	{#if summary}<span class="author-summary">{summary}</span>{/if}
</a>

<style>
	/* same look as a profile in the amigues list: white pill with a violet outline */
	.author-callout {
		display: grid;
		grid-template-areas: 'img title' 'img summary';
		grid-template-columns: 6rem minmax(0, 1fr);
		align-items: center;
		column-gap: 1.1rem;
		row-gap: 0.3rem;
		max-width: 50rem;
		width: calc(100% - 32px);
		margin: 1em auto;
		padding: 0.5rem 2.5rem 0.5rem 0.5rem;
		background: var(--surface);
		border-radius: 999em;
		outline: 2px solid var(--2);
		box-shadow: var(--shadow);
		color: var(--ink);
		text-decoration: none;
		transition: scale 100ms;
	}
	.author-callout:hover {
		color: var(--ink);
		scale: 1.02;
	}
	.author-image {
		grid-area: img;
		width: 6rem;
		aspect-ratio: 1;
		object-fit: cover;
		border-radius: 50%;
	}
	.author-title {
		grid-area: title;
		align-self: end;
		font-size: var(--step-2);
		font-weight: 700;
		line-height: 1.15;
		text-decoration: underline var(--1);
		text-underline-offset: 0.15em;
	}
	.author-summary {
		grid-area: summary;
		align-self: start;
		font-size: var(--step-0);
		color: var(--muted);
		line-height: 1.4;
	}
	@media (max-width: 500px) {
		.author-callout {
			grid-template-areas: 'img title' 'summary summary';
			grid-template-columns: 4rem minmax(0, 1fr);
			row-gap: 0.7rem;
			padding: 0.5rem 1.2rem 1.2rem 0.5rem;
			border-radius: 2em;
		}
		.author-image {
			width: 4rem;
		}
		.author-title {
			align-self: center;
		}
		.author-summary {
			padding-left: 0.7rem;
		}
	}
</style>
