<script>
	import { page } from '$app/stores';
	import {
		CalendarPlus,
		Copy,
		ExternalLink,
		FileSpreadsheet,
		Repeat,
		Search,
		SearchX,
		Table2
	} from '@lucide/svelte';
	import PageHeader from '$lib/components/admin/panel/PageHeader.svelte';
	import Card from '$lib/components/admin/panel/Card.svelte';
	import Badge from '$lib/components/admin/panel/Badge.svelte';
	import CapacityBar from '$lib/components/admin/panel/CapacityBar.svelte';
	import CsvButton from '$lib/components/admin/panel/CsvButton.svelte';
	import EmptyState from '$lib/components/admin/panel/EmptyState.svelte';
	import { eventPanelLink } from '$lib/admin/nav.js';
	import {
		dateParts,
		eventBadges,
		foldSearch,
		shortDate,
		timeRange
	} from '$lib/admin/eventFormat.js';
	import { todayInArgentina } from '$lib/utils/eventDraft.js';

	/** @type {import('./$types').PageData} */
	export let data;

	const PAGE = 40;
	const icon = { size: 16, strokeWidth: 2.25, 'aria-hidden': true };

	/** @typedef {(typeof data.events)[number]} Row */

	const FILTERS = /** @type {const} */ ([
		{ id: 'proximos', label: 'Próximos' },
		{ id: 'pasados', label: 'Pasados' },
		{ id: 'borradores', label: 'Borradores' },
		{ id: 'sin-imagen', label: 'Sin imagen' }
	]);

	const today = todayInArgentina(new Date(data.now));
	/** @param {Row} e */
	const upcoming = (e) => !!e.start && e.start.slice(0, 10) >= today;

	/** @type {Record<string, (e: Row) => boolean>} */
	const test = {
		proximos: (e) => upcoming(e) && !e.unpublished,
		pasados: (e) => !upcoming(e),
		borradores: (e) => e.unlisted && !e.unpublished,
		'sin-imagen': (e) => upcoming(e) && !e.thumb && !e.unpublished
	};
	const counts = Object.fromEntries(
		FILTERS.map((f) => [f.id, data.events.filter(test[f.id]).length])
	);

	$: filter = FILTERS.some((f) => f.id === $page.url.searchParams.get('filtro'))
		? /** @type {string} */ ($page.url.searchParams.get('filtro'))
		: 'proximos';
	let query = '';
	let shown = PAGE;
	$: words = foldSearch(query).split(/\s+/).filter(Boolean);
	$: inFilter = data.events.filter(test[filter]);
	// Próximos: del más cercano al más lejano. El resto: del más nuevo al más viejo.
	$: ordered =
		filter === 'proximos' || filter === 'sin-imagen' ? [...inFilter].reverse() : inFilter;
	$: visible = words.length
		? // Buscando se busca en todos los eventos, no solo en el filtro.
			data.events.filter((e) => {
				const hay = foldSearch(`${e.title} ${e.slug} ${e.locationName} ${e.location} ${e.place}`);
				return words.every((w) => hay.includes(w));
			})
		: ordered;
	$: (query, filter, (shown = PAGE));

	/** @param {Row} e */
	function warnings(e) {
		const out = [];
		if (upcoming(e) && !e.thumb) out.push('sin imagen');
		if (e.transfers) out.push(`${e.transfers} transf. por confirmar`);
		return out;
	}

	/** @type {import('$lib/admin/csv.js').CsvColumn<Row>[]} */
	const columns = [
		{ label: 'slug', key: 'slug' },
		{ label: 'título', key: 'title' },
		{ label: 'empieza', key: 'start' },
		{ label: 'termina', key: 'end' },
		{ label: 'estado', key: 'status' },
		{ label: 'no listado', value: (e) => (e.unlisted ? 'sí' : '') },
		{ label: 'lugar', key: 'locationName' },
		{ label: 'dirección', key: 'location' },
		{ label: 'región', key: 'place' },
		{ label: 'imagen', value: (e) => (e.thumb ? 'sí' : 'no') },
		{ label: 'vende entradas', value: (e) => (e.sellsTickets ? 'sí' : '') },
		{ label: 'vendidas', value: (e) => (e.sellsTickets ? e.sold : '') },
		{ label: 'cupo', value: (e) => e.capacity ?? '' },
		{ label: 'transferencias pendientes', value: (e) => e.transfers || '' }
	];
