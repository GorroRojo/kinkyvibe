<script>
	import { enhance } from '$app/forms';
	import { page } from '$app/stores';
	import CalendarSubscribe from '$lib/components/series/CalendarSubscribe.svelte';
	import { TIMEZONE } from '$lib/utils/dates.js';

	export let data;
	export let form;

	/** @param {number | null} d */
	const fmtDate = (d) =>
		d == null
			? ''
			: new Date(d).toLocaleDateString('es-AR', {
					timeZone: TIMEZONE,
					day: 'numeric',
					month: 'long',
					year: 'numeric'
				});

	$: newPath = form?.action === 'crear' ? form.path : '';
</script>

<svelte:head>
	<title>Tu calendario - KinkyVibe.ar</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="rincon">
	<p><a href="/mi-rincon">← Mi rincón</a></p>
	<h1>Tu calendario</h1>

	<section class="surface-card" aria-labelledby="mio-title">
		<h2 id="mio-title">Lo tuyo en tu calendario</h2>
		<p class="hint">
			Un calendario con los eventos para los que tenés entradas. Se actualiza solo cuando comprás.
			El link es secreto: cualquiera que lo tenga ve en qué eventos tenés entrada. Si lo compartiste
			sin querer, generá uno nuevo y el anterior deja de andar.
		</p>
		{#if newPath}
			<p class="ok" role="status">
				Este es tu link. Guardalo ahora: no lo vamos a mostrar de nuevo.
			</p>
			<code class="link">{$page.url.origin + newPath}</code>
			<CalendarSubscribe url={$page.url.origin + newPath} label="lo tuyo" />
		{:else if form?.action === 'revocar'}
			<p class="ok" role="status">Listo: el link dejó de andar.</p>
		{/if}
		{#if data.feed && !newPath}
			<p>
				Tenés un link activo desde el {fmtDate(data.feed.createdAt)}{data.feed.lastUsedAt
					? `; tu calendario lo usó por última vez el ${fmtDate(data.feed.lastUsedAt)}`
					: ''}.
			</p>
		{/if}
		<div class="row">
			<form method="POST" action="?/crear" use:enhance>
				<button class="pill-btn" type="submit"
					>{data.feed || newPath ? 'Generar un link nuevo' : 'Crear mi link'}</button
				>
			</form>
			{#if data.feed || newPath}
				<form method="POST" action="?/revocar" use:enhance>
					<button class="pill-btn ghost" type="submit">Revocar el link</button>
				</form>
			{/if}
		</div>
	</section>

	<section class="surface-card" aria-labelledby="avisos-title">
		<h2 id="avisos-title">Avisos de series</h2>
		{#if form?.action === 'baja' && form.error}
			<p class="error" role="alert">{form.error}</p>
		{/if}
		{#if data.series.length === 0}
			<p class="hint">
				No pediste avisos todavía. En un evento pasado de una serie, tocá "Avisame si se repite".
			</p>
		{:else}
			<ul class="series">
				{#each data.series as s (s.id)}
					<li>
						<a href={s.href}>{s.name}</a>
						<form method="POST" action="?/baja" use:enhance>
							<input type="hidden" name="serie" value={s.id} />
							<button class="pill-btn ghost small" type="submit">Dejar de avisarme</button>
						</form>
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
		width: min(40rem, 100%);
		margin: 1.5em auto;
		padding-inline: 16px;
		box-sizing: border-box;
	}
	h1 {
		margin: 0;
		font-size: var(--step-3);
	}
	h2 {
		margin: 0 0 0.4em;
		font-size: var(--step-1);
	}
	section {
		display: grid;
		gap: 0.7em;
	}
	p {
		margin: 0;
	}
	.hint {
		color: var(--muted);
		font-size: var(--step--1);
	}
	.ok {
		color: var(--3-ink);
		font-weight: 600;
	}
	.error {
		color: var(--1-ink);
		font-weight: 600;
	}
	.row {
		display: flex;
		flex-wrap: wrap;
		gap: 0.6em;
	}
	.link {
		display: block;
		padding: 0.6em;
		background: var(--hover);
		border-radius: var(--round-sm);
		overflow-wrap: anywhere;
		font-size: var(--step--1);
	}
	.series {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 0.4em;
	}
	.series li {
		display: flex;
		flex-wrap: wrap;
		justify-content: space-between;
		align-items: center;
		gap: 0.5em;
	}
	.small {
		font-size: var(--step--1);
		min-height: 2.2rem;
	}
</style>
