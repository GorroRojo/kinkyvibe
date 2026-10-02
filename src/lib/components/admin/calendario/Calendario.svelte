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
	 * - `move` { id, date, time?, revert }: soltaron un evento en otro día. En la vista semana va
	 *   solo el día (sin `time`: conserva su hora aunque lo suelten en otra franja; ver
	 *   `dropTarget`). Mientras lo arrastran, la vista previa tampoco cambia de hora: solo se corre de
	 *   día (ver `dragSnapDuration`). Quien escucha lo anota (o lo guarda) y llama a `revert()` si no
	 *   se puede.
	 * Los eventos con `extendedProps.pending` (movidos sin guardar) se ven con borde punteado y la
	 * etiqueta "pendiente"; los borradores (`extendedProps.draft`), con «falta N» (lo que les falta,
	 * `extendedProps.missing`) o «a confirmar».
	 * Tamaño: en desktop el mes y la semana llenan el alto que queda de la pantalla (como el
	 * calendario público); en el mes, un día con muchos eventos crece en vez de esconderlos, y los
	 * títulos ocupan hasta dos líneas. En el celu, el alto natural. Los que tienen `extendedProps.note` son notas de un día (ver
	 * dayNotes.js): de todo el día, con su color, y no se arrastran; tocarlas también manda `open`.
	 */
	import { createEventDispatcher, onMount } from 'svelte';
	import { dragSnapDuration, dropTarget, localDateParts } from '$lib/utils/calendario.js';

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
	/** Alto disponible (px) desde el calendario hasta abajo de la pantalla; 0 en el celu. */
	let fill = 0;

	/** Mide cuánto alto queda en la pantalla para el calendario (solo en desktop). */
	function measure() {
		if (!root || window.innerWidth < 900) {
			fill = 0;
			return;
		}
		const top = root.getBoundingClientRect().top + window.scrollY;
		fill = Math.max(360, Math.round(window.innerHeight - top - 16));
	}

	onMount(async () => {
		try {
			const lib = await import('@event-calendar/core');
			plugins = [lib.DayGrid, lib.TimeGrid, lib.List, lib.Interaction];
			Calendar = lib.Calendar;
		} catch (e) {
			failed = true;
		}
		measure();
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
		const to = dropTarget(
			info.view?.type ?? view,
			localDateParts(info.oldEvent.start),
			localDateParts(info.event.start)
		);
		// Mismo día (en la semana, aunque sea otra hora): no cambia nada, vuelve a su lugar.
		if (!to) {
			info.revert?.();
			return;
		}
		dispatch('move', { id: String(info.event.id), ...to, revert: info.revert });
	}

	/**
	 * Al apoyar el puntero en un evento de la vista semana, el paso del arrastre pasa a ser un día
	 * entero (`dragSnapDuration`), así la vista previa se queda en su hora; al soltar vuelve el paso
	 * de siempre (lo usan tocar un día vacío y arrastrar un rango). Va en captura porque la librería
	 * toma el paso en su propio pointerdown, y la vuelta espera a que la librería procese el soltar.
	 * @param {PointerEvent} e
	 */
	function onPointerDownCapture(e) {
		const snap = dragSnapDuration(ec?.getOption('view') ?? view);
		if (!ec || !snap) return;
		if (!(e.target instanceof Element) || !e.target.closest('.ec-event')) return;
		ec.setOption('snapDuration', snap);
		const reset = () => {
			window.removeEventListener('pointerup', reset);
			window.removeEventListener('pointercancel', reset);
			setTimeout(() => ec?.setOption('snapDuration', undefined));
		};
		window.addEventListener('pointerup', reset);
		window.addEventListener('pointercancel', reset);
	}

	/** @param {any} info */
	function onEventMount(info) {
		const p = info.event.extendedProps ?? {};
		const when = new Intl.DateTimeFormat('es-AR', {
			weekday: 'long',
			day: 'numeric',
			month: 'long'
		}).format(info.event.start);
		if (p.note) {
			info.el.setAttribute('aria-label', `Nota del ${when}: ${info.event.title}`);
			info.el.setAttribute('title', 'Nota del día: tocala para cambiarla o borrarla');
			return;
		}
		const missing = Array.isArray(p.missing) ? p.missing : [];
		const draft = p.draft
			? `borrador a confirmar${missing.length ? `, falta: ${missing.join(', ').toLowerCase()}` : ''}`
			: '';
		info.el.setAttribute(
			'aria-label',
			[info.event.title, when, p.time, draft, p.pending ? 'cambio sin guardar' : '']
				.filter(Boolean)
				.join(', ')
		);
		const tips = [
			p.draft
				? `Borrador a confirmar${missing.length ? `. Falta: ${missing.join(', ')}` : ''}`
				: '',
			p.problem ? `No se puede arrastrar: ${p.problem}` : ''
		].filter(Boolean);
		if (tips.length) info.el.setAttribute('title', tips.join('\n'));
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
		height: view === 'timeGridWeek' ? (fill ? `${fill}px` : '72vh') : 'auto',
		// En el mes los días crecen con sus eventos (no hay "+N más").
		dayMaxEvents: view !== 'dayGridMonth',
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

<svelte:window on:resize={measure} />

<!-- svelte-ignore a11y-no-static-element-interactions (las flechas solo mueven el foco entre los eventos, que son botones) -->
<div
	class="calendario"
	class:fill={fill > 0}
	style:--kv-fill={fill ? `${fill}px` : null}
	bind:this={root}
	on:keydown={onKeydown}
	on:pointerdown|capture={onPointerDownCapture}
>
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
		{#if arg.event.extendedProps.draft}
			{@const missing = arg.event.extendedProps.missing ?? []}
			<span class="kv-chip-draft" aria-hidden="true"
				>{missing.length ? `falta ${missing.length}` : 'a confirmar'}</span
			>
		{/if}
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
	/* Borrador (no listado): «falta N» / «a confirmar» (además del color de «Borrador»). */
	.calendario :global(.kv-chip-draft) {
		flex: none;
		margin-left: auto;
		padding: 0 0.4em;
		border-radius: 1em;
		border: 1px solid var(--warn);
		color: var(--text);
		background: var(--surface);
		font-size: 0.72em;
		font-weight: 700;
		line-height: 1.45;
		align-self: flex-start;
		white-space: nowrap;
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
	/* Nota de un día: su color (variables en `styles`, ver dayNotes.js), en cursiva y sin hora. */
	.calendario :global(.ec-event.kv-nota) {
		font-style: italic;
		font-weight: 600;
		cursor: pointer;
	}
	.calendario :global(.ec-list .ec-event.kv-nota) {
		background: var(--tone-bg);
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
	/* Mes: los títulos en hasta dos líneas. */
	.calendario :global(.ec-day-grid.ec-month-view .kv-chip) {
		white-space: normal;
		align-items: flex-start;
	}
	.calendario :global(.ec-day-grid.ec-month-view .kv-chip-title) {
		flex: 1 1 auto;
		min-width: 0;
		display: -webkit-box;
		-webkit-box-orient: vertical;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		overflow-wrap: anywhere;
	}
	/* Desktop: el mes llena el alto que queda (las semanas se reparten el espacio y crecen si un día
	   tiene muchos eventos). */
	.calendario.fill :global(.ec-day-grid.ec-month-view .ec-main) {
		min-height: var(--kv-fill);
		grid-template-rows: max-content repeat(var(--ec-grid-rows), minmax(max-content, 1fr));
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
