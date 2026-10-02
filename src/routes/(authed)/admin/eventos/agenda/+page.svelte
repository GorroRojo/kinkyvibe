<script>
	import { onMount } from 'svelte';
	import { FileSpreadsheet, FilePen, FlaskConical, Plus, StickyNote } from '@lucide/svelte';
	import PageHeader from '$lib/components/admin/panel/PageHeader.svelte';
	import UndoToast from '$lib/components/admin/panel/UndoToast.svelte';
	import UnsavedChanges from '$lib/components/admin/panel/UnsavedChanges.svelte';
	import PendingBar from '$lib/components/admin/agenda/PendingBar.svelte';
	import QuickAdd from '$lib/components/admin/agenda/QuickAdd.svelte';
	import AgendaSheet from '$lib/components/admin/agenda/AgendaSheet.svelte';
	import AgendaToolbar from '$lib/components/admin/agenda/AgendaToolbar.svelte';
	import EventDetail from '$lib/components/admin/agenda/EventDetail.svelte';
	import DayNoteEditor from '$lib/components/admin/agenda/DayNoteEditor.svelte';
	import Calendario from '$lib/components/admin/calendario/Calendario.svelte';
	import { postAgendaSaveMany, postConfirmDraft, postQuickDraft } from '$lib/admin/agendaSave.js';
	import { draftKey } from '$lib/admin/draft.js';
	import { agendaValues } from '$lib/utils/agenda.js';
	import {
		dayNoteEvent,
		noteIdFromEventId,
		removeDayNote,
		upsertDayNote
	} from '$lib/utils/dayNotes.js';
	import {
		CALENDAR_VIEWS,
		CALENDAR_VIEW_KEY,
		calendarEvents,
		defaultCalendarView,
		draftRows,
		isDraftRow,
		parseCalendarView,
		rescheduleProblem
	} from '$lib/utils/calendario.js';
	import {
		pendingMovesReducer,
		pendingMovesSummary,
		pendingSavePayload,
		restorePendingMoves,
		withPendingMoves
	} from '$lib/utils/pendingMoves.js';

	/** @type {import('./$types').PageData} */
	export let data;

	/**
	 * Las filas con lo último guardado (desde la planilla o con "Guardar cambios"). Lo que se movió
	 * y no se guardó está en `pending` (más abajo); el calendario muestra `visibleRows`.
	 */
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
			next === 'planilla' &&
			pendingCount &&
			!confirm(
				`Tenés ${pendingCount === 1 ? '1 evento movido' : `${pendingCount} eventos movidos`} sin guardar y la planilla no los muestra. Si cambiás de vista, se descartan (para no perderlos, tocá «Guardar cambios»). ¿Seguir?`
			)
		)
			return;
		if (next === 'planilla') {
			dispatchPending({ type: 'discard' });
			problems = {};
		}
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
	$: visibleRows = withPendingMoves(rows, pending);
	$: events = [
		// Las notas primero: en cada día se ven arriba de los eventos.
		...notes.map(dayNoteEvent),
		...calendarEvents(draftRows(visibleRows, onlyDrafts), {
			places: data.places,
			canEdit: data.canEdit && !saving
		})
	];

	/* ---------- notas de los días (D1, solo admins) ---------- */
	/** @type {import('$lib/utils/dayNotes.js').DayNote[]} */
	let notes = data.notes;
	let noteOpen = false;
	/** @type {import('$lib/utils/dayNotes.js').DayNote | null} */
	let noteEditing = null;
	let noteDate = '';

	/** @param {string} date */
	function addNote(date) {
		if (!data.notesEnabled) return;
		noteEditing = null;
		noteDate = date;
		noteOpen = true;
	}
	/** @param {import('$lib/utils/dayNotes.js').DayNote} note */
	function editNote(note) {
		if (!data.notesEnabled) return;
		noteEditing = note;
		noteOpen = true;
	}
	/** @param {string} eventId */
	function openEvent(eventId) {
		const noteId = noteIdFromEventId(eventId);
		if (noteId === null) {
			selected = eventId;
			detailOpen = true;
			return;
		}
		const note = notes.find((n) => n.id === noteId);
		if (note) editNote(note);
	}

	/**
	 * @param {Partial<import('$lib/utils/agenda.js').AgendaRow & { draft?: boolean }>} values
	 * @param {Partial<import('$lib/utils/agenda.js').AgendaRow>} values
	 */
	function updateRow(slug, values) {
		rows = rows.map((r) => (r.slug === slug ? { ...r, ...values, slug } : r));
	}

	/* ---------- detalle ---------- */
	/** @type {string | null} */
	let selected = null;
	let detailOpen = false;
	$: selectedRow = visibleRows.find((r) => r.slug === selected) ?? null;
	$: selectedPending = selected ? (pending[selected] ?? null) : null;
	$: selectedProblem = selectedRow ? moveProblem(selectedRow) : null;

	/** @param {import('$lib/utils/agenda.js').AgendaRow} row */
	function moveProblem(row) {
		if (!data.canEdit) return 'No tenés permiso para moverlo.';
		return rescheduleProblem(agendaValues(row), data.places);
	}

	/* ---------- mover (arrastrar o "Mover a otro día"): queda pendiente hasta guardar ---------- */
	/** @type {import('$lib/utils/pendingMoves.js').PendingMoves} */
	let pending = {};
	$: pendingCount = Object.keys(pending).length;
	$: pendingSummary = pendingMovesSummary(pending);
	let saving = false;
	/** Los que no se pudieron guardar la última vez, con el motivo. @type {Record<string, string>} */
	let problems = {};
	$: problemList = Object.entries(problems).map(([slug, message]) => ({
		slug,
		message,
		title: pending[slug]?.title ?? rows.find((r) => r.slug === slug)?.title ?? slug
	}));
	let toast = '';
	let toastError = false;

	/** @param {string} message @param {boolean} [error] */
	function say(message, error = false) {
		toast = message;
		toastError = error;
	}

	/** @param {import('$lib/utils/pendingMoves.js').PendingAction} action */
	function dispatchPending(action) {
		pending = pendingMovesReducer(pending, action);
	}

	/**
	 * Anota que un evento va a otro día (y hora). No guarda: se guarda con "Guardar cambios".
	 * Moverlo otra vez cambia el mismo pendiente; volverlo a su día lo saca.
	 * @param {string} slug
	 * @param {{ date: string, time?: string }} to
	 * @param {() => void} [revert] deshace el arrastre en el calendario si no se puede
	 */
	function reschedule(slug, to, revert) {
		const row = rows.find((r) => r.slug === slug);
		const shown = visibleRows.find((r) => r.slug === slug);
		const problem = saving
			? 'Esperá a que termine de guardar.'
			: shown
				? moveProblem(shown)
				: 'No encontramos ese evento.';
		if (!row || problem) {
			revert?.();
			say(`No se pudo mover: ${problem}`, true);
			return;
		}
		dispatchPending({ type: 'move', slug, title: row.title, saved: agendaValues(row), to });
		if (slug in problems) {
			problems = Object.fromEntries(Object.entries(problems).filter(([s]) => s !== slug));
		}
		toast = '';
	}

	/**
	 * "Guardar cambios": todos los movidos juntos por la action `saveMany` (un commit, la misma de
	 * "Guardar N filas" de la planilla). Los que fallan quedan pendientes, con su motivo.
	 */
	async function saveMoves() {
		const changes = pendingSavePayload(pending);
		if (!changes.length || saving) return;
		saving = true;
		problems = {};
		toast = '';
		const r = await postAgendaSaveMany(changes);
		saving = false;
		if (!r) return;
		if (!r.results.length) {
			say(`No se guardó: ${r.message}`, true);
			return;
		}
		/** @type {string[]} */
		const saved = [];
		/** @type {Record<string, string>} */
		const failed = {};
		for (const c of changes) {
			const res = r.results.find((x) => x.slug === c.slug);
			if (res?.ok) {
				// Lo guardado pasa a ser la fila (el calendario se redibuja con eso).
				updateRow(c.slug, res.current ? agendaValues(res.current) : c.after);
				saved.push(c.slug);
			} else if (res?.current) {
				// Conflicto: la fila pasa a lo último del archivo y el movimiento sigue pendiente.
				updateRow(c.slug, res.current);
				dispatchPending({ type: 'rebase', slug: c.slug, saved: agendaValues(res.current) });
				failed[c.slug] = res.message;
			} else {
				const detail = res?.errors ? Object.values(res.errors)[0] : '';
				failed[c.slug] = `${res?.message ?? r.message}${detail ? ` ${detail}` : ''}`;
			}
		}
		dispatchPending({ type: 'saved', slugs: saved });
		problems = failed;
		if (saved.length) say(r.message, !r.ok);
	}

	function discardMoves() {
		if (!pendingCount) return;
		dispatchPending({ type: 'discard' });
		problems = {};
		say('Descartaste los cambios: los eventos volvieron a sus días.');
	}

	/* ---------- carga rápida: un borrador en un día, sin salir de la agenda ---------- */
	let quickOpen = false;
	let quickDate = '';
	let quickStart = '';
	let quickEnd = '';
	let quickBusy = false;
	let quickError = '';

	/**
	 * Tocaron un día vacío (o arrastraron un rango en la semana), o «Evento»: «¿Querés duplicar un
	 * evento que ya existe?» o «Empezar de cero», en una hoja.
	 * @param {{ date?: string, startTime?: string, endTime?: string }} at
	 */
	function openQuickAdd({ date = data.today, startTime = '', endTime = '' } = {}) {
		quickDate = date;
		quickStart = startTime;
		quickEnd = endTime;
		quickError = '';
		quickOpen = true;
	}

	/** @param {{ source?: string, title?: string }} what */
	async function createDraft(what) {
		if (quickBusy) return;
		quickBusy = true;
		quickError = '';
		const r = await postQuickDraft({
			...what,
			date: quickDate,
			startTime: quickStart,
			endTime: quickStart ? quickEnd : ''
		});
		quickBusy = false;
		if (!r) return;
		if (!r.ok || !r.row) {
			quickError = r.message;
			return;
		}
		const row = { ...r.row, slug: r.slug ?? r.row.slug };
		rows = [...rows.filter((x) => x.slug !== row.slug), row].sort((a, b) =>
			`${a.date}T${a.startTime}`.localeCompare(`${b.date}T${b.startTime}`)
		);
		quickOpen = false;
		say(
			`${r.message} Quedó como borrador (no se ve en el sitio): tocalo para completarlo o confirmarlo.`
		);
	}

	/* ---------- borradores: filtro «a confirmar» y «Confirmar» ---------- */
	let onlyDrafts = false;
	$: draftCount = rows.filter((r) => isDraftRow(r) && r.date >= data.today).length;
	let confirming = false;

	async function confirmSelected() {
		const row = rows.find((r) => r.slug === selected);
		if (!row || confirming) return;
		confirming = true;
		const r = await postConfirmDraft(row.slug, agendaValues(row));
		confirming = false;
		if (!r) return;
		if (r.ok) {
			updateRow(row.slug, { state: 'publicado', draft: false });
			say(r.message);
		} else {
			if (r.current) updateRow(row.slug, r.current);
			say(`No se confirmó: ${r.message}`, true);
		}
	}
