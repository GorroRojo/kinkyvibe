<script>
	/**
	 * Ficha de un evento: encabezado (imagen, título, fecha, lugar, etiquetas y acciones) y las
	 * pestañas de `EVENT_TABS` (en el celu, un botón con la pestaña actual que abre la lista, y las
	 * acciones del encabezado, más chicas, debajo: Editar y «⋯ Acciones»; gorrite, 11/10). Las
	 * pestañas con vistas (Ventas: Totales, Órdenes, Transferencias, Lista de espera; Mails: Mandar
	 * un aviso, Plantillas) muestran sus vistas como botones debajo (la lista de espera, solo con el
	 * interruptor prendido o si el evento ya la usa). Las pestañas muestran lo que hay para revisar:
	 * Ventas, las órdenes a revisar más las transferencias que esperan confirmación (y cada vista, lo
	 * suyo). Una página con `bare: true` en su load (modo puerta) se muestra sola, sin encabezado ni
	 * pestañas.
	 */
	import { page } from '$app/stores';
	import { afterNavigate } from '$app/navigation';
	import DateChangeOffer from '$lib/components/admin/DateChangeOffer.svelte';
	import { CalendarDays, Copy, Ellipsis, ExternalLink, ImageDown, Pencil } from '@lucide/svelte';
	import Notice from '$lib/components/ui/Notice.svelte';
	import Badge from '$lib/components/admin/panel/Badge.svelte';
	import Tabs from '$lib/components/ui/Tabs.svelte';
	import TagChip from '$lib/components/TagChip.svelte';
	import { EVENT_TABS, eventHref, eventTabOf } from '$lib/admin/nav.js';
	import { eventBadges, shortDate, timeRange } from '$lib/admin/eventFormat.js';

	/** @type {import('./$types').LayoutData} */
	export let data;

	const icon = { size: 16, strokeWidth: 2.25, 'aria-hidden': true };
	/** Lo que contestó «Avisar a les compradores» (se sigue viendo hasta cambiar de página). */
	/** @type {{ ok: boolean, message: string } | null} */
	let dateChangeResult = null;
	afterNavigate(({ type }) => {
		if (type !== 'form') dateChangeResult = null;
		if (moreActions) moreActions.open = false;
	});
	/** «⋯ Acciones» del celu. */
	/** @type {HTMLDetailsElement | undefined} */
	let moreActions;
	/** @param {KeyboardEvent} ev */
	function moreActionsKey(ev) {
		if (ev.key !== 'Escape' || !moreActions?.open) return;
		ev.preventDefault();
		moreActions.open = false;
		moreActions.querySelector('summary')?.focus();
	}
	/** Pestañas que solo tienen sentido si el evento vende entradas. */
	const SALES_TABS = ['ventas', 'ingreso', 'codigos', 'mails'];

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
			href: eventHref(e.slug, t.views?.[0].id ?? t.id),
			label: t.label,
			icon: t.icon,
			// Lo que hay para revisar (como en la barra lateral y «Para revisar»), no los totales: en
			// Ventas, las órdenes a revisar más las transferencias que esperan confirmación.
			count:
				t.id === 'ventas'
					? data.tabCounts.review + data.tabCounts.transfers || undefined
					: undefined
		}));
	$: here = eventTabOf($page.url.pathname);
	$: currentTab = here ? eventHref(e.slug, here.tab.views?.[0].id ?? here.tab.id) : undefined;
	/** @type {Record<string, number>} */
	$: viewCounts = {
		ordenes: data.tabCounts.review,
		transferencias: data.tabCounts.transfers,
		'lista-espera': data.tabCounts.waitlist
	};
	// Lista de espera (una vista de Ventas): con el interruptor prendido, o si el evento ya tiene
	// lista o gente anotada.
	// Gastos y reparto (prototipo): solo con su interruptor.
	$: views = (here?.tab.views ?? []).filter(
		(v) => (v.id !== 'lista-espera' || data.waitlistTab) && (v.id !== 'gastos' || data.gastosTab)
	);
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

	<!-- «Cambiaste la fecha»: después de guardar el evento con otro inicio o fin, si hay a quién
	avisar (docs/mails.md). En Mails › Mandar un aviso está su propia tarjeta. -->
	{#if data.dateChange && (data.dateChange.notice || dateChangeResult) && !$page.url.pathname.endsWith('/mail')}
		<DateChangeOffer offer={data.dateChange} slug={e.slug} bind:result={dateChangeResult} />
	{/if}

	<Tabs {tabs} current={currentTab} menu menuCaption="Pestaña" />

	{#if here?.view && views.length}
		<nav
			class="views kv-segmented"
			class:many={views.length > 3}
			aria-label="Vistas de {here.tab.label}"
		>
			{#each views as v (v.id)}
				<a href={eventHref(e.slug, v.id)} aria-current={here.view.id === v.id ? 'page' : undefined}
					>{v.label}{#if viewCounts[v.id]}<span class="count">{viewCounts[v.id]}</span>{/if}</a
				>
			{/each}
		</nav>
	{/if}

	<!-- En el celu, las acciones del encabezado van acá, más chicas: la pestaña es lo principal. -->
	<div class="mactions">
		{#if !editing}
			<a class="kv-btn ghost small" href={eventHref(e.slug, 'editar')}
				><Pencil {...icon} /> Editar</a
			>
		{/if}
		<!-- svelte-ignore a11y-no-noninteractive-element-interactions (Escape cierra) -->
		<details class="more-actions" bind:this={moreActions} on:keydown={moreActionsKey}>
			<summary class="kv-btn ghost small"><Ellipsis {...icon} /> Acciones</summary>
			<div class="more-pop">
				<a href="/calendario/{e.slug}" target="_blank" rel="noreferrer"
					><ExternalLink {...icon} /> Ver página
					<span class="sr-only">(se abre en otra pestaña)</span></a
				>
				<a href="/admin/eventos/nuevo?desde={encodeURIComponent(e.slug)}"
					><Copy {...icon} /> Duplicar</a
				>
				<a href="/calendario/{e.slug}/compartir"><ImageDown {...icon} /> Imagen para compartir</a>
			</div>
		</details>
	</div>

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
	/* Vistas de la pestaña (Ventas, Mails): botones debajo de las pestañas. */
	.views {
		margin: -0.25rem 0 1rem;
	}
	/* En el celu, con 4 vistas o más (no entran en una fila: Ventas con la lista de espera), una
	   grilla de dos columnas iguales, con las esquinas de una tarjeta en vez de la píldora; si son
	   impares, la última ocupa la fila entera. Nunca se desliza de costado. Con 2 o 3 vistas (Mails,
	   Ventas sin la lista) queda la píldora de siempre. */
	@media (max-width: 599px) {
		.views.many {
			display: grid;
			grid-template-columns: repeat(2, minmax(0, 1fr));
			width: 100%;
			box-sizing: border-box;
			border-radius: var(--radius-m);
		}
		.views.many > a {
			border-radius: calc(var(--radius-m) - 0.15rem);
			padding-inline: 0.5em;
			text-align: center;
		}
		.views.many > a:last-child:nth-child(odd) {
			grid-column: 1 / -1;
		}
	}
	.views .count {
		font-size: var(--text-xs);
		font-weight: 700;
		border-radius: var(--radius-m);
		padding: 0 0.5em;
		background: var(--counter);
		color: var(--counter-ink);
	}
	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
		white-space: nowrap;
	}
	/* Acciones del celu (debajo de las pestañas); en la compu van en el encabezado. */
	.mactions {
		display: none;
	}
	@media (max-width: 599.98px) {
		.event-head .actions {
			display: none;
		}
		.mactions {
			display: flex;
			gap: var(--space-2xs);
			align-items: center;
			margin: calc(-1 * var(--space-2xs)) 0 var(--space-s);
		}
	}
	.more-actions {
		position: relative;
	}
	.more-actions summary {
		list-style: none;
		cursor: pointer;
	}
	.more-actions summary::-webkit-details-marker {
		display: none;
	}
	.more-pop {
		position: absolute;
		left: 0;
		top: calc(100% + 0.25rem);
		z-index: 15;
		min-width: 15rem;
		display: flex;
		flex-direction: column;
		padding: var(--space-3xs);
		background: var(--surface);
		border: 1px solid var(--line);
		border-radius: var(--round);
		box-shadow: var(--shadow-2);
	}
	.more-pop a {
		display: flex;
		align-items: center;
		gap: 0.6em;
		min-height: var(--tap);
		padding: 0 var(--space-xs);
		border-radius: var(--radius-s);
		color: var(--text);
		text-decoration: none;
	}
	.more-pop a:hover,
	.more-pop a:focus-visible {
		background: var(--surface-2);
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
