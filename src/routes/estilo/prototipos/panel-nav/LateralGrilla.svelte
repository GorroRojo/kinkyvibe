<script>
	/**
	 * Barra lateral de la opción B: las secciones en una grilla de tejas (ícono y nombre corto) y,
	 * debajo, las páginas de la sección en la que estás, en lista (navegación local vertical, en «L
	 * invertida»). Con `todo` (la variante pedida tal cual) son todas las páginas en tejas.
	 *
	 * Se achica así: en la compu angosta y la tablet la grilla pasa a una columna (un riel con
	 * nombres) y las páginas de la sección vuelven a ser pestañas arriba del contenido.
	 *
	 * Props: `secciones`, `estado`, `todo`.
	 */
	import { enlace, pestanaActiva } from './estado.js';

	/** @type {import('./datos.js').Seccion[]} */
	export let secciones;
	/** @type {import('./estado.js').Estado} */
	export let estado;
	export let todo = false;

	$: seccion = secciones.find((x) => x.id === estado.s) ?? secciones[0];
	$: tab = pestanaActiva(seccion, estado.t);
	/** Las páginas de la sección (en Ajustes, cada página suelta debajo de su grupo). */
	$: paginas = seccion.tabs.flatMap((t) =>
		t.partes
			? [
					{ grupo: t.label, id: '', label: '', icon: null },
					...t.partes.map((p) => ({ grupo: '', id: p.id, label: p.label, icon: p.icon }))
				]
			: [{ grupo: '', id: t.id, label: t.label, icon: t.icon }]
	);
	/** @param {string} id */
	const paginaActiva = (id) =>
		!estado.e && (estado.t === id || (!estado.t && id === seccion.tabs[0]?.id) || tab === id);
</script>

{#if todo}
	<nav class="todo" aria-label="Todas las páginas">
		{#each secciones as sec (sec.id)}
			<p class="rotulo">{sec.label}</p>
			<ul role="list">
				{#each sec.tabs.flatMap((t) => t.partes ?? [t]) as p (p.id)}
					<li>
						<a
							href={enlace(estado, { s: sec.id, t: p.id })}
							class:on={estado.s === sec.id && (estado.t === p.id || tab === p.id)}
							title={p.label}
							><svelte:component this={p.icon ?? sec.icon} size={18} aria-hidden="true" /><span
								>{p.label}</span
							></a
						>
					</li>
				{/each}
			</ul>
		{/each}
	</nav>
{/if}
<nav class="grilla" class:solo-angosto={todo} aria-label="Secciones">
	<ul role="list">
		{#each secciones as sec (sec.id)}
			<li>
				<a
					href={enlace(estado, { s: sec.id, t: '' })}
					class:on={estado.s === sec.id}
					aria-current={estado.s === sec.id ? 'page' : undefined}
					><svelte:component this={sec.icon} size={22} aria-hidden="true" /><span
						>{sec.corto ?? sec.label}</span
					></a
				>
			</li>
		{/each}
	</ul>
</nav>
{#if !todo && paginas.length > 1}
	<nav class="local" aria-label="Páginas de {seccion.label}">
		<p class="titulo">{seccion.label}</p>
		<ul role="list">
			{#each paginas as p, i (p.id || `g${i}`)}
				{#if p.grupo}
					<li class="sub">{p.grupo}</li>
				{:else}
					<li>
						<a
							href={enlace(estado, { s: seccion.id, t: p.id })}
							class:on={paginaActiva(p.id)}
							aria-current={paginaActiva(p.id) ? 'page' : undefined}
							>{#if p.icon}<svelte:component
									this={p.icon}
									size={16}
									aria-hidden="true"
								/>{/if}{p.label}</a
						>
					</li>
				{/if}
			{/each}
		</ul>
	</nav>
{/if}

<style>
	ul {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.grilla,
	.todo,
	.local {
		width: 14.5rem;
	}
	.grilla {
		margin-top: var(--space-xs);
	}
	.grilla ul {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: var(--space-3xs);
	}
	.grilla a {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.2rem;
		min-height: 3.4rem;
		padding: var(--space-3xs);
		border-radius: var(--radius-m);
		background: var(--surface-2);
		color: var(--accent);
		font-weight: 700;
		font-size: var(--text-xs);
		text-decoration: none;
		text-align: center;
	}
	.grilla a:hover {
		box-shadow: var(--shadow-1);
	}
	.grilla a.on {
		background: var(--link-bg);
		color: var(--link);
		box-shadow: inset 0 0 0 2px var(--link);
	}
	.local {
		margin-top: var(--space-xs);
		padding-top: var(--space-2xs);
		border-top: 1px solid var(--line);
	}
	.titulo {
		margin: 0 0 var(--space-3xs);
		padding: 0 var(--space-xs);
		font-weight: 700;
		color: var(--link);
	}
	.local ul {
		display: flex;
		flex-direction: column;
		gap: 0.1rem;
	}
	.local a {
		display: flex;
		align-items: center;
		gap: var(--space-2xs);
		padding: 0.3rem var(--space-xs);
		border-radius: var(--round);
		color: var(--accent);
		font-weight: 700;
		text-decoration: none;
	}
	.local a:hover {
		background: var(--surface-2);
	}
	.local a.on {
		background: var(--link-bg);
		color: var(--link);
	}
	.sub,
	.rotulo {
		font-size: var(--text-xs);
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--muted);
		padding: 0.3rem var(--space-xs) 0.05rem;
		margin: 0;
	}
	.todo {
		margin-top: var(--space-3xs);
	}
	.todo ul {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 0.15rem;
	}
	.todo a {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.1rem;
		padding: 0.25rem 0.1rem;
		border-radius: var(--radius-s);
		color: var(--accent);
		font-size: var(--text-xs);
		line-height: 1.1;
		text-decoration: none;
		text-align: center;
		background: var(--surface-2);
	}
	.todo a span {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		max-width: 100%;
	}
	.todo a.on {
		background: var(--link-bg);
		color: var(--link);
		box-shadow: inset 0 0 0 2px var(--link);
	}

	/* Compu angosta y tablet: riel de una columna, con nombres; las páginas vuelven a pestañas. */
	@container pantalla (max-width: 999px) {
		.grilla,
		.todo {
			width: 5.2rem;
		}
		.grilla ul,
		.todo ul {
			grid-template-columns: 1fr;
		}
		.local,
		.todo {
			display: none;
		}
		.grilla.solo-angosto {
			display: block;
		}
	}
	@container pantalla (min-width: 1000px) {
		.solo-angosto {
			display: none;
		}
	}
</style>
