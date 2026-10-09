<script>
	/**
	 * Ficha de un evento: encabezado (imagen, título, fecha, lugar, etiquetas y acciones) y las
	 * pestañas de `EVENT_TABS`. Una página con `bare: true` en su load (modo puerta) se muestra
	 * sola, sin encabezado ni pestañas.
	 */
	import { page } from '$app/stores';
	import { CalendarDays, Copy, ExternalLink, ImageDown, Pencil } from '@lucide/svelte';
	import Notice from '$lib/components/ui/Notice.svelte';
	import Badge from '$lib/components/admin/panel/Badge.svelte';
	import Tabs from '$lib/components/admin/panel/Tabs.svelte';
	import TagChip from '$lib/components/TagChip.svelte';
	import { EVENT_TABS, eventHref } from '$lib/admin/nav.js';
	import { eventBadges, shortDate, timeRange } from '$lib/admin/eventFormat.js';

	/** @type {import('./$types').LayoutData} */
	export let data;

	const icon = { size: 16, strokeWidth: 2.25, 'aria-hidden': true };
	/** Pestañas que solo tienen sentido si el evento vende entradas. */
	const SALES_TABS = ['ventas', 'ordenes', 'transferencias', 'ingreso', 'codigos', 'mail', 'mails'];

	$: bare = $page.data?.bare === true;
	$: editing = $page.url.pathname.replace(/\/+$/, '').endsWith('/editar');
	$: e = data.event;
	// Parte de un taller con una sola entrada: su modo puerta usa las entradas del taller.
	$: tabs = EVENT_TABS.filter(
		(t) =>
			e.sellsTickets ||
			!SALES_TABS.includes(t.id) ||
			(t.id === 'ingreso' && data.workshop?.coveredDoor)
	)
		// Preguntas de inscripción: con base y venta de entradas.
		.filter((t) => t.id !== 'preguntas' || data.signupFieldsTab)
		// Los eventos online no tienen control de ingreso (las entradas llevan el link).
		.filter((t) => !(t.id === 'ingreso' && e.online))
		.map((t) => ({
			href: eventHref(e.slug, t.id),
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
	<header class="event-head" class:compact={editing}>
		{#if e.thumb}
			<img class="cover" src={e.thumb} alt="" />
		{:else}
			<!-- Sin imagen: el ícono grande del tipo (evento). -->
			<div class="cover type-icon" aria-hidden="true">
				<CalendarDays size={48} strokeWidth={1.75} />
			</div>
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
				{#if data.workshop}
					<!-- Talleres en varias partes (docs/talleres-partes.md) -->
					{#if data.workshop.isWorkshop}
						<Badge tone="info">{data.workshop.label}</Badge>
					{:else}
						<a
							class="part-chip"
							href="/admin/eventos/{encodeURIComponent(data.workshop.workshopSlug)}/editar#partes"
							><Badge tone="info">{data.workshop.label}</Badge>
							<span>de «{data.workshop.workshopTitle}»</span></a
						>
					{/if}
				{/if}
				{#if e.kinkyvibe}<Badge tone="info">Fondo Kinky Vibe</Badge>{/if}
				{#each e.tags.filter((t) => t !== 'KinkyVibe' && t !== e.place) as t}
					<TagChip tag={t} />
				{/each}
			</div>
		</div>
		<div class="actions">
			{#if !editing}
				<a class="kv-btn" href={eventHref(e.slug, 'editar')}><Pencil {...icon} /> Editar</a>
			{/if}
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
		<div class="transfers-notice">
			<Notice tone="warn">
				<span
					>{data.tabCounts.transfers === 1
						? 'Hay 1 transferencia esperando confirmación.'
						: `Hay ${data.tabCounts.transfers} transferencias esperando confirmación.`}</span
				>
				<a class="kv-btn small push" href={eventHref(e.slug, 'transferencias')}>Revisar</a>
			</Notice>
		</div>
	{/if}

	<Tabs {tabs} />

	<slot />
{/if}

<style>
	.event-head {
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
	.text {
		grid-area: text;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
	}
	.back {
		font-size: var(--text-xs);
		color: var(--muted);
	}
	h1 {
		font-size: var(--text-lg);
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
		gap: var(--space-3xs);
		align-items: center;
		margin-top: 0.3rem;
	}
	.part-chip {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		font-size: 0.8rem;
		color: var(--muted);
		text-decoration: none;
	}
	.part-chip:hover span {
		text-decoration: underline;
	}
	.actions {
		grid-area: actions;
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
	}
	/* el aviso (Notice) con «Revisar» a la derecha */
	.transfers-notice {
		margin: 0 0 1rem;
	}
	.transfers-notice :global(.kv-notice) {
		align-items: center;
	}
	.transfers-notice :global(.kv-notice-text) {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2xs);
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
	/* Editando en el celu: encabezado de una línea, así el formulario empieza más arriba. */
	@media (max-width: 640px) {
		.event-head.compact {
			grid-template-columns: minmax(0, 1fr);
			grid-template-areas: 'text';
			margin-bottom: var(--space-2xs);
		}
		.compact .cover,
		.compact .chips,
		.compact .where,
		.compact .actions {
			display: none;
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
			font-size: var(--text-base);
		}
	}
</style>
