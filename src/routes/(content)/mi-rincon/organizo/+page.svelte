<script>
	import { argDateLong } from '$lib/utils/dates.js';

	export let data;
</script>

<svelte:head>
	<title>Eventos que organizás · Mi rincón · Kinky Vibe</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="rincon">
	<p class="back"><a href="/mi-rincon">← Mi rincón</a></p>
	<h1>Eventos que organizás</h1>
	<p class="hint">
		Los eventos publicados donde uno de tus perfiles figura con el rol «Organiza». Si falta alguno,
		pedile a une admin que sume tu perfil en las personas del evento.
	</p>

	<section class="surface-card" aria-labelledby="events-title">
		<h2 id="events-title">Tus eventos</h2>
		{#if data.error}
			<p>No pudimos leer tus eventos. Probá de nuevo en un rato.</p>
		{:else if data.events.length === 0}
			<p>Todavía no organizás ningún evento publicado.</p>
		{:else}
			<ul class="list">
				{#each data.events as e (e.slug)}
					<li>
						<a href="/mi-rincon/organizo/{e.slug}"><strong>{e.title}</strong></a>
						<span class="hint">
							{e.start ? `${argDateLong(e.start)} · ` : ''}como {e.profiles.join(', ')}
						</span>
					</li>
				{/each}
			</ul>
		{/if}
	</section>
</div>

<style>
	.rincon {
		display: grid;
		gap: 1em;
		/* 16px a los costados en el celu, como Mi rincón */
		width: min(40rem, calc(100% - 32px));
		margin: 1.5em auto;
	}
	h1 {
		margin: 0;
		font-size: var(--step-3);
	}
	h2 {
		margin: 0 0 0.5em;
		font-size: var(--step-1);
	}
	p {
		margin: 0;
	}
	.back a {
		color: var(--2-dark);
	}
	.hint {
		color: var(--muted);
		font-size: var(--step--1);
	}
	.list {
		list-style: none;
		padding: 0;
		margin: 0;
		display: grid;
		gap: 0.8em;
	}
	.list li {
		display: grid;
		gap: 0.2em;
		padding-bottom: 0.8em;
		border-bottom: 1px solid var(--line);
		overflow-wrap: anywhere;
	}
	.list a {
		min-height: var(--tap);
		display: inline-flex;
		align-items: center;
	}
</style>
