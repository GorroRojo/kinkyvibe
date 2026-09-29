<script>
	import { describeSchedule } from '$lib/utils/eventDraft.js';
	/** @type {import('./$types').PageData} */
	export let data;

	const PAGE = 30;
	let query = '';
	let shown = PAGE;

	/** @param {string} s */
	const normalize = (s) =>
		s
			.normalize('NFD')
			.replace(/[̀-ͯ]/g, '')
			.toLowerCase();

	$: words = normalize(query).split(/\s+/).filter(Boolean);
	$: filtered = data.events.filter((e) => {
		if (!words.length) return true;
		const haystack = normalize(`${e.title} ${e.slug} ${e.location}`);
		return words.every((w) => haystack.includes(w));
	});
	$: query, (shown = PAGE);
	$: now = new Date().toISOString();

	const STATUS = /** @type {Record<string, string>} */ ({
		anunciado: 'Anunciado',
		abierto: 'Abierto',
		agotadas: 'Agotadas',
		cancelado: 'Cancelado'
	});
</script>

<svelte:head>
	<title>Cargar eventos · KV Admin</title>
</svelte:head>

<main class="eventos">
	<p class="back"><a href="/admin">← Panel de admin</a></p>
	<h1>Cargar un evento</h1>
	<p class="intro">
		La forma más fácil es <strong>duplicar un evento anterior</strong> (por ejemplo, la edición del
		mes pasado) y cambiarle la fecha. Buscalo abajo y tocá <em>Duplicar</em>.
	</p>
	<p>
		<a class="button secondary" href="/admin/eventos/nuevo">✨ Crear un evento desde cero</a>
		<a class="button secondary" href="/admin/eventos/importar">📋 Importar desde la planilla</a>
	</p>

	<label class="search">
		<span>Buscar un evento</span>
		<input
			type="search"
			bind:value={query}
			placeholder="Ej: picantearla, shibari, córdoba…"
			autocomplete="off"
		/>
	</label>
	<p class="count">
		{filtered.length}
		{filtered.length == 1 ? 'evento' : 'eventos'}{query ? ' encontrados' : ''}, del más nuevo al más viejo
	</p>

	<ul class="list">
		{#each filtered.slice(0, shown) as event (event.slug)}
			<li class:past={event.start && event.start < now}>
				{#if event.thumb}
					<img src={event.thumb} alt="" loading="lazy" decoding="async" />
				{:else}
					<div class="noimg" aria-hidden="true">📅</div>
				{/if}
				<div class="info">
					<strong class="title">{event.title}</strong>
					<span class="date">{describeSchedule(event.start, event.end) || 'Sin fecha'}</span>
					<span class="meta">
						{#if event.status}<span class="badge {event.status}">{STATUS[event.status] ?? event.status}</span>{/if}
						{#if event.unlisted}<span class="badge">No listado</span>{/if}
						{#if event.unpublished}<span class="badge">Despublicado</span>{/if}
						<code>{event.slug}</code>
					</span>
				</div>
				<div class="actions">
					<a
						class="button"
						href="/admin/eventos/nuevo?desde={encodeURIComponent(event.slug)}"
						aria-label="Duplicar {event.title}">Duplicar</a
					>
					<a class="small" href="/calendario/{event.slug}" target="_blank" rel="noreferrer">Ver</a>
				</div>
			</li>
		{:else}
			<li class="empty">No encontramos eventos con “{query}”.</li>
		{/each}
	</ul>
	{#if filtered.length > shown}
		<p class="more">
			<button class="button secondary" on:click={() => (shown += PAGE)}>Ver más eventos</button>
		</p>
	{/if}
</main>

<style lang="scss">
	.eventos {
		max-width: 50rem;
		margin-inline: auto;
		padding: 0 16px 4em;
		font-size: var(--step-0);
	}
	h1 {
		font-size: var(--step-3);
		margin: 0.3em 0;
	}
	.back {
		margin: 0.5em 0 0;
		font-size: var(--step--1);
	}
	.intro {
		max-width: 40em;
	}
	.button {
		display: inline-block;
		background: var(--1);
		color: white;
		border: 0;
		border-radius: 1em;
		padding: 0.5em 1em;
		font-size: var(--step-0);
		text-decoration: none;
		cursor: pointer;
		white-space: nowrap;
		&.secondary {
			background: white;
			color: var(--1-dark);
			outline: 2px solid var(--1-light);
			outline-offset: -2px;
		}
	}
	.search {
		display: flex;
		flex-direction: column;
		gap: 0.3em;
		margin-top: 1.5em;
		span {
			color: var(--1);
		}
		input {
			font-size: var(--step-0);
			padding: 0.5em 1em;
			border-radius: 1em;
			border: 0;
			outline: 1px solid var(--1-light);
			&:focus {
				outline-width: 3px;
			}
		}
	}
	.count {
		font-size: var(--step--1);
		opacity: 0.7;
	}
	.list {
		list-style: none;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.7em;
	}
	.list li {
		display: grid;
		grid-template-columns: 4.5em 1fr auto;
		gap: 0.8em;
		align-items: center;
		background: white;
		border-radius: 1.2em;
		padding: 0.6em;
		box-shadow: 0 0.1em 0.3em rgba(0, 0, 0, 0.1);
		&.past {
			background: #fbfbfb;
		}
		&.empty {
			display: block;
			text-align: center;
			padding: 2em;
		}
	}
	img,
	.noimg {
		width: 4.5em;
		height: 4.5em;
		object-fit: cover;
		border-radius: 0.8em;
		background: #f3eef6;
		display: grid;
		place-items: center;
		font-size: 1.5em;
	}
	img {
		font-size: inherit;
	}
	.info {
		display: flex;
		flex-direction: column;
		gap: 0.15em;
		min-width: 0;
	}
	.title {
		line-height: 1.2;
	}
	.date {
		font-size: var(--step--1);
		&::first-letter {
			text-transform: uppercase;
		}
	}
	.meta {
		display: flex;
		flex-wrap: wrap;
		gap: 0.3em;
		align-items: center;
		font-size: var(--step--2);
		code {
			opacity: 0.6;
			overflow-wrap: anywhere;
		}
	}
	.badge {
		border-radius: 1em;
		padding: 0 0.6em;
		background: #eee;
		&.abierto {
			background: var(--3-light);
		}
		&.anunciado {
			background: var(--4-light);
		}
		&.cancelado,
		&.agotadas {
			background: #ddd;
		}
	}
	.actions {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.3em;
		.small {
			font-size: var(--step--1);
		}
	}
	.more {
		text-align: center;
	}
	@media (max-width: 540px) {
		.list li {
			grid-template-columns: 3.5em 1fr;
		}
		img,
		.noimg {
			width: 3.5em;
			height: 3.5em;
		}
		.actions {
			grid-column: 1 / -1;
			flex-direction: row;
			justify-content: flex-end;
			gap: 1em;
		}
	}
</style>
