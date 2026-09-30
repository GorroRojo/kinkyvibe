<script>
	/**
	 * Ficha de un evento: encabezado (imagen, título, fecha, lugar, etiquetas y acciones) y las
	 * pestañas de `EVENT_TABS`. Una página con `bare: true` en su load (modo puerta) se muestra
	 * sola, sin encabezado ni pestañas.
	 */
	import { page } from '$app/stores';
	import { Copy, ExternalLink, ImageDown, ReceiptText } from '@lucide/svelte';
	import Badge from '$lib/components/admin/panel/Badge.svelte';
	import Tabs from '$lib/components/admin/panel/Tabs.svelte';
	import { EVENT_TABS, eventHref } from '$lib/admin/nav.js';
	import { eventBadges, shortDate, timeRange } from '$lib/admin/eventFormat.js';

	/** @type {import('./$types').LayoutData} */
	export let data;

	const icon = { size: 16, strokeWidth: 2.25, 'aria-hidden': true };
	/** Pestañas que solo tienen sentido si el evento vende entradas. */
	const SALES_TABS = ['ventas', 'ordenes', 'transferencias', 'ingreso', 'codigos', 'mail'];

	$: bare = $page.data?.bare === true;
	$: e = data.event;
	$: tabs = EVENT_TABS.filter((t) => e.sellsTickets || !SALES_TABS.includes(t.id))
		// Los eventos online no tienen control de ingreso (las entradas llevan el link).
		.filter((t) => !(t.id === 'ingreso' && e.online))
		.map((t) => ({
			// Mientras el modo puerta nuevo no existe, la pestaña lleva al control de ingreso de hoy.
			href:
				t.id === 'ingreso' && t.soon
					? `/admin/entradas/${encodeURIComponent(e.slug)}/ingreso`
					: eventHref(e.slug, t.id),
			label: t.label,
			count:
				t.id === 'ordenes'
					? data.tabCounts.orders
					: t.id === 'transferencias'
						? data.tabCounts.transfers
						: undefined
		}));
	$: when = [shortDate(e.start), timeRange(e.start, e.end)].filter(Boolean).join(' · ');
	$: where = [e.locationName, e.location && e.location !== e.locationName ? e.location : '']
		.filter(Boolean)
		.join(', ');
</script>

{#if bare}
	<slot />
{:else}
	<header class="event-head">
		{#if e.thumb}
			<img class="cover" src={e.thumb} alt="" />
		{:else}
			<div class="cover gradient" aria-hidden="true"></div>
		{/if}
		<div class="text">
			<a class="back" href="/admin/eventos">← Eventos</a>
			<h1>{e.title}</h1>
			<p class="when">{when || 'Sin fecha'}</p>
			{#if where || e.place}
				<p class="where">{[where, e.place].filter(Boolean).join(' · ')}</p>
			{/if}
			<div class="chips">
				{#each eventBadges(e) as b}<Badge tone={b.tone}>{b.label}</Badge>{/each}
				{#if e.kinkyvibe}<Badge tone="info">Fondo KinkyVibe</Badge>{/if}
				{#each e.tags.filter((t) => t !== 'KinkyVibe' && t !== e.place) as t}
					<span class="tag">{t}</span>
				{/each}
			</div>
		</div>
		<div class="actions">
			<a class="kv-btn ghost" href="/calendario/{e.slug}" target="_blank" rel="noreferrer"
				><ExternalLink {...icon} /> Ver página
				<span class="sr-only">(se abre en otra pestaña)</span></a
			>
			<a class="kv-btn ghost" href="/admin/eventos/nuevo?desde={encodeURIComponent(e.slug)}"
				><Copy {...icon} /> Duplicar</a
			>
			<a class="kv-btn ghost" href="/calendario/{e.slug}/compartir"
				><ImageDown {...icon} /> Imagen para compartir</a
			>
		</div>
	</header>

	{#if data.tabCounts.transfers && !$page.url.pathname.endsWith('/transferencias')}
		<p class="alert" role="status">
			<ReceiptText size={18} aria-hidden="true" />
			{data.tabCounts.transfers === 1
				? 'Hay 1 transferencia esperando confirmación.'
				: `Hay ${data.tabCounts.transfers} transferencias esperando confirmación.`}
			<a class="kv-btn small push" href={eventHref(e.slug, 'transferencias')}>Revisar</a>
		</p>
	{/if}

	<Tabs {tabs} />

	<slot />
{/if}

<style>
	.event-head {
		display: grid;
		grid-template-columns: 7rem minmax(0, 1fr);
		grid-template-areas: 'cover text' 'actions actions';
		gap: 0.6rem 1.1rem;
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
	.gradient {
		background: linear-gradient(135deg, var(--1), var(--2));
	}
	.text {
		grid-area: text;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
	}
	.back {
		font-size: 0.85rem;
		color: var(--muted);
	}
	h1 {
		font-size: 1.6rem;
		margin: 0;
		overflow-wrap: anywhere;
		line-height: 1.15;
	}
	.when,
	.where {
		margin: 0;
	}
	.when {
		font-weight: 700;
	}
	.where {
		color: var(--muted);
		overflow-wrap: anywhere;
	}
	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 0.3rem;
		margin-top: 0.3rem;
	}
	.tag {
		font-size: 0.75rem;
		font-weight: 700;
		border-radius: 3em;
		padding: 0.1em 0.6em;
		background: var(--surface);
		border: 1px solid var(--field);
		color: var(--accent);
	}
	.actions {
		grid-area: actions;
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
	}
	.alert {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.6rem;
		background: var(--warn-bg);
		color: var(--text);
		border-radius: var(--card-round);
		padding: 0.6rem 0.8rem 0.6rem 1rem;
		margin: 0 0 1rem;
	}
	.push {
		margin-left: auto;
	}
	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
		white-space: nowrap;
	}
	@media (min-width: 1100px) {
		.event-head {
			grid-template-columns: 7rem minmax(0, 1fr) auto;
			grid-template-areas: 'cover text actions';
		}
		.actions {
			justify-content: flex-end;
			max-width: 22rem;
		}
	}
	@media (max-width: 520px) {
		.event-head {
			grid-template-columns: 4.5rem minmax(0, 1fr);
		}
		.cover {
			width: 4.5rem;
			height: 4.5rem;
		}
		h1 {
			font-size: 1.3rem;
		}
	}
</style>
