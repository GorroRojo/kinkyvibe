<script>
	/**
	 * Calendario interactivo (mes, semana, lista). Es el único lugar que conoce la librería
	 * (@event-calendar/core): el resto de la app le pasa eventos ya mapeados (ver
	 * $lib/utils/calendario.js) y escucha eventos de Svelte. La librería se carga en el navegador
	 * (en el servidor se muestra un aviso de "Cargando…"), en su propio chunk.
	 *
	 * Props: `events` (CalendarEventInput[]), `view` (nombre de vista de la librería:
	 * dayGridMonth | timeGridWeek | listMonth), `title` (bind, solo lectura: el período que se ve).
	 * Métodos (bind:this): `prev()`, `next()`, `today()`.
	 * Eventos:
	 * - `open` { id, el }: tocaron (o Enter en) un evento;
	 * - `pick` { date, startTime?, endTime? }: tocaron un día vacío (o arrastraron un rango en la
	 *   vista semana);
	 * - `move` { id, date, time, revert }: soltaron un evento en otro día u hora. Quien escucha lo
	 *   anota (o lo guarda) y llama a `revert()` si no se puede.
	 * Los eventos con `extendedProps.pending` (movidos sin guardar) se ven con borde punteado y la
	 * etiqueta "pendiente".
	 */
	import { createEventDispatcher, onMount } from 'svelte';
	import { localDateParts } from '$lib/utils/calendario.js';

	/** @type {import('$lib/utils/calendario.js').CalendarEventInput[]} */
	export let events = [];
	export let view = 'dayGridMonth';
	export let title = '';

	const dispatch = createEventDispatcher();

	/** @type {any} componente Calendar de la librería (se carga en onMount) */
	let Calendar = null;
	/** @type {any[]} */
	let plugins = [];
	/** @type {any} instancia (bind:this) */
	let ec = null;
	/** @type {HTMLDivElement} */
	let root;
	let failed = false;

	onMount(async () => {
		try {
			const lib = await import('@event-calendar/core');
			plugins = [lib.DayGrid, lib.TimeGrid, lib.List, lib.Interaction];
			Calendar = lib.Calendar;
		} catch (e) {
			failed = true;
		}
	});

	export function prev() {
		ec?.prev();
	}
	export function next() {
		ec?.next();
	}
	export function today() {
		ec?.setOption('date', new Date());
	}

	/** @param {any} info */
	function onDateClick(info) {
		const { date, time } = localDateParts(info.date);
		dispatch('pick', info.allDay ? { date } : { date, startTime: time });
	}

	/** @param {any} info */
	function onSelect(info) {
		const start = localDateParts(info.start);
		const end = localDateParts(info.end);
		ec?.unselect();
		dispatch(
			'pick',
			info.allDay
				? { date: start.date }
				: { date: start.date, startTime: start.time, endTime: end.time }
		);
	}

	/** @param {any} info */
	function onDrop(info) {
		const { date, time } = localDateParts(info.event.start);
		const before = localDateParts(info.oldEvent.start);
		if (date === before.date && time === before.time) return;
		dispatch('move', { id: String(info.event.id), date, time, revert: info.revert });
	}

	/** @param {any} info */
	function onEventMount(info) {
		const p = info.event.extendedProps ?? {};
		const when = new Intl.DateTimeFormat('es-AR', {
			weekday: 'long',
			day: 'numeric',
			month: 'long'
		}).format(info.event.start);
		info.el.setAttribute(
			'aria-label',
			[info.event.title, when, p.time, p.pending ? 'cambio sin guardar' : '']
				.filter(Boolean)
				.join(', ')
		);
		if (p.problem) info.el.setAttribute('title', `No se puede arrastrar: ${p.problem}`);
	}

	/**
	 * Flechas para moverse entre los eventos (en el orden en que se ven).
	 * @param {KeyboardEvent} e
	 */
	function onKeydown(e) {
		// Enter en un evento abre el detalle (lo hace la librería); sin esto, el mismo Enter llega
		// como "keypress" al botón Cerrar de la hoja recién abierta y la cierra.
		if (e.key === 'Enter' && e.target instanceof HTMLElement && e.target.closest('.ec-event')) {
			e.preventDefault();
			return;
		}
		const keys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'];
		if (!keys.includes(e.key) || !(e.target instanceof HTMLElement)) return;
		const current = e.target.closest('.ec-event[tabindex]');
		if (!current) return;
		const all = /** @type {HTMLElement[]} */ ([...root.querySelectorAll('.ec-event[tabindex]')]);
		const i = all.indexOf(/** @type {HTMLElement} */ (current));
		let j = i;
		if (e.key === 'Home') j = 0;
		else if (e.key === 'End') j = all.length - 1;
		else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') j = Math.max(0, i - 1);
		else j = Math.min(all.length - 1, i + 1);
		e.preventDefault();
		all[j]?.focus();
	}

	$: options = {
		view,
		events,
		locale: 'es-AR',
		firstDay: 1,
		headerToolbar: { start: '', center: '', end: '' },
		height: view === 'timeGridWeek' ? '72vh' : 'auto',
		dayMaxEvents: true,
		eventStartEditable: true,
		eventDurationEditable: false,
		nowIndicator: true,
		scrollTime: '16:00:00',
		slotDuration: '01:00',
		slotLabelFormat: { hour: '2-digit', minute: '2-digit', hour12: false },
		eventTimeFormat: { hour: '2-digit', minute: '2-digit', hour12: false },
		allDaySlot: true,
		allDayContent: 'Todo el día',
		noEventsContent: 'No hay eventos en este período.',
		buttonText: { today: 'Hoy' },
		views: { timeGridWeek: { selectable: true } },
		dateClick: onDateClick,
		select: onSelect,
		eventClick: (/** @type {any} */ info) =>
			dispatch('open', { id: String(info.event.id), el: info.el }),
		eventDrop: onDrop,
		eventDidMount: onEventMount,
		datesSet: (/** @type {any} */ info) => (title = info.view.title)
	};
