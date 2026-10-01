<script>
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { FileSpreadsheet, FlaskConical, Plus } from '@lucide/svelte';
	import PageHeader from '$lib/components/admin/panel/PageHeader.svelte';
	import UndoToast from '$lib/components/admin/panel/UndoToast.svelte';
	import AgendaSheet from '$lib/components/admin/agenda/AgendaSheet.svelte';
	import AgendaToolbar from '$lib/components/admin/agenda/AgendaToolbar.svelte';
	import EventDetail from '$lib/components/admin/agenda/EventDetail.svelte';
	import Calendario from '$lib/components/admin/calendario/Calendario.svelte';
	import { postAgendaSave } from '$lib/admin/agendaSave.js';
	import { dayLabel } from '$lib/admin/eventFormat.js';
	import { agendaValues } from '$lib/utils/agenda.js';
	import {
		CALENDAR_VIEWS,
		CALENDAR_VIEW_KEY,
		calendarEvents,
		defaultCalendarView,
		movedAgendaValues,
		newEventHref,
		parseCalendarView,
		rescheduleProblem
	} from '$lib/utils/calendario.js';

	/** @type {import('./$types').PageData} */
	export let data;

	/** @typedef {import('$lib/utils/agenda.js').AgendaValues} Values */

	/** Las filas con lo último guardado (desde acá, desde la planilla o arrastrando). */
	let rows = data.rows;
	/** @type {import('$lib/utils/calendario.js').CalendarView | null} null hasta montar */
	let view = null;
	let title = '';
	let sheetDirty = 0;
	/** @type {Calendario} */
	let calendar;

	onMount(() => {
		let saved = null;
		try {
			saved = localStorage.getItem(CALENDAR_VIEW_KEY);
		} catch (e) {
			// sin storage (ventana privada, bloqueado): la vista por defecto
		}
		view = parseCalendarView(saved, defaultCalendarView(window.innerWidth));
	});

	/** @param {import('$lib/utils/calendario.js').CalendarView} next */
	function setView(next) {
		if (next === view) return;
		if (
			view === 'planilla' &&
			sheetDirty &&
			!confirm('Hay filas de la planilla sin guardar. Si cambiás de vista, se pierden. ¿Seguir?')
		)
			return;
		view = next;
		try {
			localStorage.setItem(CALENDAR_VIEW_KEY, next);
		} catch (e) {
			// no se recuerda, pero anda
		}
	}

	$: ecView = CALENDAR_VIEWS.find((v) => v.id === view)?.ec ?? '';
	$: events = calendarEvents(rows, { places: data.places, canEdit: data.canEdit });

	/**
	 * @param {string} slug
	 * @param {Partial<import('$lib/utils/agenda.js').AgendaRow>} values
	 */
	function updateRow(slug, values) {
		rows = rows.map((r) => (r.slug === slug ? { ...r, ...values, slug } : r));
	}

	/* ---------- detalle ---------- */
	/** @type {string | null} */
	let selected = null;
	let detailOpen = false;
	$: selectedRow = rows.find((r) => r.slug === selected) ?? null;
	$: selectedProblem = selectedRow ? moveProblem(selectedRow) : null;

	/** @param {import('$lib/utils/agenda.js').AgendaRow} row */
	function moveProblem(row) {
		if (!data.canEdit) return 'No tenés permiso para moverlo.';
		return rescheduleProblem(agendaValues(row), data.places);
	}

	/* ---------- mover (arrastrar o "Mover a otro día") ---------- */
	let moving = false;
	/** El último movimiento, para "Deshacer". @type {{ slug: string, title: string, before: Values, after: Values } | null} */
	let last = null;
	let undoing = false;
	let toast = '';
	let toastError = false;

	/** @param {string} message @param {boolean} [error] */
	function say(message, error = false) {
		toast = message;
		toastError = error;
	}

	/**
	 * Guarda un evento en otro día (y hora) por la action `save`, la misma de la planilla: valida
	 * de nuevo en el servidor, chequea permisos y conflictos y hace el commit.
	 * @param {string} slug
	 * @param {{ date: string, time?: string }} to
	 * @param {() => void} [revert] deshace el arrastre en el calendario si no se pudo
	 */
	async function reschedule(slug, to, revert) {
		const row = rows.find((r) => r.slug === slug);
		const problem = row ? moveProblem(row) : 'No encontramos ese evento.';
		if (!row || problem || moving) {
			revert?.();
			if (problem) say(`No se pudo mover: ${problem}`, true);
			return;
		}
		const before = agendaValues(row);
		const after = movedAgendaValues(before, to);
		moving = true;
		say(`Moviendo «${row.title}»…`);
		last = null;
		const r = await postAgendaSave(slug, before, after);
		moving = false;
		if (!r) return;
		if (r.ok) {
			updateRow(slug, after);
			if (r.changed?.length) last = { slug, title: row.title, before, after };
			say(
				`Moviste «${row.title}» al ${dayLabel(after.date)}${after.startTime !== before.startTime ? ` a las ${after.startTime}` : ''}. ${r.message}`
			);
		} else {
			revert?.();
			if (r.current) updateRow(slug, r.current);
			say(r.message, true);
		}
	}

	async function undo() {
		if (!last || undoing) return;
		undoing = true;
		const { slug, title: name, before, after } = last;
		const r = await postAgendaSave(slug, after, before);
		undoing = false;
		if (!r) return;
		if (r.ok) {
			updateRow(slug, before);
			last = null;
			say(`Volvió «${name}» al ${dayLabel(before.date)}.`);
		} else {
			if (r.current) updateRow(slug, r.current);
			last = null;
			say(`No se pudo deshacer: ${r.message}`, true);
		}
	}

	/** @param {{ date: string, startTime?: string, endTime?: string }} prefill */
	function create(prefill) {
		goto(newEventHref(prefill));
	}
