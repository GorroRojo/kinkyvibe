<script>
	/**
	 * Tarjeta redondeada del panel.
	 * Props: `title` (opcional, h2), `padded` (default true), `tag` (default 'section').
	 * Slots: default; `actions` (a la derecha del título, ej. un CsvButton).
	 */
	/** @type {string} */
	export let title = '';
	export let padded = true;
	/** @type {string} */
	export let tag = 'section';
</script>

<svelte:element this={tag} class="card" class:padded>
	{#if title || $$slots.actions}
		<header>
			{#if title}<h2>{title}</h2>{/if}
			{#if $$slots.actions}<div class="actions"><slot name="actions" /></div>{/if}
		</header>
	{/if}
	<slot />
</svelte:element>

<style>
	.card {
		background: var(--surface);
		color: var(--text);
		border-radius: 1rem;
		box-shadow: var(--shadow);
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 0.7rem;
	}
	.padded {
		padding: 1.1rem 1.2rem;
	}
	header {
		display: flex;
		gap: 0.6rem;
		align-items: center;
		flex-wrap: wrap;
	}
	h2 {
		font-size: 1.1rem;
		margin: 0;
	}
	.actions {
		margin-left: auto;
		display: flex;
		gap: 0.5rem;
		flex-wrap: wrap;
	}
</style>
