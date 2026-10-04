<script>
	/**
	 * Encabezado de una página del panel: título, subtítulo y acciones a la derecha.
	 * Props: `title`, `subtitle` (opcional), `back` (opcional: { href, label } arriba del título).
	 * Slots: `actions` (botones), `meta` (chips al lado del título), default (debajo del subtítulo).
	 * También pone el <title> de la pestaña del navegador ("<title> · Panel").
	 */
	/** @type {string} */
	export let title;
	/** @type {string} */
	export let subtitle = '';
	/** @type {{ href: string, label: string } | null} */
	export let back = null;
</script>

<svelte:head><title>{title} · Panel</title></svelte:head>

<header class="head">
	<div class="text">
		{#if back}<a class="back" href={back.href}>← {back.label}</a>{/if}
		<div class="row">
			<h1>{title}</h1>
			<slot name="meta" />
		</div>
		{#if subtitle}<p class="sub">{subtitle}</p>{/if}
		<slot />
	</div>
	{#if $$slots.actions}<div class="actions"><slot name="actions" /></div>{/if}
</header>

<style>
	.head {
		display: flex;
		gap: var(--space-xs);
		align-items: flex-end;
		justify-content: space-between;
		flex-wrap: wrap;
		margin: 0.4rem 0 1.2rem;
	}
	.text {
		min-width: 0;
	}
	.row {
		display: flex;
		gap: var(--space-2xs);
		align-items: center;
		flex-wrap: wrap;
	}
	h1 {
		font-size: var(--text-lg);
		margin: 0;
		overflow-wrap: anywhere;
	}
	.sub {
		margin: 0.2rem 0 0;
		color: var(--muted);
	}
	.back {
		font-size: var(--text-xs);
		color: var(--muted);
	}
	.actions {
		display: flex;
		gap: var(--space-2xs);
		flex-wrap: wrap;
		align-items: center;
	}
</style>