</script>

<PageHeader
	title="Agenda"
	subtitle="Tocá un evento para ver lo principal, arrastralo para cambiarle el día o tocá un día vacío para cargar uno. En la planilla editás varios a la vez."
>
	<svelte:fragment slot="actions">
		<a class="kv-btn ghost" href="/admin/eventos/importar"
			><FileSpreadsheet size={16} aria-hidden="true" /> Importar planilla</a
		>
		<a class="kv-btn" href="/admin/eventos/nuevo"><Plus size={16} aria-hidden="true" /> Evento</a>
	</svelte:fragment>
</PageHeader>

{#if data.mock}
	<p class="note">
		<FlaskConical size={15} aria-hidden="true" /> Modo de prueba: los cambios van a una carpeta temporal,
		no a GitHub.
	</p>
{/if}

<AgendaToolbar
	{view}
	{title}
	nav={view !== 'planilla'}
	on:prev={() => calendar?.prev()}
	on:next={() => calendar?.next()}
	on:today={() => calendar?.today()}
	on:view={(e) => setView(e.detail)}
/>

{#if view === 'planilla'}
	<AgendaSheet
		rows={rows.filter((r) => r.date >= data.today)}
		places={data.places}
		bind:dirtyCount={sheetDirty}
		on:saved={(e) => updateRow(e.detail.slug, e.detail.values)}
	/>
{:else if view}
	<Calendario
		bind:this={calendar}
		bind:title
		view={ecView}
		{events}
		on:open={(e) => {
			selected = e.detail.id;
			detailOpen = true;
		}}
		on:pick={(e) => create(e.detail)}
		on:move={(e) => reschedule(e.detail.id, e.detail, e.detail.revert)}
	/>
	{#if !data.canEdit}
		<p class="muted foot">Para mover eventos arrastrándolos, volvé a iniciar sesión.</p>
	{/if}
{:else}
	<p class="muted loading">Cargando…</p>
{/if}

<EventDetail
	row={selectedRow}
	bind:open={detailOpen}
	problem={selectedProblem}
	busy={moving}
	on:move={(e) => selected && reschedule(selected, { date: e.detail.date })}
/>

{#if toast}
	<UndoToast
		floating
		message={toast}
		error={toastError}
		canUndo={!!last && !toastError}
		busy={undoing}
		on:undo={undo}
		on:close={() => (toast = '')}
	/>
{/if}

<style>
	.note {
		background: var(--warn-bg);
		border-radius: 0.8rem;
		padding: 0.5rem 0.9rem;
	}
	.foot {
		font-size: 0.85rem;
		margin-top: 0.8rem;
	}
	.loading {
		padding: 3rem 0;
		text-align: center;
	}
</style>