</script>

<!-- svelte-ignore a11y-no-static-element-interactions (las flechas solo mueven el foco entre los eventos, que son botones) -->
<div class="calendario" bind:this={root} on:keydown={onKeydown}>
	{#if Calendar}
		<svelte:component this={Calendar} bind:this={ec} {plugins} {options} eventContent={chip} />
	{:else if failed}
		<p class="muted">
			No se pudo cargar el calendario. Probá recargar la página o usá la planilla.
		</p>
	{:else}
		<p class="muted loading">Cargando el calendario…</p>
	{/if}
</div>

{#snippet chip(/** @type {any} */ arg)}
	{@const time = arg.event.extendedProps.time}
	<span class="kv-chip">
		{#if time}<span class="kv-chip-time"
				>{arg.view.type === 'listMonth' ? time : time.split(' ')[0]}</span
			>{/if}
		<span class="kv-chip-title">{arg.event.title}</span>
		{#if arg.event.extendedProps.pending}<span class="kv-chip-pending">pendiente</span>{/if}
	</span>
{/snippet}

<style>
	.loading {
		padding: 3rem 0;
		text-align: center;
	}
	/* La librería con los colores del panel (claro y oscuro salen de los tokens de panel.scss). */
	.calendario :global(.ec) {
		--ec-bg-color: var(--surface);
		--ec-text-color: var(--text);
		--ec-border-color: var(--line);
		--ec-color-400: var(--muted);
		--ec-color-300: var(--line);
		--ec-color-200: var(--surface-2);
		--ec-color-100: var(--surface-2);
		--ec-color-50: var(--surface-2);
		--ec-today-bg-color: var(--link-bg);
		--ec-highlight-color: var(--info-bg);
		--ec-now-indicator-color: var(--1);
		--ec-popup-bg-color: var(--surface);
		--ec-event-bg-color: var(--info-bg);
		--ec-event-text-color: var(--text);
		--ec-bg-event-color: var(--surface-2);
		color-scheme: inherit;
		font-size: 0.9rem;
		border-radius: var(--card-round);
		background: var(--surface);
	}
	.calendario :global(.ec-day-head)::first-letter,
	.calendario :global(.ec-col-head)::first-letter,
	.calendario :global(.ec-day-side)::first-letter {
		text-transform: uppercase;
	}
	.calendario :global(.ec-day.ec-today .ec-day-head) {
		color: var(--link);
		font-weight: 700;
	}
	.calendario :global(.ec-day) {
		cursor: pointer;
	}
	.calendario :global(.ec-event) {
		cursor: pointer;
		border-radius: 0.4rem;
		border-left: 3px solid var(--tone, var(--muted));
		background: var(--tone-bg, var(--surface-2));
		color: var(--text);
		box-shadow: none;
	}
	.calendario :global(.ec-event:focus-visible) {
		outline: 2px solid var(--link);
		outline-offset: 1px;
	}
	.calendario :global(.ec-event.kv-ev-ok) {
		--tone: var(--ok);
		--tone-bg: var(--ok-bg);
	}
	.calendario :global(.ec-event.kv-ev-warn) {
		--tone: var(--warn);
		--tone-bg: var(--warn-bg);
	}
	.calendario :global(.ec-event.kv-ev-bad) {
		--tone: var(--bad);
		--tone-bg: var(--bad-bg);
	}
	.calendario :global(.ec-event.kv-ev-info) {
		--tone: var(--info);
		--tone-bg: var(--info-bg);
	}
	/* Movido y sin guardar: borde punteado y la etiqueta "pendiente" (no solo color). */
	.calendario :global(.ec-event.kv-ev-pendiente) {
		outline: 2px dashed var(--warn);
		outline-offset: -2px;
		background: var(--warn-bg);
	}
	.calendario :global(.ec-list .ec-event.kv-ev-pendiente) {
		background: var(--warn-bg);
	}
	.calendario :global(.kv-chip-pending) {
		flex: none;
		margin-left: auto;
		padding: 0 0.4em;
		border-radius: 1em;
		background: var(--warn);
		color: var(--surface);
		font-size: 0.75em;
		font-weight: 700;
		line-height: 1.5;
		align-self: center;
	}
	.calendario :global(.kv-ev-cancelado .kv-chip-title) {
		text-decoration: line-through;
	}
	/* En la lista el evento no lleva fondo: es una fila. */
	.calendario :global(.ec-list .ec-event) {
		background: transparent;
		border-left-width: 4px;
	}
	.calendario :global(.kv-chip) {
		display: flex;
		gap: 0.3em;
		min-width: 0;
		overflow: hidden;
		white-space: nowrap;
		line-height: 1.35;
	}
	.calendario :global(.ec-list .kv-chip),
	.calendario :global(.ec-time-grid .kv-chip) {
		white-space: normal;
	}
	.calendario :global(.kv-chip-time) {
		font-weight: 700;
		font-variant-numeric: tabular-nums;
	}
	.calendario :global(.kv-chip-title) {
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.calendario :global(.ec-toolbar) {
		display: none;
	}
	/* En el celu, en el mes solo entra el título. */
	@media (max-width: 640px) {
		.calendario :global(.ec-day-grid.ec-month-view .kv-chip-time) {
			display: none;
		}
		.calendario :global(.ec-day-grid.ec-month-view .ec-event) {
			font-size: 0.75rem;
		}
	}
</style>
