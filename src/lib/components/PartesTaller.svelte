<script>
	/**
	 * Talleres en varias partes en la página de un evento (docs/talleres-partes.md): debajo del
	 * título, «Parte 2 de 3 de «Taller»» (`part="nav"`); más abajo, la lista de todas las partes con
	 * su fecha y link (`part="list"`), con la que se está mirando marcada.
	 *
	 * Props:
	 * - `partes`: lo que da `loadPartes` en calendario/[event]/+page.server.js.
	 * - `part`: 'nav' o 'list'.
	 */
	import { partDateText, partLabel } from '$lib/utils/partes.js';

	/**
	 * @type {{
	 *   total: number, current: number, perPart: boolean,
	 *   workshop: { slug: string, title: string },
	 *   parts: { slug: string, title: string, n: number, start: string | null, status: string | null }[]
	 * }}
	 */
	export let partes;
	/** @type {'nav' | 'list'} */
	export let part = 'nav';
</script>

{#if part === 'nav'}
	<p class="part-nav">
		{#if partes.current === 1}
			Taller en {partes.total} partes
		{:else}
			{partLabel(partes.current, partes.total)} de
			<a href="/calendario/{partes.workshop.slug}">{partes.workshop.title}</a>
		{/if}
	</p>
{:else}
	<section class="partes surface-card" aria-labelledby="partes-title">
		<h2 id="partes-title">Las {partes.total} partes del taller</h2>
		<ol>
			{#each partes.parts as p (p.slug)}
				<li class:current={p.n === partes.current} class:dim={p.status === 'cancelado'}>
					<span class="n">Parte {p.n}</span>
					<span class="when">{partDateText(p.start)}</span>
					{#if p.n === partes.current}
						<span class="title" aria-current="page">{p.title}</span>
					{:else}
						<a class="title" href="/calendario/{p.slug}">{p.title}</a>
					{/if}
					{#if p.status === 'cancelado'}<strong class="cancel">Cancelada</strong>{/if}
				</li>
			{/each}
		</ol>
		<p class="note">
			{partes.perPart
				? 'Cada parte tiene su propia entrada.'
				: `Una sola entrada vale para las ${partes.total} partes.`}
		</p>
	</section>
{/if}

<style>
	.part-nav {
		margin: 0.2em auto 0.8em;
		text-align: center;
		color: var(--muted);
		font-size: var(--step-0);
	}
	.part-nav a {
		color: var(--2-dark);
		font-weight: 700;
	}
	.partes {
		width: min(40rem, 100%);
		margin: 1em auto;
		padding: 1em 1.2em;
	}
	h2 {
		margin: 0 0 0.5em;
		font-size: var(--step-1);
	}
	ol {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 0.3em;
	}
	li {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 0.2em 0.7em;
		padding: 0.35em 0.6em;
		border-radius: var(--round-pill, 2em);
	}
	li.current {
		background: var(--surface-2, rgba(0, 0, 0, 0.05));
		font-weight: 700;
	}
	li.dim .when,
	li.dim .title {
		text-decoration: line-through;
		opacity: 0.7;
	}
	.n {
		font-weight: 700;
		min-width: 4.5em;
	}
	.when {
		color: var(--muted);
		white-space: nowrap;
	}
	.title {
		overflow-wrap: anywhere;
	}
	.cancel {
		color: var(--bad, #b00020);
		font-size: var(--step--1);
	}
	.note {
		margin: 0.7em 0 0;
		font-size: var(--step--1);
		color: var(--muted);
	}
</style>
