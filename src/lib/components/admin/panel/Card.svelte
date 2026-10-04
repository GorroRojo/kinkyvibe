<script>
	/**
	 * Tarjeta blanca redondeada, como las del sitio.
	 * Props: `title` (opcional, h2), `padded` (default true), `tag` (default 'section'),
	 * `icon` (opcional: componente de Lucide al lado del título).
	 * Slots: default; `actions` (a la derecha del título, ej. un CsvButton).
	 */
	/** @type {string} */
	export let title = '';
	export let padded = true;
	/** @type {string} */
	export let tag = 'section';
	/** @type {any} */
	export let icon = null;
</script>

<svelte:element this={tag} class="card" class:padded>
	{#if title || $$slots.actions}
		<header>
			{#if title}<h2>
					{#if icon}<svelte:component this={icon} size={20} aria-hidden="true" />{/if}{title}
				</h2>{/if}
			{#if $$slots.actions}<div class="actions"><slot name="actions" /></div>{/if}
		</header>
	{/if}
	<slot />
</svelte:element>

<style>
	.card {
		background: var(--surface);
		color: var(--text);
		border-radius: var(--card-round);
		box-shadow: var(--shadow);
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-2xs);
	}
	.padded {
		padding: var(--space-s) var(--space-s);
	}
	header {
		display: flex;
		gap: var(--space-2xs);
		align-items: center;
		flex-wrap: wrap;
	}
	/* Sin relleno (una tabla o una lista de borde a borde), el título igual va con el margen de
	   la tarjeta. */
	.card:not(.padded) > header {
		padding: var(--space-s) var(--space-s) 0;
	}
	h2 {
		font-size: var(--step-0-5, 1.2rem);
		margin: 0;
		display: inline-flex;
		align-items: center;
		gap: 0.4em;
	}
	h2 :global(svg) {
		color: var(--accent);
	}
	.actions {
		margin-left: auto;
		display: flex;
		gap: var(--space-2xs);
		flex-wrap: wrap;
	}
</style>
