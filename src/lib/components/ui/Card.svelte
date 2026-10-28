<script>
	/**
	 * Tarjeta blanca redondeada, como las del sitio.
	 * Props: `title` (opcional, h2), `padded` (default true), `tag` (default 'section'),
	 * `icon` (opcional: componente de Lucide al lado del título),
	 * `status` ('ok' | 'warn' | 'bad' | 'info' | 'error', opcional: borde de color a la izquierda;
	 * solo cuando la tarjeta tiene un estado), `filled` (tarjeta llena del color de `status`, para
	 * destacar; sin `status`, rosa). Sin nada de eso, blanca lisa.
	 * `surface`: 'panel' (default, los tokens del panel) | 'sitio' (fuera del panel, con los del
	 * sitio: texto `--ink`, radio `--radius-l`, bordes de estado `--3-ink`, `--4-ink`, `--error`,
	 * `--2-dark` y llenas sobre los `-tint`).
	 * Slots: default; `actions` (a la derecha del título, ej. un CsvButton).
	 */
	/** @type {string} */
	export let title = '';
	export let padded = true;
	/** @type {string} */
	export let tag = 'section';
	/** @type {any} */
	export let icon = null;
	/** @type {'' | 'ok' | 'warn' | 'bad' | 'info' | 'error'} */
	export let status = '';
	export let filled = false;
	/** @type {'panel' | 'sitio'} */
	export let surface = 'panel';
</script>

<svelte:element
	this={tag}
	class="card {status ? `st-${status}` : ''}"
	class:padded
	class:filled
	class:sitio={surface === 'sitio'}
>
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
	/* Estado: borde de color a la izquierda. Es una sombra de adentro (no un borde), así el
	   contenido no se corre: el título queda alineado con el de las tarjetas lisas (gorrite,
	   12/10). */
	.card[class*='st-'] {
		box-shadow:
			inset 0.3rem 0 0 var(--st),
			var(--shadow);
	}
	.card.filled[class*='st-'] {
		box-shadow: inset 0.3rem 0 0 var(--st);
	}
	.st-ok {
		--st: var(--ok);
		--st-bg: var(--ok-bg);
	}
	.st-warn {
		--st: var(--warn);
		--st-bg: var(--warn-bg);
	}
	/* «malo» va en el rojo de los errores, como Badge y Notice (un solo color; gorrite, 12/10) */
	.st-bad {
		--st: var(--error);
		--st-bg: var(--error-bg);
	}
	.st-info {
		--st: var(--info);
		--st-bg: var(--info-bg);
	}
	.st-error {
		--st: var(--error);
		--st-bg: var(--error-bg);
	}
	/* Llena, para destacar. */
	.filled {
		background: var(--st-bg, var(--bad-bg));
		box-shadow: none;
	}
	.padded {
		padding: var(--space-s) var(--space-s);
	}
	/* Las acciones van a la derecha del título; bajan abajo solo si la tarjeta es angosta (el
	   título se parte en dos líneas antes de mandar el botón abajo, hasta 8rem). */
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
		flex: 1 1 8rem;
		min-width: 0;
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
	/* Sitio: los tokens del sitio (el panel tiene --text, --card-round, --accent y sus tonos;
	   el sitio no). Los bordes de estado en el tono oscuro de cada color (3:1 o más contra el
	   blanco), las llenas sobre su `-tint` con el texto en `--ink`. */
	.sitio {
		color: var(--ink);
		border-radius: var(--radius-l);
	}
	.sitio h2 :global(svg) {
		color: var(--1);
	}
	.sitio.st-ok {
		--st: var(--3-ink);
		--st-bg: var(--3-tint);
	}
	.sitio.st-warn {
		--st: var(--4-ink);
		--st-bg: var(--4-tint);
	}
	.sitio.st-bad,
	.sitio.st-error {
		--st: var(--error);
		--st-bg: var(--error-bg);
	}
	.sitio.st-info {
		--st: var(--2-dark);
		--st-bg: var(--2-tint);
	}
	.sitio.filled {
		background: var(--st-bg, var(--1-tint));
	}
</style>
