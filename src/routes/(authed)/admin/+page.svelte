<script>
	/**
	 * Inicio del panel: saludo, "Hoy" (si hay un evento hoy), acciones rápidas, plata del mes,
	 * "para revisar", "desde tu última visita" y todos los próximos eventos; en una columna a la
	 * derecha (en pantallas anchas; si no, abajo) las ventas de esta noche, la agenda de la semana
	 * y la actividad. Todo tiene estado vacío: sin base de datos se ve igual, con lo que sale del
	 * markdown.
	 */
	import { enhance } from '$app/forms';
	import Card from '$lib/components/admin/panel/Card.svelte';
	import ActivityFeed from '$lib/components/admin/inicio/ActivityFeed.svelte';
	import Agenda from '$lib/components/admin/inicio/Agenda.svelte';
	import SalesCard from '$lib/components/admin/inicio/SalesCard.svelte';
	import Stat from '$lib/components/admin/panel/Stat.svelte';
	import Badge from '$lib/components/admin/panel/Badge.svelte';
	import CapacityBar from '$lib/components/admin/panel/CapacityBar.svelte';
	import EmptyState from '$lib/components/admin/panel/EmptyState.svelte';
	import CsvButton from '$lib/components/admin/panel/CsvButton.svelte';
	import { navItem, navLink } from '$lib/admin/nav.js';
	import { checkinHref, eventLink } from '$lib/admin/links.js';
	import { formatARS, formatSignedARS } from '$lib/utils/money.js';
	import {
		Activity,
		ArrowLeftRight,
		Bell,
		CalendarDays,
		CalendarPlus,
		Check,
		ChevronDown,
		ChevronRight,
		FilePen,
		FileSpreadsheet,
		ImageOff,
		Link,
		Mail,
		ScanLine,
		Tag,
		TriangleAlert
	} from '@lucide/svelte';

	export let data;
	export let form;

	const TZ = 'America/Argentina/Buenos_Aires';
	const REVIEW_ICONS = /** @type {Record<string, any>} */ ({
		transfer: ArrowLeftRight,
		alert: TriangleAlert,
		mail: Mail,
		link: Link,
		bell: Bell,
		image: ImageOff,
		draft: FilePen
	});

	$: user = data.user;
	$: firstName = String(user?.name || user?.login || '').split(/\s+/)[0];
	$: todayRaw = new Intl.DateTimeFormat('es-AR', {
		timeZone: TZ,
		weekday: 'long',
		day: 'numeric',
		month: 'long'
	}).format(data.now);
	$: todayLabel = todayRaw.charAt(0).toUpperCase() + todayRaw.slice(1);
	$: todoCount = data.todo.length;
	$: checkinItem = navItem('checkin');
	$: checkinGeneral = checkinItem ? navLink(checkinItem) : null;
	$: todayEvent = data.todayEvents.find((e) => e.ticketed) ?? data.todayEvents[0];
	$: checkinQuick = todayEvent?.ticketed ? checkinHref(todayEvent.slug) : checkinGeneral;

	const dayFmt = new Intl.DateTimeFormat('es-AR', { timeZone: TZ, day: 'numeric' });
	const monFmt = new Intl.DateTimeFormat('es-AR', { timeZone: TZ, month: 'short' });
	const wdFmt = new Intl.DateTimeFormat('es-AR', { timeZone: TZ, weekday: 'short' });
	const timeFmt = new Intl.DateTimeFormat('es-AR', {
		timeZone: TZ,
		hour: '2-digit',
		minute: '2-digit'
	});
	const shortFmt = new Intl.DateTimeFormat('es-AR', {
		timeZone: TZ,
		day: 'numeric',
		month: 'short'
	});
	const whenFmt = new Intl.DateTimeFormat('es-AR', {
		timeZone: TZ,
		weekday: 'short',
		day: 'numeric',
		month: 'short',
		hour: '2-digit',
		minute: '2-digit'
	});
	/** @param {string} iso */
	const monthDay = (iso) => shortFmt.format(new Date(iso + 'T12:00:00-03:00'));

	/** @param {number} ms */
	function ago(ms) {
		const diff = data.now - ms;
		if (diff < 60_000) return 'recién';
		if (diff < 3_600_000) return `hace ${Math.round(diff / 60_000)} min`;
		if (diff < 86_400_000) return `hace ${Math.round(diff / 3_600_000)} h`;
		return whenFmt.format(ms);
	}

	/**
	 * @param {import('$lib/server/admin/inicio.js').UpcomingEvent} e
	 * @returns {{ tone: 'ok' | 'info' | 'warn' | 'bad' | 'neutral', text: string }}
	 */
	function statusBadge(e) {
		if (e.draft) return { tone: 'neutral', text: 'Borrador' };
		switch (e.status) {
			case 'cancelado':
				return { tone: 'bad', text: 'Cancelado' };
			case 'agotadas':
				return { tone: 'warn', text: 'Agotadas' };
			case 'anunciado':
				return { tone: 'info', text: 'Anunciado' };
			default:
				return { tone: 'ok', text: 'Abierto' };
		}
	}

	/** @param {number} n @param {string} one @param {string} many */
	const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

	$: fondo = data.fondo;
	$: fondoPct = fondo && fondo.goal ? Math.floor((fondo.collected / fondo.goal) * 100) : 0;

	/** @type {import('$lib/admin/csv.js').CsvColumn<import('$lib/server/admin/inicio.js').ActivityItem>[]} */
	const activityColumns = [
		{ label: 'Cuándo', value: (r) => whenFmt.format(r.at) },
		{ label: 'Qué', key: 'title' },
		{ label: 'Quién', key: 'who' },
		{ label: 'Detalle', key: 'detail' }
	];
	/** @type {import('$lib/admin/csv.js').CsvColumn<import('$lib/server/admin/inicio.js').UpcomingEvent>[]} */
	const eventColumns = [
		{ label: 'Fecha', key: 'day' },
		{ label: 'Evento', key: 'title' },
		{ label: 'Estado', value: (e) => statusBadge(e).text },
		{ label: 'Lugar', key: 'location' },
		{ label: 'Vendidas', key: 'sold' },
		{ label: 'Reservadas', key: 'held' },
		{ label: 'Cupo', key: 'capacity' },
		{ label: 'Recaudado', key: 'revenue' },
		{ label: 'Neto del fondo', value: (e) => (e.fondoEnabled ? e.fondoNet : '') }
	];

	let resending = '';
