<script>
	// Caja de aviso al pie de un post ("Este material fue proporcionado por…", "Fecha de
	// publicación original…"). Antes eran texto blanco sobre violeta claro (contraste 2.9:1);
	// ahora tinte violeta con texto oscuro, como los avisos del panel.
	/** @type {string | undefined} */
	export let id = undefined;
	/** Clases extra (p. ej. microformatos como `h-cite`). */
	export let className = '';
</script>

<div {id} class="note {className}"><slot /></div>

<style>
	.note {
		max-width: 50rem;
		width: calc(100% - 32px);
		margin: 1.5em auto;
		padding: 1em 1.2em;
		background: var(--2-tint);
		color: var(--ink);
		border-radius: var(--round);
		font-size: var(--step-0);
		line-height: 1.5;
	}
	.note :global(a) {
		color: var(--2-dark);
		font-weight: 700;
		text-decoration-color: var(--1);
		text-underline-offset: 0.15em;
	}
	.note :global(a:hover) {
		color: var(--1-ink);
	}
</style>
