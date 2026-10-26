<script>
	import ListSeoHead from '$lib/components/ListSeoHead.svelte';
	import { linkPreviewOf, upcomingDescription } from '$lib/utils/seo.js';
	import { userConfig } from '$lib/utils/stores.js';
	import {
		currentMonth,
		defaultCalendarMonth,
		isCalendarMonth,
		isCurrent,
		monthCountLabel,
		monthHasPastEvents
	} from '$lib/utils/allPosts';
	import { browser } from '$app/environment';
	import Calendar from '$lib/components/Calendar.svelte';
	import PostList from '$lib/components/PostList.svelte';
	import { addMonths, format, isSameMonth, isPast } from 'date-fns';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { toArgentina, parseSiteDate } from '$lib/utils/dates.js';
	import CalendarHeader from '$lib/components/CalendarHeader.svelte';
	import CardRow from '$lib/components/CardRow.svelte';
	import FeedLinks from '$lib/components/FeedLinks.svelte';
	import { partLabel } from '$lib/utils/partes.js';
	export let data;
	let calendarioPosts = data.posts.filter((p) => p.meta.layout == 'calendario');
	// «Parte N de M» de los talleres en varias partes (lo agrega el servidor, también a los pasados
	// de cada mes).
	const partLabels = new Map(
		calendarioPosts
			.filter((p) => p.meta.parte)
			.map((p) => [String(p.meta.postID), /** @type {{ n: number, m: number }} */ (p.meta.parte)])
	);
	// De los pasados viene solo el mes que se abrió (data.pastMonth), con lo que usa la grilla; los
	// de otro mes se piden al ir a ese mes (docs/seo.md). Con «Mostrar eventos pasados», la lista
	// los necesita enteros: también de a un mes, el que se está viendo (?enteros=1), en vez de
	// todos juntos. Después de un mes futuro no hay nada que pedir.
	const this_month = currentMonth();
	/** Meses cuyos pasados ya llegaron (o se están pidiendo), para la grilla. */
	const pastMonths = new Set([data.pastMonth]);
	/** Meses cuyos pasados ya llegaron enteros (o se están pidiendo), para la lista. */
	const fullMonths = new Set();
	/** Los pasados que ya llegaron enteros: los únicos pasados que muestra la lista. */
	let fullPast = new Set();
	$: listPosts = calendarioPosts.filter((p) => isCurrent(p) || fullPast.has(p.path));
	$: if (browser && view_month <= this_month) {
		if ($userConfig.show_past_events) {
			if (!fullMonths.has(view_month)) loadPastMonth(view_month, true);
		} else if (!pastMonths.has(view_month)) loadPastMonth(view_month, false);
	}
	/**
	 * @param {string} month yyyy-MM
	 * @param {boolean} full enteros (para la lista) o solo lo de la grilla
	 */
	function loadPastMonth(month, full) {
		const marks = full ? [pastMonths, fullMonths] : [pastMonths];
		for (const m of marks) m.add(month);
		fetch(`/api/calendario/pasados?mes=${month}${full ? '&enteros=1' : ''}`)
			.then((r) => {
				if (!r.ok) throw new Error('/api/calendario/pasados: ' + r.status);
				return r.json();
			})
			.then((/** @type {ProcessedPost[]} */ posts) => {
				for (const p of posts) {
					if (p.meta.parte) partLabels.set(String(p.meta.postID), p.meta.parte);
				}
				const arrived = new Map(posts.map((p) => [p.path, p]));
				// Enteros reemplazan a los de la grilla; los de la grilla no pisan a los enteros.
				calendarioPosts = [
					...calendarioPosts.map((p) =>
						full && arrived.has(p.path) ? /** @type {ProcessedPost} */ (arrived.get(p.path)) : p
					),
					...posts.filter((p) => !calendarioPosts.some((c) => c.path === p.path))
				];
				if (full) fullPast = new Set([...fullPast, ...arrived.keys()]);
			})
			.catch(() => {
				for (const m of marks) m.delete(month);
			});
	}
	/** @param {ProcessedPost[]} posts */
	const daysOf = (posts) =>
		posts.reduce((dates, post, i) => {
			let start_date = format(toArgentina(post.meta.start), 'yyyy-MM-dd');
			// @ts-ignore
			if (dates[start_date]) {
				// @ts-ignore
				dates[start_date].push({ i, ...post });
			} else {
				// @ts-ignore
				dates[start_date] = [{ i, ...post }];
			}
			return dates;
		}, /** @type {Record<string, Array<ProcessedPost & {i: number}>>} */ ({}));
	$: days = daysOf(calendarioPosts);

	// The viewed month lives in the URL (?viewdate=yyyy-MM), not in a module-level store:
	// a store shared by every request would leak one visitor's month into the next SSR.
	// El mes de hoy en hora de Argentina; si todos sus eventos ya empezaron, abre en el siguiente.
	// (los próximos ya están todos: los pasados que lleguen después no lo cambian)
	const default_month = defaultCalendarMonth(daysOf(calendarioPosts));
	$: viewdate_param = $page.url.searchParams.get('viewdate');
	$: view_month = isCalendarMonth(viewdate_param)
		? /** @type {string} */ (viewdate_param)
		: default_month;
	// only recomputed when the month string changes, so the grid isn't re-keyed needlessly
	$: view_date = new Date(view_month + '-01T00:00');
	// "Mostrar/Ocultar eventos pasados" only when this month has past events (gorrite's call)
	$: month_has_past = monthHasPastEvents(calendarioPosts, view_month);
	// Con los pasados a la vista, abajo de la lista se sigue con el mes anterior (hasta el del
	// evento más viejo). La dirección es la de siempre (?viewdate=yyyy-MM, como las flechas).
	$: prev_month = format(addMonths(view_date, -1), 'yyyy-MM');
	$: show_prev =
		$userConfig.show_past_events &&
		view_month <= this_month &&
		!!data.firstMonth &&
		prev_month >= data.firstMonth;
	/** @param {string} month yyyy-MM */
	const monthHref = (month) => {
		const url = new URL($page.url);
		url.hash = '';
		if (month === default_month) url.searchParams.delete('viewdate');
		else url.searchParams.set('viewdate', month);
		return url.pathname + url.search;
	};
	/** @param {MouseEvent} e */
	async function showPrevMonth(e) {
		if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
		e.preventDefault();
		await goto(monthHref(prev_month), { noScroll: true, keepFocus: true });
		document.getElementById('postlist')?.scrollIntoView({ block: 'start' });
	}
	// En el celu primero la lista; la grilla del mes, si la piden (en la compu, siempre al lado).
	let showGrid = false;
	// Los textos de la vista previa (los del panel; docs/compartir.md).
	$: previewTexts = linkPreviewOf($page.data).texts;
