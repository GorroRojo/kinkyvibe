<script>
	/**
	 * «Lo que enlaza acá» (interruptor `lo_que_enlaza`, docs/enlaces.md): las páginas cuyo texto
	 * enlaza a esta. Recibe solo lo que quien mira puede ver (lo decide el servidor,
	 * src/lib/server/contenido/loQueEnlaza.js): este componente no filtra nada. Sin nada (o con el
	 * interruptor apagado, `null`), no se ve.
	 *
	 * Una tarjeta plegable (`<details>`, anda sin JS), cerrada de entrada: el título y cuántas son.
	 * Abierta, cada página es una pastilla con el color y el ícono de su tipo (rosa eventos,
	 * violeta material, verde amigues, amarillo Kinkipedia) y su fecha, si tiene.
	 *
	 * Props: `links` ({ type, title, path, date }[] | null).
	 */
	import { BookMarked, BookOpen, CalendarDays, ChevronDown, Link2, Users } from '@lucide/svelte';

	/** @type {{ type: string, title: string, path: string, date?: string }[] | null | undefined} */
	export let links = null;

	/** @type {Record<string, string>} */
	const TYPE_LABEL = {
		evento: 'Evento',
		material: 'Material',
		perfil: 'Amigues',
		etiqueta: 'Kinkipedia'
	};
	/** @type {Record<string, any>} */
	const ICON = { evento: CalendarDays, material: BookOpen, perfil: Users, etiqueta: BookMarked };
</script>

{#if links?.length}
	<section class="lo-que-enlaza content" aria-labelledby="lo-que-enlaza-titulo">
		<details class="box">
			<summary>
				<Link2 size="1.1em" aria-hidden="true" class="link-ico" />
				<span id="lo-que-enlaza-titulo" class="titulo">Lo que enlaza acá</span>
				<span class="count"
					>{links.length}<span class="sr">{links.length === 1 ? ' página' : ' páginas'}</span></span
				>
				<ChevronDown size="1.2em" aria-hidden="true" class="chev" />
			</summary>
			<ul>
				{#each links as link (link.path)}
					<li>
						<a href={link.path} class="chip t-{link.type}" title={TYPE_LABEL[link.type]}>
							{#if ICON[link.type]}
								<svelte:component this={ICON[link.type]} size="1.05em" aria-hidden="true" />
							{/if}
							{#if TYPE_LABEL[link.type]}<span class="sr">{TYPE_LABEL[link.type]}:</span>{/if}
							<span class="t">{link.title}</span>
							{#if link.date}<span class="d">{link.date}</span>{/if}
						</a>
					</li>
				{/each}
			</ul>
		</details>
	</section>
{/if}

<style>
	/* Los cuatro colores de la marca, uno por tipo. */
	.t-evento {
		--c: var(--1);
		--c-tint: var(--1-tint);
		--c-ink: var(--1-ink);
	}
	.t-material {
		--c: var(--2);
		--c-tint: var(--2-tint);
		--c-ink: var(--2-dark);
	}
	.t-perfil {
		--c: var(--3);
		--c-tint: var(--3-tint);
		--c-ink: var(--3-ink);
	}
	.t-etiqueta {
		--c: color-mix(in srgb, var(--4) 70%, var(--4-dark));
		--c-tint: var(--4-tint);
		--c-ink: var(--4-ink);
	}
	.sr {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
		white-space: nowrap;
	}

	.lo-que-enlaza {
		margin-block: 1.5em;
	}
	/* La tarjeta es el único hijo de `.content`: toma su ancho y va centrada, y todo lo de adentro
	   queda alineado a su borde izquierdo (antes la lista quedaba corrida del título). */
	.box {
		background: var(--surface);
		border-radius: var(--radius-l);
		box-shadow: var(--shadow-1);
		box-sizing: border-box;
	}

	summary {
		display: flex;
		align-items: center;
		gap: var(--space-3xs);
		min-height: var(--tap);
		padding: var(--space-2xs) var(--space-s);
		border-radius: var(--radius-l);
		cursor: pointer;
		list-style: none;
		font-size: var(--text-lg);
		font-weight: 700;
		color: var(--ink);
		user-select: none;
	}
	summary::-webkit-details-marker {
		display: none;
	}
	summary:focus-visible {
		outline: 3px solid var(--2);
		outline-offset: 2px;
	}
	summary :global(.link-ico) {
		color: var(--1);
		flex: none;
	}
	.count {
		font-size: var(--text-xs);
		background: var(--2-tint);
		color: var(--2-dark);
		border-radius: var(--radius-pill);
		padding: 0.1em 0.6em;
	}
	summary :global(.chev) {
		margin-inline-start: auto;
		flex: none;
		color: var(--muted);
		transition: transform 0.2s ease;
	}
	details[open] summary :global(.chev) {
		transform: rotate(180deg);
	}
	summary:hover :global(.chev) {
		color: var(--ink);
	}
	@media (prefers-reduced-motion: reduce) {
		summary :global(.chev) {
			transition: none;
		}
	}

	ul {
		list-style: none;
		margin: 0;
		padding: var(--space-3xs) var(--space-s) var(--space-s);
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-3xs) var(--space-2xs);
		font-size: var(--text-sm);
	}
	/* Sin el «+» ni el margen de los ítems del texto (`.content li`, style.scss). */
	.lo-que-enlaza li {
		margin: 0;
		max-width: 100%;
		min-width: 0;
	}
	.lo-que-enlaza li::before {
		content: none;
	}
	.chip {
		display: inline-flex;
		align-items: center;
		gap: 0.35em;
		min-height: var(--tap);
		padding: 0 var(--space-xs);
		border: 1.5px solid var(--c, var(--line));
		border-radius: var(--radius-pill);
		background: var(--surface);
		color: var(--c-ink, var(--ink));
		text-decoration: none;
		font-weight: 700;
		max-width: 100%;
		box-sizing: border-box;
	}
	.chip:hover {
		background: var(--c-tint, var(--surface));
	}
	.chip:focus-visible {
		outline: 3px solid var(--c, var(--2));
		outline-offset: 2px;
	}
	.chip :global(svg) {
		flex: none;
	}
	/* En el celular, un título largo se corta con «…» (el título entero está en el link). */
	.t {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.d {
		font-weight: 400;
		color: var(--muted);
		white-space: nowrap;
		font-size: var(--text-xs);
	}
</style>