</script>

<PageHeader
	title="Agenda"
	subtitle="Tocá un evento para ver lo principal, arrastralo para cambiarle el día (conserva su hora; se guarda cuando tocás «Guardar cambios» y confirmás) o tocá un día vacío para cargar un borrador (duplicando uno que ya existe o de cero) o dejarle una nota. Los borradores no se ven en el sitio hasta que los confirmás. En la planilla editás varios a la vez."
>
	<svelte:fragment slot="actions">
		<a class="kv-btn ghost" href="/admin/eventos/importar"
			><FileSpreadsheet size={16} aria-hidden="true" /> Importar planilla</a
		>
		{#if data.notesEnabled}
			<button class="kv-btn ghost" type="button" on:click={() => addNote(data.today)}
				><StickyNote size={16} aria-hidden="true" /> Nota del día</button
			>
		{/if}
		<button class="kv-btn" type="button" on:click={() => openQuickAdd()}
			><Plus size={16} aria-hidden="true" /> Evento</button
		>
	</svelte:fragment>
</PageHeader>

<UnsavedChanges
	draftKey={draftKey('agenda', 'eventos-movidos')}
	dirty={pendingCount > 0}
	snapshot={pending}
	restore={(d) => (pending = restorePendingMoves(d, rows))}
	{saving}
/>

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
>
	<button
		slot="filters"
		type="button"
		class="kv-btn ghost small drafts-filter"
		class:on={onlyDrafts}
		aria-pressed={onlyDrafts}
		title="Mostrar solo los borradores (no listados) que falta completar y confirmar"
		on:click={() => (onlyDrafts = !onlyDrafts)}
		><FilePen size={16} aria-hidden="true" /> A confirmar{draftCount
			? ` (${draftCount})`
			: ''}</button
	>
</AgendaToolbar>

{#if view === 'planilla'}
	<AgendaSheet
		rows={rows.filter((r) => r.date >= data.today)}
		draftsOnly={onlyDrafts}
		places={data.places}
		{notes}
		today={data.today}
		notesEnabled={data.notesEnabled}
		bind:dirtyCount={sheetDirty}
		on:saved={(e) => updateRow(e.detail.slug, e.detail.values)}
		on:addNote={(e) => addNote(e.detail)}
		on:openNote={(e) => editNote(e.detail)}
	/>
{:else if view}
	<Calendario
		bind:this={calendar}
		bind:title
		view={ecView}
		{events}
		on:open={(e) => openEvent(e.detail.id)}
		on:pick={(e) => openQuickAdd(e.detail)}
		on:move={(e) => reschedule(e.detail.id, e.detail, e.detail.revert)}
	/>
	{#if pendingCount || problemList.length}
		<PendingBar
			count={pendingCount}
			{saving}
			summary={pendingSummary}
			problems={problemList}
			on:save={saveMoves}
			on:discard={discardMoves}
			on:dismiss={() => (problems = {})}
			on:open={(e) => {
				selected = e.detail;
				detailOpen = true;
			}}
		/>
	{/if}
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
	busy={saving || confirming}
	pending={selectedPending}
	on:confirm={confirmSelected}
	on:move={(e) => selected && reschedule(selected, { date: e.detail.date })}
	on:revert={() => selected && dispatchPending({ type: 'revert', slug: selected })}
/>

<QuickAdd
	bind:open={quickOpen}
	bind:date={quickDate}
	bind:startTime={quickStart}
	bind:endTime={quickEnd}
	candidates={data.duplicables}
	busy={quickBusy}
	error={quickError}
	notesEnabled={data.notesEnabled}
	on:duplicate={(e) => createDraft({ source: e.detail.slug })}
	on:scratch={(e) => createDraft({ title: e.detail.title })}
	on:note={(e) => {
		quickOpen = false;
		addNote(e.detail);
	}}
/>

<DayNoteEditor
	bind:open={noteOpen}
	note={noteEditing}
	date={noteDate}
	on:saved={(e) => {
		notes = upsertDayNote(notes, e.detail);
		say('Nota guardada.');
	}}
	on:deleted={(e) => {
		notes = removeDayNote(notes, e.detail);
		say('Nota borrada.');
	}}
/>

<!-- Avisos (sin Deshacer: los movimientos se deshacen antes de guardar, con «Descartar»). -->
{#if toast}
	<UndoToast
		floating
		message={toast}
		error={toastError}
		canUndo={false}
		on:close={() => (toast = '')}
	/>
{/if}

<style>
	.note {
		background: var(--warn-bg);
		border-radius: 0.8rem;
		padding: 0.5rem 0.9rem;
	}
	.drafts-filter.on {
		background: var(--warn-bg);
		border-color: var(--warn);
		font-weight: 700;
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
