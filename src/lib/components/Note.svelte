<script>
	// Caja de aviso al pie de un post ("Este material fue proporcionado por…", "Fecha de
	// publicación original…"). Violeta con texto blanco como antes, pero con el violeta
	// principal (el claro daba contraste 2.9:1; este, 5.4:1).
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
		background: var(--2);
		color: white;
		border-radius: var(--round);
		font-size: var(--step-0);
		line-height: 1.5;
	}
	.note :global(a) {
		color: white;
		text-decoration-color: var(--4-light);
		text-underline-offset: 0.15em;
	}
	.note :global(a:hover) {
		color: var(--4-light);
	}
	.note :global(a:focus-visible) {
		outline-color: white;
	}
</style>
