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
	import GoalProgress from '$lib/components/admin/panel/GoalProgress.svelte';
	import { goalProgress } from '$lib/utils/salesGoal.js';
	import CsvButton from '$lib/components/admin/panel/CsvButton.svelte';
	import EmptyState from '$lib/components/admin/panel/EmptyState.svelte';
	import { eventPanelLink } from '$lib/admin/nav.js';
	import { dateParts, eventBadges, shortDate, timeRange } from '$lib/admin/eventFormat.js';
	import {
		FILTERS,
		filterId,
		inFilter,
		isUpcoming,
		matchesSearch,
		searchWords
	} from '$lib/admin/eventList.js';
	import { todayInArgentina } from '$lib/utils/eventDraft.js';

	/** @type {import('./$types').PageData} */
	export let data;

	const PAGE = 40;
	const icon = { size: 16, strokeWidth: 2.25, 'aria-hidden': true };

	/** @typedef {import('$lib/admin/eventList.js').EventRow} Row */

	const today = todayInArgentina(new Date(data.now));
	/** @param {Row} e */
	const upcoming = (e) => isUpcoming(e, today);
	// Cuántos hay en cada filtro y en total: de todos los eventos (los cuenta el servidor), aunque
	// la página tenga cargados solo algunos.
	$: counts = data.counts;

	// La página trae los próximos, los borradores y los pasados de los últimos meses; los
	// anteriores llegan con «Ver anteriores» (de a tandas) y se suman acá.
	/** @type {Row[]} */
	let older = [];
	let olderLeft = data.older;
	let loadingOlder = false;
	let olderError = '';
	/**
	 * Lo de la página más lo que llegó después, sin repetir, del más nuevo al más viejo.
	 * @param {Row[]} first
	 * @param {Row[]} more
	 */
	function merge(first, more) {
		const have = new Set(first.map((e) => e.slug));
		return [...first, ...more.filter((e) => !have.has(e.slug))].sort((a, b) => a.i - b.i);
	}
	$: loaded = merge(data.events, older);

	$: filter = filterId($page.url.searchParams.get('filtro'));
	let query = '';
	let shown = PAGE;
	$: words = searchWords(query);
	$: ordered = inFilter(loaded, filter, today);

	// Buscar busca en TODOS los eventos (también los que no están cargados): al instante en lo
	// cargado y, un momento después, en el servidor, que trae los que falten.
	/** @type {{ query: string, events: Row[] } | null} */
	let found = null;
	let searching = false;
	let searchError = '';
	/** @type {ReturnType<typeof setTimeout> | undefined} */
	let searchTimer;
	$: searchServer(words.join(' '));
	/** @param {string} q */
	function searchServer(q) {
		clearTimeout(searchTimer);
		searchError = '';
		if (!q) {
			searching = false;
			found = null;
			return;
		}
		searching = true;
		searchTimer = setTimeout(async () => {
			try {
				const res = await fetch(`/admin/eventos/lista.json?q=${encodeURIComponent(q)}`);
				if (!res.ok) throw new Error(String(res.status));
				const body = await res.json();
				if (words.join(' ') !== q) return;
				found = { query: q, events: body.events };
			} catch (e) {
				if (words.join(' ') === q) searchError = 'No pudimos buscar en los eventos anteriores.';
			} finally {
				if (words.join(' ') === q) searching = false;
			}
		}, 300);
	}
	$: localMatches = loaded.filter((e) => matchesSearch(e, words));
	$: visible = words.length
		? found && found.query === words.join(' ')
			? found.events
			: localMatches
		: ordered;
	$: (query, filter, (shown = PAGE));
	// «Ver anteriores»: solo en Pasados, cuando ya se ve todo lo cargado.
	$: canLoadOlder =
		!words.length && filter === 'pasados' && olderLeft > 0 && shown >= visible.length;

	async function loadOlder() {
		loadingOlder = true;
		olderError = '';
		try {
			const res = await fetch(`/admin/eventos/lista.json?anteriores=${older.length}`);
			if (!res.ok) throw new Error(String(res.status));
			const body = await res.json();
			older = [...older, ...body.events];
			olderLeft = body.remaining;
			shown = visible.length + body.events.length;
		} catch (e) {
			olderError = 'No pudimos traer los eventos anteriores. Probá de nuevo.';
		} finally {
			loadingOlder = false;
		}
	}

	$: csvHref = `/admin/eventos/eventos.csv?filtro=${filter}${
		words.length ? `&q=${encodeURIComponent(query)}` : ''
	}`;

	/** @param {Row} e */
	function warnings(e) {
		const out = [];
		if (upcoming(e) && !e.thumb) out.push('sin imagen');
		if (e.transfers) out.push(`${e.transfers} transf. por confirmar`);
		return out;
	}