</script>

<svelte:head><title>Inicio · Panel</title></svelte:head>

<div class="inicio">
	<header class="hello">
		<h1>¡Hola{firstName ? `, ${firstName}` : ''}!</h1>
		<p class="muted">
			<span>{todayLabel}</span>
			·
			{#if todoCount}
				<a href="#para-revisar">{plural(todoCount, 'cosa para revisar', 'cosas para revisar')}</a>
			{:else}
				todo al día
			{/if}
			{#if data.todayEvents.length}
				· hoy hay {data.todayEvents.map((e) => e.title).join(' y ')}
			{/if}
		</p>
	</header>

	<div class="layout">
		<div class="main-col">
			{#each data.todayEvents as e (e.slug)}
				<section class="today" aria-label="Hoy">
					<div class="today-text">
						<small class="kicker">Hoy · {timeFmt.format(new Date(e.start))}</small>
						<h2>{e.title}</h2>
						{#if e.location}<p class="place">{e.location}</p>{/if}
						{#if e.ticketed}
							<p class="today-nums">
								<span
									><b class="num">{e.sold}</b>{e.capacity ? ` / ${e.capacity}` : ''} vendidas</span
								>
								<span><b class="num">{e.checkedIn}</b> de {e.issued} ingresaron</span>
							</p>
						{:else}
							<p class="today-nums">Este evento no vende entradas por la página.</p>
						{/if}
					</div>
					{#if e.ticketed}
						<a class="checkin-big" href={checkinHref(e.slug)}>
							<ScanLine size={28} aria-hidden="true" />
							<span>Abrir check-in</span>
						</a>
					{/if}
				</section>
			{/each}

			<nav class="quick" aria-label="Acciones rápidas">
				<a class="kv-btn" href="/admin/eventos/nuevo"
					><CalendarPlus size={18} aria-hidden="true" /> Cargar evento</a
				>
				<a class="kv-btn ghost" href="/admin/eventos/importar"
					><FileSpreadsheet size={18} aria-hidden="true" /> Importar planilla</a
				>
				{#if checkinQuick}
					<a class="kv-btn ghost" href={checkinQuick}
						><ScanLine size={18} aria-hidden="true" /> Check-in</a
					>
				{/if}
				<a class="kv-btn ghost" href="/admin/entradas/codigos"
					><Tag size={18} aria-hidden="true" /> Nuevo código</a
				>
			</nav>

			<div class="stats">
				{#if data.money}
					<Stat
						label="Entradas este mes"
						value={formatARS(data.money.total)}
						sub="{plural(data.money.orders, 'compra', 'compras')} · {plural(
							data.money.tickets,
							'entrada',
							'entradas'
						)}"
						href="/admin/entradas"
					/>
					<Stat
						label="Neto del fondo en entradas"
						value={formatSignedARS(data.money.fondoNet)}
						tone={data.money.fondoNet < 0 ? 'bad' : data.money.fondoNet > 0 ? 'ok' : ''}
						sub="aportes menos descuentos, este mes"
					/>
				{:else}
					<Stat label="Entradas este mes" value="—" sub="sin base de datos en este entorno" />
				{/if}
				{#if fondo}
					<Stat
						label="Fondo KinkyVibe: suscripciones"
						value={formatARS(fondo.collected)}
						sub="{fondoPct} % de la meta ({formatARS(fondo.goal)}) · del {monthDay(
							fondo.window.startDate
						)} al {monthDay(fondo.window.endDate)}{fondo.stale
							? ' · sin datos de este mes todavía'
							: ''}"
					>
						<CapacityBar
							sold={fondo.collected}
							capacity={fondo.goal}
							label="{formatARS(fondo.collected)} de {formatARS(fondo.goal)}"
						/>
					</Stat>
					<Stat
						label="Descuento del Fondo"
						value="{fondo.percent} %"
						sub="en las entradas de eventos KinkyVibe este mes"
					/>
				{:else}
					<Stat
						label="Fondo KinkyVibe: suscripciones"
						value="—"
						sub="no pudimos leer fondo.kinkyvibe.ar"
					/>
				{/if}
			</div>

			<div class="cols">
				<div id="para-revisar">
					<Card title="Para revisar">
						<svelte:fragment slot="actions">
							{#if todoCount}<Badge tone="warn">{todoCount}</Badge>{/if}
						</svelte:fragment>
						{#if form?.resend}
							<p class="flash" class:bad={!form.resend.ok} role="status">{form.resend.message}</p>
						{/if}
						{#if data.todo.length}
							<ul class="todo">
								{#each data.todo as t (t.id)}
									{#if t.kind === 'group' && !t.href}
										<li class="group">
											<details>
												<summary>
													<span class="ico {t.tone}" aria-hidden="true"
														><svelte:component
															this={REVIEW_ICONS[t.icon] ?? TriangleAlert}
															size={18}
														/></span
													>
													<div class="grow">
														<b>{t.title}</b>
														<small class="muted">{t.text}</small>
													</div>
													<span class="kv-btn ghost sm toggle"
														><span class="closed">{t.action}</span><span class="open">Ocultar</span
														><ChevronDown size={16} aria-hidden="true" /></span
													>
												</summary>
												<ul class="sub">
													{#each t.items as i (i.id)}
														<li>
															<span class="grow"><b>{i.name ?? i.title}</b></span>
															{#if i.href}<a class="kv-btn ghost sm" href={i.href}>{i.action}</a
																>{/if}
														</li>
													{/each}
												</ul>
											</details>
										</li>
									{:else}
										<li>
											<span class="ico {t.tone}" aria-hidden="true"
												><svelte:component
													this={REVIEW_ICONS[t.icon] ?? TriangleAlert}
													size={18}
												/></span
											>
											<div class="grow">
												<b>{t.title}</b>
												<small class="muted">{t.text}</small>
											</div>
											{#if t.kind === 'item' && t.resend}
												<form
													method="POST"
													action="?/resend"
													use:enhance={() => {
														resending = t.id;
														return async ({ update }) => {
															await update();
															resending = '';
														};
													}}
												>
													<input type="hidden" name="order" value={t.resend.orderId} />
													<button class="kv-btn ghost sm" disabled={resending === t.id}
														>{resending === t.id ? 'Enviando…' : t.action}</button
													>
												</form>
											{:else if t.kind === 'item' && t.retryReminders}
												<form
													method="POST"
													action="?/retryReminders"
													use:enhance={() => {
														resending = t.id;
														return async ({ update }) => {
															await update();
															resending = '';
														};
													}}
												>
													<input type="hidden" name="slug" value={t.retryReminders.slug} />
													<button class="kv-btn ghost sm" disabled={resending === t.id}
														>{resending === t.id ? 'Un momento…' : t.action}</button
													>
												</form>
											{:else if t.href}
												<a class="kv-btn ghost sm" href={t.href}
													>{t.action}{#if t.kind === 'group'}<ChevronRight
															size={16}
															aria-hidden="true"
														/>{/if}</a
												>
											{/if}
										</li>
									{/if}
								{/each}
							</ul>
						{:else}
							<EmptyState emoji="✨" title="Nada para revisar" text="Todo al día. ¡Bien ahí!" />
						{/if}
					</Card>
				</div>

				<Card title="Desde tu última visita">
					<svelte:fragment slot="actions">
						{#if data.since && !data.since.first && data.since.items.length}
							<form method="POST" action="?/seen" use:enhance>
								<button class="kv-btn ghost sm"
									><Check size={16} aria-hidden="true" /> Marcar como visto</button
								>
							</form>
						{/if}
					</svelte:fragment>
					{#if !data.since}
						<EmptyState
							emoji="🕰️"
							title="Sin datos"
							text="Esta sección necesita la base de datos, que no está disponible en este entorno."
						/>
					{:else}
						<p class="muted since-when">
							{data.since.first
								? 'Tu primera visita: lo de los últimos 7 días'
								: `Desde ${ago(data.since.since)}`}
						</p>
						<div class="since-nums">
							<span
								><b class="num">{data.since.orders}</b>
								{data.since.orders === 1 ? 'compra' : 'compras'}</span
							>
							<span><b class="num">{formatARS(data.since.money)}</b> cobrados</span>
							<span
								><b class="num">{data.since.transfers}</b>
								{data.since.transfers === 1 ? 'transferencia nueva' : 'transferencias nuevas'}</span
							>
							<span
								><b class="num">{data.since.audit}</b>
								{data.since.audit === 1 ? 'cambio de otre admin' : 'cambios de otres admins'}</span
							>
						</div>
						{#if data.since.items.length}
							<ActivityFeed items={data.since.items} now={data.now} limit={8} />
						{:else}
							<p class="muted">No pasó nada nuevo. 🌙</p>
						{/if}
					{/if}
				</Card>
			</div>
		</div>

		<div class="main-bottom">
			<Card title="Próximos eventos">
				<svelte:fragment slot="actions">
					<CsvButton rows={data.upcoming} columns={eventColumns} filename="proximos-eventos.csv" />
					<a class="kv-btn ghost sm" href="/admin/eventos"
						>Ver todos <ChevronRight size={16} aria-hidden="true" /></a
					>
				</svelte:fragment>
				{#if data.upcoming.length}
					<ul class="events">
						{#each data.upcoming as e (e.slug)}
							{@const st = statusBadge(e)}
							<li>
								<div class="date" class:is-today={e.today}>
									<small>{wdFmt.format(new Date(e.start))}</small>
									<b>{dayFmt.format(new Date(e.start))}</b>
									<small>{monFmt.format(new Date(e.start))}</small>
								</div>
								<div class="ev">
									<div class="ev-head">
										<a class="ev-title" href={eventLink(e.slug, { tickets: e.ticketed })}
											>{e.title}</a
										>
										{#if e.today}<Badge tone="bad">Hoy</Badge>{/if}
										<Badge tone={st.tone}>{st.text}</Badge>
										{#if e.fondoEnabled}<Badge tone="info">Fondo</Badge>{/if}
										{#if e.transfers}<Badge tone="warn"
												>{plural(e.transfers, 'transf.', 'transf.')}</Badge
											>{/if}
										{#if e.review}<Badge tone="bad">{e.review} para revisar</Badge>{/if}
										{#if e.missingStream}<Badge tone="warn">sin link</Badge>{/if}
										{#if !e.hasImage}<Badge tone="neutral">sin imagen</Badge>{/if}
									</div>
									<small class="muted"
										>{timeFmt.format(new Date(e.start))}{e.location
											? ` · ${e.location}`
											: ''}{e.online ? ' · online' : ''}</small
									>
									{#if e.ticketed}
										{#if e.salesNotYet && !e.sold}
											<small class="muted">La venta todavía no abrió.</small>
										{:else}
											<div class="cap">
												<CapacityBar sold={e.sold} held={e.held} capacity={e.capacity} />
												<small class="num"
													>{e.sold}{e.capacity === null ? ' · sin cupo' : ` / ${e.capacity}`}{e.held
														? ` · ${e.held} reservadas`
														: ''}</small
												>
											</div>
										{/if}
									{/if}
								</div>
								{#if e.ticketed}
									<div class="money num">
										<b>{formatARS(e.revenue)}</b>
										{#if e.fondoEnabled}
											<small
												class:neg={e.fondoNet < 0}
												title="Neto del fondo: aportes menos descuentos"
												>💜 {formatSignedARS(e.fondoNet)}</small
											>
										{/if}
									</div>
								{/if}
							</li>
						{/each}
					</ul>
				{:else}
					<EmptyState
						emoji="🗓️"
						title="No hay eventos próximos cargados"
						text="Cargá uno o importá la planilla."
					>
						<a class="kv-btn" href="/admin/eventos/nuevo">Cargar evento</a>
					</EmptyState>
				{/if}
			</Card>
		</div>

		<aside class="side-col" aria-label="Ventas, agenda y actividad">
			{#if data.sales}
				<SalesCard sales={data.sales} />
			{/if}

			<Card title="Agenda" icon={CalendarDays}>
				<svelte:fragment slot="actions">
					<small class="muted">próximos 7 días</small>
				</svelte:fragment>
				{#if data.agenda.length}
					<Agenda days={data.agenda} />
				{:else}
					<EmptyState
						emoji="🗓️"
						title="Semana tranquila"
						text="No hay eventos, cierres de venta ni recordatorios en los próximos 7 días."
					/>
				{/if}
			</Card>

			<div class="activity">
				<Card title="Actividad" icon={Activity}>
					<svelte:fragment slot="actions">
						<CsvButton
							rows={data.activity}
							columns={activityColumns}
							filename="actividad-reciente.csv"
						/>
					</svelte:fragment>
					{#if data.activity.length}
						<ActivityFeed items={data.activity} now={data.now} compact />
						<a class="kv-btn ghost sm more" href="/admin/actividad"
							>Ver todo <ChevronRight size={16} aria-hidden="true" /></a
						>
					{:else}
						<EmptyState
							emoji="📭"
							title="Sin actividad todavía"
							text={data.dbAvailable
								? 'Acá van a aparecer las compras, transferencias, ingresos y cambios de les admins.'
								: 'La actividad necesita la base de datos, que no está disponible en este entorno.'}
						/>
					{/if}
				</Card>
			</div>
		</aside>
	</div>
</div>

<style lang="scss">
	.hello {
		margin: 0.4rem 0 1rem;
		h1 {
			font-size: 1.6rem;
			margin: 0;
		}
		p {
			margin: 0.2rem 0 0;
		}
		a {
			color: var(--link);
			font-weight: 700;
		}
	}
	.today {
		display: flex;
		gap: 1rem;
		align-items: center;
		justify-content: space-between;
		flex-wrap: wrap;
		background: linear-gradient(135deg, var(--1), var(--2));
		color: var(--accent-ink);
		border-radius: var(--card-round, 1rem);
		box-shadow: var(--shadow);
		padding: 1.1rem 1.3rem;
		margin-bottom: 1rem;
		h2 {
			margin: 0.1rem 0;
			font-size: 1.4rem;
		}
		.kicker {
			text-transform: uppercase;
			letter-spacing: 0.08em;
			font-weight: 700;
			opacity: 0.9;
		}
		.place {
			margin: 0;
			opacity: 0.92;
		}
		.today-nums {
			display: flex;
			gap: 1.2rem;
			flex-wrap: wrap;
			margin: 0.5rem 0 0;
			b {
				font-size: 1.3rem;
			}
		}
	}
	.checkin-big {
		display: inline-flex;
		align-items: center;
		gap: 0.6rem;
		background: var(--surface);
		color: var(--link);
		font-weight: 700;
		font-size: 1.15rem;
		border-radius: 2em;
		padding: 0.9rem 1.5rem;
		text-decoration: none;
		box-shadow: var(--shadow);
		&:hover {
			color: var(--link);
			background: var(--surface-2);
		}
	}
	.quick {
		display: flex;
		gap: 0.5rem;
		flex-wrap: wrap;
		margin-bottom: 1rem;
	}
	/* En pantallas muy anchas el Inicio usa más que el ancho máximo de las otras páginas. */
	:global(main.page:has(> .inicio)) {
		max-width: 110rem;
	}
	/*
	 * Distribución: la columna principal y, a la derecha, ventas + agenda + actividad. Se decide
	 * con container queries (el ancho real del contenido, sin la barra lateral):
	 * - desde 58rem (~1280 px de pantalla): dos columnas;
	 * - de 38 a 58rem (~1024 px): la columna de la derecha pasa arriba de "Próximos eventos", en
	 *   dos columnas (ventas | agenda, y la actividad a lo ancho);
	 * - menos (celu): todo en una columna; ventas, agenda y actividad (corta) al final.
	 */
	.inicio {
		container: inicio / inline-size;
	}
	.layout {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		grid-template-areas: 'top' 'bottom' 'side';
		gap: 1rem;
		align-items: start;
	}
	.main-col {
		grid-area: top;
		container: main-col / inline-size;
		min-width: 0;
	}
	.main-bottom {
		grid-area: bottom;
		min-width: 0;
	}
	.side-col {
		grid-area: side;
	}
	@container inicio (min-width: 38rem) {
		.layout {
			grid-template-areas: 'top' 'side' 'bottom';
		}
	}
	.side-col {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: 1rem;
		align-items: start;
		min-width: 0;
	}
	@container inicio (min-width: 38rem) and (max-width: 57.99rem) {
		.side-col {
			grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
		}
		/* Con ventas: ventas | agenda, y la actividad abajo a lo ancho. */
		.side-col > .activity:nth-child(3) {
			grid-column: 1 / -1;
		}
	}
	@container inicio (min-width: 58rem) {
		.layout {
			grid-template-columns: minmax(0, 1fr) 20.5rem;
			/* Lo que sobre de alto va a la fila de abajo: sin huecos debajo de "Para revisar". */
			grid-template-rows: auto 1fr;
			grid-template-areas: 'top side' 'bottom side';
		}
	}
	@container inicio (min-width: 76rem) {
		.layout {
			grid-template-columns: minmax(0, 1fr) 24rem;
		}
	}
	@container inicio (max-width: 37.99rem) {
		/* En el celu: la actividad, corta (el registro completo está en /admin/actividad). */
		.activity :global(.feed li:nth-child(n + 6)) {
			display: none;
		}
	}
	.stats {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.8rem;
		margin-bottom: 1rem;
	}
	@container main-col (min-width: 46rem) {
		.stats {
			grid-template-columns: repeat(4, minmax(0, 1fr));
		}
	}
	.cols {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: 1rem;
		align-items: start;
	}
	@container main-col (min-width: 52rem) {
		.cols {
			grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
		}
	}
	.sm {
		padding: 0.35rem 0.8rem;
		font-size: 0.88rem;
	}
	.more {
		align-self: flex-start;
	}
	.flash {
		margin: 0;
		padding: 0.5rem 0.8rem;
		border-radius: 0.7em;
		background: var(--ok-bg);
		color: var(--ok);
		&.bad {
			background: var(--bad-bg);
			color: var(--bad);
		}
	}
	.todo,
	.events {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.todo li {
		display: flex;
		gap: 0.7rem;
		align-items: center;
		padding: 0.55rem 0;
		border-top: 1px solid var(--line);
		&:first-child {
			border-top: 0;
		}
	}
	.todo details {
		flex: 1;
		min-width: 0;
	}
	.todo summary {
		display: flex;
		gap: 0.7rem;
		align-items: center;
		cursor: pointer;
		list-style: none;
		&::-webkit-details-marker {
			display: none;
		}
	}
	.toggle {
		gap: 0.25rem;
		:global(svg) {
			transition: transform 0.15s;
		}
		.open {
			display: none;
		}
	}
	details[open] .toggle {
		.open {
			display: inline;
		}
		.closed {
			display: none;
		}
		:global(svg) {
			transform: rotate(180deg);
		}
	}
	.todo .sub {
		list-style: none;
		margin: 0.4rem 0 0 2.8rem;
		padding: 0;
		li {
			padding: 0.35rem 0;
			border-top: 1px dashed var(--line);
		}
	}
	.grow {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 0.1rem;
		b {
			overflow-wrap: anywhere;
		}
		a {
			text-decoration: none;
		}
	}
	.ico {
		flex: none;
		width: 2.1rem;
		height: 2.1rem;
		border-radius: 50%;
		display: grid;
		place-items: center;
		&.warn {
			background: var(--warn-bg);
			color: var(--warn);
		}
		&.bad {
			background: var(--bad-bg);
			color: var(--bad);
		}
		&.info {
			background: var(--info-bg);
			color: var(--info);
		}
	}
	.since-when {
		margin: 0;
	}
	.since-nums {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.4rem 1rem;
		b {
			font-size: 1.15rem;
		}
	}
	.events li {
		display: grid;
		grid-template-columns: 3.4rem minmax(0, 1fr) auto;
		gap: 0.9rem;
		align-items: center;
		padding: 0.8rem 0;
		border-top: 1px solid var(--line);
		&:first-child {
			border-top: 0;
		}
	}
	.date {
		display: flex;
		flex-direction: column;
		align-items: center;
		background: var(--surface-2);
		border-radius: var(--round, 0.8rem);
		padding: 0.3rem 0;
		line-height: 1.1;
		b {
			font-size: 1.35rem;
		}
		small {
			font-size: 0.7rem;
			text-transform: uppercase;
			color: var(--muted);
		}
		&.is-today {
			background: var(--accent);
			color: var(--accent-ink);
			small {
				color: var(--accent-ink);
			}
		}
	}
	.ev {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		min-width: 0;
	}
	.ev-head {
		display: flex;
		flex-wrap: wrap;
		gap: 0.3rem 0.4rem;
		align-items: center;
	}
	.ev-title {
		font-weight: 700;
		text-decoration: none;
		overflow-wrap: anywhere;
		margin-right: 0.2rem;
	}
	.cap {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		max-width: 26rem;
		> :global(.bar) {
			flex: 1;
		}
		small {
			white-space: nowrap;
			color: var(--muted);
		}
	}
	.money {
		text-align: right;
		display: flex;
		flex-direction: column;
		small {
			color: var(--ok);
		}
		.neg {
			color: var(--bad);
		}
	}
	@media (max-width: 899.98px) {
		.quick {
			display: grid;
			grid-template-columns: repeat(2, minmax(0, 1fr));
			:global(.kv-btn) {
				justify-content: center;
				white-space: normal;
				text-align: center;
			}
		}
	}
	@media (max-width: 599.98px) {
		.stats {
			grid-template-columns: repeat(2, minmax(0, 1fr));
			gap: 0.6rem;
		}
		.events li {
			grid-template-columns: 3rem minmax(0, 1fr);
		}
		.money {
			grid-column: 2;
			text-align: left;
			flex-direction: row;
			gap: 0.6rem;
			align-items: baseline;
		}
		.today .checkin-big {
			width: 100%;
			justify-content: center;
		}
	}
</style>
