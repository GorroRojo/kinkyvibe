<script>
	/**
	 * Encabezado de una página del panel: título, subtítulo y acciones a la derecha.
	 * Props: `title`, `subtitle` (opcional), `back` (opcional: { href, label } arriba del título).
	 * Con `image` (URL de una miniatura) o `icon` (componente de Lucide: el ícono grande del tipo,
	 * cuando no hay imagen) se arma como el de la ficha de un evento: la imagen a la izquierda, el
	 * texto al lado y las acciones abajo (a la derecha en pantallas anchas). `imageAlt` (default '').
	 * Slots: `actions` (botones), `meta` (chips al lado del título; con imagen, debajo), default
	 * (debajo del subtítulo).
	 * También pone el <title> de la pestaña del navegador ("<title> · Panel").
	 */
	/** @type {string} */
	export let title;
	/** @type {string} */
	export let subtitle = '';
	/** @type {{ href: string, label: string } | null} */
	export let back = null;
	/** @type {string} */
	export let image = '';
	export let imageAlt = '';
	/** @type {any} */
	export let icon = null;
</script>

<svelte:head><title>{title} · Panel</title></svelte:head>

{#if image || icon}
	<header class="cover-head">
		{#if image}
			<img class="cover" src={image} alt={imageAlt} />
		{:else}
			<div class="cover type-icon" aria-hidden="true">
				<svelte:component this={icon} size={48} strokeWidth={1.75} />
			</div>
		{/if}
		<div class="cover-text">
			{#if back}<a class="back" href={back.href}>← {back.label}</a>{/if}
			<h1>{title}</h1>
			{#if subtitle}<p class="sub">{subtitle}</p>{/if}
			{#if $$slots.meta}<div class="chips"><slot name="meta" /></div>{/if}
			<slot />
		</div>
		{#if $$slots.actions}<div class="cover-actions"><slot name="actions" /></div>{/if}
	</header>
{:else}
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
{/if}

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

	/* Con imagen o ícono grande: como el encabezado de la ficha de un evento
	   (src/routes/(authed)/admin/eventos/[slug]/+layout.svelte). */
	.cover-head {
		display: grid;
		grid-template-columns: 7rem minmax(0, 1fr);
		grid-template-areas: 'cover text' 'actions actions';
		gap: var(--space-2xs) var(--space-s);
		align-items: start;
		margin: 0.4rem 0 1rem;
	}
	.cover {
		grid-area: cover;
		width: 7rem;
		height: 7rem;
		border-radius: var(--card-round);
		object-fit: cover;
		box-shadow: var(--shadow);
	}
	.type-icon {
		display: grid;
		place-items: center;
		background: var(--link-bg);
		color: var(--link);
		box-shadow: none;
	}
	.cover-text {
		grid-area: text;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
	}
	.cover-text h1 {
		line-height: 1.15;
	}
	.cover-text .sub {
		margin: 0;
		font-weight: 700;
		color: inherit;
	}
	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-3xs);
		align-items: center;
		margin-top: 0.3rem;
	}
	.cover-actions {
		grid-area: actions;
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
	}
	@media (min-width: 1100px) {
		.cover-head {
			grid-template-columns: 7rem minmax(0, 1fr) auto;
			grid-template-areas: 'cover text actions';
		}
		.cover-actions {
			justify-content: flex-end;
			max-width: 22rem;
		}
	}
	@media (max-width: 520px) {
		.cover-head {
			grid-template-columns: 4.5rem minmax(0, 1fr);
		}
		.cover {
			width: 4.5rem;
			height: 4.5rem;
		}
		.cover-text h1 {
			font-size: var(--text-base);
		}
	}
</style>