</script>

<PageHeader
	title="Eventos"
	subtitle="{counts.proximos} próximos · {counts.borradores} borradores · {data.events
		.length} en total"
>
	<svelte:fragment slot="actions">
		<CsvButton rows={visible} {columns} filename="eventos-{filter}.csv" />
		<a class="kv-btn ghost" href="/admin/eventos/agenda"><Table2 {...icon} /> Agenda</a>
		{#if data.seriesOn}<a class="kv-btn ghost" href="/admin/eventos/series"
				><Repeat {...icon} /> Series</a
			>{/if}
		<a class="kv-btn ghost" href="/admin/eventos/importar"
			><FileSpreadsheet {...icon} /> Importar planilla</a
		>
		<a class="kv-btn" href="/admin/eventos/nuevo"><CalendarPlus {...icon} /> Cargar evento</a>
	</svelte:fragment>
</PageHeader>

<div class="tools">
	<nav class="chips" aria-label="Filtrar eventos">
		{#each FILTERS as f (f.id)}
			<a
				class="chip"
				class:on={!words.length && filter === f.id}
				href="?filtro={f.id}"
				data-sveltekit-replacestate
				data-sveltekit-noscroll
				aria-current={!words.length && filter === f.id ? 'page' : undefined}
				>{f.label} <span class="n">{counts[f.id]}</span></a
			>
		{/each}
	</nav>
	<label class="search">
		<Search {...icon} />
		<span class="sr-only">Buscar un evento</span>
		<input
			type="search"
			bind:value={query}
			placeholder="Buscar: picantearla, shibari, córdoba…"
			autocomplete="off"
		/>
	</label>
</div>

<Card padded={false}>
	{#if visible.length === 0}
		<EmptyState
			icon={SearchX}
			title={words.length ? `No encontramos eventos con “${query}”` : 'No hay eventos acá'}
			text={filter === 'sin-imagen' && !words.length
				? 'Todos los próximos eventos tienen imagen.'
				: ''}
		/>
	{:else}
		<ul class="list">
			{#each visible.slice(0, shown) as e (e.slug)}
				{@const d = dateParts(e.start)}
				{@const warn = warnings(e)}
				<li class:past={!upcoming(e)}>
					<div class="date" aria-hidden="true">
						{#if d}<small>{d.weekday}</small><b>{d.day}</b><small>{d.month}</small>{:else}<small
								>sin fecha</small
							>{/if}
					</div>
					{#if e.thumb}
						<img class="thumb" src={e.thumb} alt="" loading="lazy" decoding="async" />
					{:else}
						<div class="thumb noimg" aria-hidden="true"></div>
					{/if}
					<div class="info">
						<a class="title" href={eventPanelLink(e.slug, { tickets: e.sellsTickets })}>{e.title}</a
						>
						<span class="meta">
							<span class="sr-only">{shortDate(e.start)}</span>
							{#if d && !upcoming(e)}{d.year} ·
							{/if}{timeRange(e.start, e.end) || 'sin hora'}
							{#if e.locationName || e.place}· {e.locationName || e.place}{/if}
						</span>
						<span class="badges">
							{#each eventBadges(e) as b}<Badge tone={b.tone}>{b.label}</Badge>{/each}
							{#each warn as w}<Badge tone="warn">{w}</Badge>{/each}
						</span>
					</div>
					<div class="sales">
						{#if e.sellsTickets}
							<span class="num"
								>{e.sold}{#if e.capacity}<span class="muted"> / {e.capacity}</span>{/if}</span
							>
							<CapacityBar sold={e.sold} capacity={e.capacity} />
						{/if}
					</div>
					<div class="actions">
						<a
							class="kv-btn ghost"
							href="/admin/eventos/nuevo?desde={encodeURIComponent(e.slug)}"
							aria-label="Duplicar {e.title}"><Copy {...icon} /> Duplicar</a
						>
						<a
							class="icon-link"
							href="/calendario/{e.slug}"
							target="_blank"
							rel="noreferrer"
							title="Ver la página"
							aria-label="Ver la página de {e.title} (se abre en otra pestaña)"
							><ExternalLink {...icon} /></a
						>
					</div>
				</li>
			{/each}
		</ul>
		{#if visible.length > shown}
			<p class="more">
				<button class="kv-btn ghost" on:click={() => (shown += PAGE)}
					>Ver más ({visible.length - shown})</button
				>
			</p>
		{/if}
	{/if}
</Card>

<style>
	.tools {
		display: flex;
		flex-wrap: wrap;
		gap: 0.6rem 1rem;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 1rem;
	}
	.chips {
		display: flex;
		gap: 0.4rem;
		overflow-x: auto;
		scrollbar-width: thin;
		padding-bottom: 2px;
	}
	.chip {
		display: inline-flex;
		align-items: center;
		gap: 0.4em;
		padding: 0.4rem 0.9rem;
		min-height: 2.5rem;
		box-sizing: border-box;
		border-radius: 3em;
		background: var(--surface);
		border: 1px solid var(--field);
		font-weight: 700;
		color: var(--accent);
		text-decoration: none;
		white-space: nowrap;
	}
	.chip.on {
		background: var(--accent);
		border-color: var(--accent);
		color: var(--accent-ink);
	}
	.chip .n {
		font-size: 0.78rem;
		opacity: 0.8;
	}
	.search {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		background: var(--surface);
		border: 1px solid var(--field);
		border-radius: 3em;
		padding: 0 0.9rem;
		flex: 1 1 16rem;
		max-width: 24rem;
		color: var(--muted);
	}
	.search input {
		border: 0;
		background: transparent;
		padding: 0.55rem 0;
		min-height: 2.5rem;
		width: 100%;
		min-width: 0;
		color: var(--text);
	}
	.search input:focus {
		outline: none;
	}
	.search:focus-within {
		outline: 2px solid var(--link);
		outline-offset: 2px;
	}
	.list {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.list li {
		display: grid;
		grid-template-columns: 3.2rem 3.2rem minmax(0, 1fr) 8rem auto;
		gap: 0.8rem;
		align-items: center;
		padding: 0.7rem 1rem;
		border-bottom: 1px solid var(--line);
	}
	.list li:last-child {
		border-bottom: 0;
	}
	.list li:hover {
		background: var(--surface-2);
	}
	.past {
		opacity: 0.85;
	}
	.date {
		display: flex;
		flex-direction: column;
		align-items: center;
		line-height: 1.05;
		color: var(--accent-dark);
	}
	.date b {
		font-size: 1.35rem;
	}
	.date small {
		font-size: 0.72rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		font-weight: 700;
	}
	.thumb {
		width: 3.2rem;
		height: 3.2rem;
		border-radius: var(--round);
		object-fit: cover;
		background: var(--surface-2);
	}
	.noimg {
		background: linear-gradient(135deg, var(--1-light), var(--2-light));
	}
	.info {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
		min-width: 0;
	}
	.title {
		font-weight: 700;
		text-decoration: none;
		overflow-wrap: anywhere;
	}
	.title:hover {
		text-decoration: underline;
	}
	.meta {
		color: var(--muted);
		font-size: 0.85rem;
	}
	.badges {
		display: flex;
		flex-wrap: wrap;
		gap: 0.3rem;
	}
	.sales {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		font-size: 0.85rem;
	}
	.actions {
		display: flex;
		align-items: center;
		gap: 0.3rem;
	}
	.icon-link {
		display: inline-grid;
		place-items: center;
		width: 2.5rem;
		height: 2.5rem;
		border-radius: 50%;
		color: var(--muted);
	}
	.icon-link:hover {
		background: var(--surface-2);
		color: var(--link);
	}
	.more {
		text-align: center;
		padding: 0.5rem 0 1rem;
		margin: 0;
	}
	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
		white-space: nowrap;
	}
	@media (max-width: 720px) {
		.list li {
			grid-template-columns: 2.8rem minmax(0, 1fr) auto;
			grid-template-areas:
				'date info actions'
				'date sales sales';
			gap: 0.3rem 0.7rem;
			padding: 0.7rem 0.8rem;
		}
		.date {
			grid-area: date;
		}
		.thumb {
			display: none;
		}
		.info {
			grid-area: info;
		}
		.sales {
			grid-area: sales;
			flex-direction: row;
			align-items: center;
		}
		.sales:empty {
			display: none;
		}
		.sales :global(.bar) {
			flex: 1;
		}
		.actions {
			grid-area: actions;
			flex-direction: column;
			align-self: start;
		}
		.actions .kv-btn {
			padding: 0.4rem 0.7rem;
		}
	}
</style>
