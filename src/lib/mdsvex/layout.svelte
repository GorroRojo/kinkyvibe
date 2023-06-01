<script>
	export let title = '';
</script>

<h1>{title}</h1>
<slot />

<style lang="scss">
	h1 {
		font-size: 2em;
	}
	:global(article *) {
		font-size: 1.5rem;
	}
	:global(strong) {
		color: var(--2);
		font-weight: black;
	}
	:global(img) {
		margin-inline: auto;
		position: relative;
		width: 100%;
		object-fit: contain;
		border-radius: 1em;
	}
	:global(pre) {
		padding: 1em;
		border-radius: 1em;
		box-shadow: inset 0 0 1em rgba(1, 1, 1, 0.1);
	}
	:global(code) {
		padding: 0.1em 0.4em;
		border-radius: 0.4em;
		font-family: 'Courier New', Courier, monospace !important;
		font-size: 0.9em;
	}
	:global(code span.token) {
		font-family: 'Courier New', Courier, monospace !important;
	}
	:global(code, pre) {
		background: var(--3);
	}
	:global(.col-2),
	:global(.col-3),
	:global(.col-4) {
		display: grid;
		gap: 0.5em;
		margin-block: 1em;
		margin-inline: -4em;
		max-width: 100vw;
	}
	@media (max-width: 900px) {
		:global(.col-2),
		:global(.col-3),
		:global(.col-4) {
			margin-inline: 0;
		}
	}
	:global(.col-2) {
		grid-template-columns: 1fr 1fr;
	}
	:global(.col-3) {
		grid-template-columns: 1fr 1fr 1fr;
	}
	:global(.col-4) {
		grid-template-columns: 1fr 1fr 1fr 1fr;
	}
</style>