</script>

<PageHeader
	title="Eventos"
	subtitle="{counts.proximos} próximos · {counts.borradores} no listados · {data.total} en total"
>
	<svelte:fragment slot="actions">
		<CsvButton href={csvHref} />
		<a class="kv-btn ghost" href="/admin/eventos/agenda"><Table2 {...icon} /> Agenda</a>
		<a class="kv-btn ghost" href="/admin/eventos/series"><Repeat {...icon} /> Series</a>
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
	{#if words.length && (searching || searchError)}
		<p class="status" role="status">
			{searchError || 'Buscando también en los eventos anteriores…'}
		</p>
	{/if}
	{#if visible.length === 0}
		<EmptyState
			icon={SearchX}
			title={words.length
				? searching
					? `Buscando “${query}”…`
					: `No encontramos eventos con “${query}”`
				: 'No hay eventos acá'}
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
							{@const progress = goalProgress(e.goal, e)}
							{#if progress}
								<!-- Con meta de venta: el avance contra la meta (no contra el cupo). -->
								<GoalProgress {progress} compact />
							{:else}
								<span class="num"
									>{e.sold}{#if e.capacity}<span class="muted"> / {e.capacity}</span>{/if}</span
								>
								<CapacityBar sold={e.sold} capacity={e.capacity} />
							{/if}
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
	{#if canLoadOlder}
		<p class="more">
			<button class="kv-btn ghost" on:click={loadOlder} disabled={loadingOlder}
				>{loadingOlder ? 'Trayendo…' : `Ver anteriores (${olderLeft})`}</button
			>
			{#if olderError}<span class="status" role="alert">{olderError}</span>{/if}
		</p>
	{/if}
</Card>

<style>
	.tools {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2xs) var(--space-xs);
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
		padding: 0.4rem var(--space-xs);
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
		font-size: var(--text-xs);
		opacity: 0.8;
	}
	.search {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		background: var(--surface);
		border: 1px solid var(--field);
		border-radius: 3em;
		padding: 0 var(--space-xs);
		flex: 1 1 16rem;
		max-width: 24rem;
		color: var(--muted);
	}
	.search input {
		border: 0;
		background: transparent;
		padding: var(--space-2xs) 0;
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
		gap: var(--space-xs);
		align-items: center;
		padding: var(--space-2xs) var(--space-xs);
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
		font-size: var(--text-lg);
	}
	.date small {
		font-size: var(--text-xs);
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
		font-size: var(--text-xs);
	}
	.badges {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-3xs);
	}
	.sales {
		display: flex;
		flex-direction: column;
		gap: var(--space-3xs);
		font-size: var(--text-xs);
	}
	.actions {
		display: flex;
		align-items: center;
		gap: var(--space-3xs);
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
		padding: var(--space-2xs) 0 var(--space-xs);
		margin: 0;
	}
	.status {
		display: block;
		margin: 0;
		padding: var(--space-2xs) var(--space-xs);
		color: var(--muted);
		font-size: var(--text-xs);
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
			gap: var(--space-3xs) var(--space-2xs);
			padding: var(--space-2xs) var(--space-xs);
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
		.sales :global(.bar),
		.sales :global(.goal-progress) {
			flex: 1;
		}
		.actions {
			grid-area: actions;
			flex-direction: column;
			align-self: start;
		}
		.actions .kv-btn {
			padding: 0.4rem var(--space-2xs);
		}
	}
</style>
