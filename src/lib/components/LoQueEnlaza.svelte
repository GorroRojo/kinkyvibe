<script>
	/**
	 * «Lo que enlaza acá» (interruptor `lo_que_enlaza`, docs/enlaces.md): las páginas cuyo texto
	 * enlaza a esta. Recibe solo lo que quien mira puede ver (lo decide el servidor,
	 * src/lib/server/contenido/loQueEnlaza.js): este componente no filtra nada. Sin nada (o con el
	 * interruptor apagado, `null`), no se ve.
	 *
	 * Props: `links` ({ type, title, path, date }[] | null).
	 */
	/** @type {{ type: string, title: string, path: string, date?: string }[] | null | undefined} */
	export let links = null;

	/** @type {Record<string, string>} */
	const TYPE_LABEL = {
		evento: 'Evento',
		material: 'Material',
		perfil: 'Amigues',
		etiqueta: 'Kinkipedia'
	};
</script>

{#if links?.length}
	<section class="lo-que-enlaza content" aria-labelledby="lo-que-enlaza-titulo">
		<h2 id="lo-que-enlaza-titulo" class="like-h3">Lo que enlaza acá</h2>
		<ul>
			{#each links as link (link.path)}
				<li>
					<a href={link.path}>{link.title}</a>
					<span class="tipo">{[TYPE_LABEL[link.type], link.date].filter(Boolean).join(' · ')}</span>
				</li>
			{/each}
		</ul>
	</section>
{/if}

<style>
	.lo-que-enlaza {
		margin-block: 1.5em;
		font-size: var(--step--1);
	}
	ul {
		margin: 0;
		padding-inline-start: 1.2em;
		display: flex;
		flex-direction: column;
		gap: 0.35em;
	}
	/* Más juntos que los ítems del texto (`.content li`, style.scss): es una lista de links. */
	.lo-que-enlaza li {
		margin-block: 0;
		overflow-wrap: anywhere;
	}
	.tipo {
		margin-inline-start: 0.4em;
		color: var(--muted);
		white-space: nowrap;
	}
</style>