</script>

<svelte:head>
	<title>Calendario · Kinky Vibe</title>
</svelte:head>
<!-- La vista previa al compartir (docs/compartir.md). -->
<ListSeoHead
	section="calendario"
	card="calendario"
	description={upcomingDescription(
		data.posts,
		previewTexts['calendario.description'],
		Date.now(),
		previewTexts['calendario.upcomingPrefix']
	)}
/>

<!-- Sin título grande: el menú ya dice dónde estás (pedido de gorrite, 5/10). -->
<h1 class="visually-hidden">Calendario</h1>
<FeedLinks base="/calendario" title="Calendario · Kinky Vibe" ics="/calendario.ics" />

<!-- Los próximos eventos en una fila arriba del calendario, como antes (pedido de gorrite, 5/10).
     La imagen de la primera tarjeta es el LCP: las dos primeras cargan enseguida (docs/seo.md). -->
<div class="cardrow">
	<CardRow
		items={calendarioPosts
			.filter((p) => !isPast(parseSiteDate(p.meta.start)))
			.sort((a, b) => (a.meta.start > b.meta.start ? 1 : -1))}
		--color-1="transparent"
		setId={false}
		eager={2}
	/>
</div>

<div id="container">
	<div id="calendar">
		<CalendarHeader {view_date} {default_month} />
		<button
			type="button"
			class="pill-btn ghost small grid-toggle tap-target"
			aria-expanded={showGrid}
			aria-controls="month-grid"
			on:click={() => (showGrid = !showGrid)}
		>
			{showGrid ? 'Ocultar la grilla del mes' : 'Ver el mes en grilla'}
		</button>
		<div class="month-grid" id="month-grid" class:open={showGrid}>
			<Calendar {view_date} let:date let:today let:past>
				{@const events = days?.[date]}
				{@const featuredEvent =
					events?.filter((e) => e.meta.tags.includes('KinkyVibe'))?.[0] ??
					events?.filter((e) => e.meta.featured)?.[0]}
				{@const background = featuredEvent?.meta?.featured}
				<div
					class="day"
					class:today
					class:past
					style={background ? `--event-image: url("${background}");` : ''}
					style:--evt-color={featuredEvent?.meta?.tags?.includes('KinkyVibe')
						? 'var(--1)'
						: 'var(--2)'}
				>
					<div class="date" class:today>
						{Number(date.slice(8))}
					</div>
					{#if events}
						<div class="dot"></div>
						<!-- sort a copy: sorting `events` in place made featuredEvent depend on render order -->
						{#each [...events].sort( (a, b) => (parseSiteDate(a.meta.start).getTime() > parseSiteDate(b.meta.start).getTime() ? 1 : -1) ) as event}
							{@const start = toArgentina(event.meta.start)}
							<a
								href={event.path}
								class="bar"
								class:dim={event.meta.status == 'cancelado'}
								style:--evt-color={event?.meta?.tags?.includes('KinkyVibe')
									? 'var(--1)'
									: 'var(--2)'}
							>
								<span>
									{event.meta.title ?? ' '}
									{#if event.meta.parte}
										&sdot; <em class="part">{partLabel(event.meta.parte.n, event.meta.parte.m)}</em>
									{/if}
									&sdot;
									<strong>{format(start, 'HH:mm')}</strong>
								</span>
							</a>
						{/each}
					{/if}
				</div>
			</Calendar>
		</div>
	</div>
	<div id="postlist">
		<PostList
			heading="Los eventos del mes"
			filter={{ prop: 'visible', value: true }}
			pastEventsToggle={month_has_past}
			amountLabel={(n) => monthCountLabel(view_month, n)}
			posts={listPosts
				.map((p) => ({
					meta: {
						...p.meta,
						published_date: p.meta.start
					},
					visible: isSameMonth(toArgentina(p.meta.start), view_date),
					path: p.path
				}))
				.sort((a, b) => (a.meta.start > b.meta.start ? 1 : -1))}
		/>
		{#if show_prev}
			<p class="prev-month">
				<a
					class="pill-btn ghost"
					href={monthHref(prev_month)}
					data-sveltekit-noscroll
					on:click={showPrevMonth}>Mostrar el mes anterior</a
				>
			</p>
		{/if}
		<p class="subscribe">
			También podés
			<a
				href="https://calendar.google.com/calendar/r?cid=webcal%3A%2F%2Fkinkyvibe.ar%2Fcalendario.ics"
				target="_blank"
			>
				suscribirte a este calendario en google
			</a>
			para nunca perderte de nada!
		</p>
		<p class="series-link">
			¿Te gusta algo que se repite? <a href="/wiki#series">Mirá todas las series</a> y seguí sus próximas
			ediciones.
		</p>
	</div>
</div>

<style lang="scss">
	.prev-month {
		text-align: center;
		margin: var(--space-s) auto 0;
	}
	.series-link {
		font-size: var(--step-1);
		line-height: 1.6;
		text-align: center;
		margin: -1em auto 2em;
		max-width: min(50rem, calc(100% - 32px));
		a {
			font-weight: 700;
		}
	}
	.subscribe {
		font-size: var(--step-1);
		text-align: center;
		background: var(--1-dark);
		color: white;
		border-radius: var(--round);
		padding: 1em 1.5em;
		margin: 2em auto;
		max-width: min(50rem, calc(100% - 32px));
		line-height: 1.6;
		a {
			background: var(--surface);
			color: var(--1-ink);
			font-weight: 700;
			text-decoration: none;
			padding: 0.1em 0.6em;
			border-radius: var(--round-pill);
			box-decoration-break: clone;
			-webkit-box-decoration-break: clone;
			&:hover {
				color: var(--1-ink);
				background: var(--1-tint);
			}
		}
	}
	.cardrow {
		max-width: 1200px;
		margin-inline: auto;
	}
	strong {
		color: unset;
	}
	#calendar {
		max-width: 50rem;
		margin-inline: auto;
		padding-inline: var(--space-xs);
		margin-bottom: var(--space-s);
		width: 100%;
		min-height: 0;
		min-width: 0;
		display: flex;
		flex-direction: column;
	}
	.grid-toggle {
		align-self: center;
		margin-top: var(--space-2xs);
	}
	.month-grid {
		display: none;
		height: 36em;
		min-height: 0;
		padding-block: var(--space-s);
	}
	.month-grid.open {
		display: block;
	}
	.day.past {
		opacity: 0.35 !important;
	}
	.day.today {
		outline: 3px solid var(--1);
		opacity: 1;
		.date {
			scale: 1.2;
		}
	}
	.day {
		opacity: 0.7;
		display: flex;
		padding: 0;
		position: relative;
		width: 100%;
		height: 100%;
		aspect-ratio: 1/1;
		min-height: 0;
		scale: 0.9;
		flex-direction: column;
		justify-content: start;
		align-items: stretch;
		gap: 0.2em;
		background-color: white;
		border: 0;
		border-radius: 0.1rem 0.1rem 1rem 1rem;
		transition: all 0.1s ease-in;
		.dot {
			display: none;
			min-height: 0;
		}
		.bar {
			width: 100%;
			height: auto;
			min-height: 0;
			z-index: 1;
			outline: 3px solid var(--evt-color);
			outline-offset: -2px;
			transition: 200ms ease-in;

			font-size: 1.3em;
			overflow: hidden;
			color: white;
			text-align: left;
			text-overflow: ellipsis;
			text-decoration: none !important;
			white-space: nowrap;
			background: var(--evt-color);
			transition: 100ms;
		}
		.dim {
			opacity: 0.5;
			pointer-events: none;
		}

		.date {
			display: grid;
			place-content: center;
			font-size: 2em;
			color: rgba(1, 1, 1, 0.5);
			position: absolute;
			top: 0;
			right: 0;
			left: 0;
			bottom: 0;
		}
	}

	.day:has(.dot) {
		cursor: pointer;
		opacity: 1;
		&:hover {
			gap: 0.5em;
			.bar {
				height: 100%;
				white-space: normal;
			}
		}
		.date {
			display: none;
		}
		--post-color: var(--evt-color);
		background: var(
			--event-image,
			linear-gradient(
				to bottom right,
				color-mix(in srgb, var(--post-color, var(--2)) 70%, white) 0%,
				var(--post-color, var(--2)) 50%,
				color-mix(in srgb, var(--post-color, var(--2)) 70%, black) 100%
			)
		);
		background-position: center center;
		background-repeat: repeat;
		background-size: cover;
	}
	@media (min-width: 1200px) {
		#container {
			display: grid;
			grid-template-areas: 'postlist calendar';
			grid-template-columns: 1fr 1fr;
			margin-inline: 1em 3em;
			gap: 2em;
			position: sticky;
			top: 0;
		}
		#calendar {
			grid-area: calendar;
			min-width: 0;
			height: 90vh;
			position: sticky;
			top: 0;
		}
		/* en la compu la grilla va siempre al lado de la lista */
		.grid-toggle {
			display: none;
		}
		.month-grid {
			display: block;
			flex: 1;
			height: auto;
		}
		#postlist {
			grid-area: postlist;
			min-width: 0;
		}
	}
</style>
