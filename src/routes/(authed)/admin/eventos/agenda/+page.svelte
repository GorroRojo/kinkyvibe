<script>
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { FileSpreadsheet, FlaskConical, Plus } from '@lucide/svelte';
	import PageHeader from '$lib/components/admin/panel/PageHeader.svelte';
	import UndoToast from '$lib/components/admin/panel/UndoToast.svelte';
	import UnsavedChanges from '$lib/components/admin/panel/UnsavedChanges.svelte';
	import PendingBar from '$lib/components/admin/agenda/PendingBar.svelte';
	import AgendaSheet from '$lib/components/admin/agenda/AgendaSheet.svelte';
	import AgendaToolbar from '$lib/components/admin/agenda/AgendaToolbar.svelte';
	import EventDetail from '$lib/components/admin/agenda/EventDetail.svelte';
	import Calendario from '$lib/components/admin/calendario/Calendario.svelte';
	import { postAgendaSaveMany } from '$lib/admin/agendaSave.js';
	import { draftKey } from '$lib/admin/draft.js';
	import { agendaValues } from '$lib/utils/agenda.js';
	import {
		CALENDAR_VIEWS,
		CALENDAR_VIEW_KEY,
		calendarEvents,
		defaultCalendarView,
		newEventHref,
		parseCalendarView,
		rescheduleProblem
	} from '$lib/utils/calendario.js';
	import {
		pendingMovesReducer,
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
	$: events = calendarEvents(visibleRows, {
		places: data.places,
		canEdit: data.canEdit && !saving
	});

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

	/** @param {{ date: string, startTime?: string, endTime?: string }} prefill */
	function create(prefill) {
		goto(newEventHref(prefill));
	}
</script>

<PageHeader
	title="Agenda"
	subtitle="Tocá un evento para ver lo principal, arrastralo para cambiarle el día (se guarda cuando tocás «Guardar cambios») o tocá un día vacío para cargar uno. En la planilla editás varios a la vez."
>
	<svelte:fragment slot="actions">
		<a class="kv-btn ghost" href="/admin/eventos/importar"
			><FileSpreadsheet size={16} aria-hidden="true" /> Importar planilla</a
		>
		<a class="kv-btn" href="/admin/eventos/nuevo"><Plus size={16} aria-hidden="true" /> Evento</a>
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
	{#if pendingCount || problemList.length}
		<PendingBar
			count={pendingCount}
			{saving}
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
	busy={saving}
	pending={selectedPending}
	on:move={(e) => selected && reschedule(selected, { date: e.detail.date })}
	on:revert={() => selected && dispatchPending({ type: 'revert', slug: selected })}
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
	.foot {
		font-size: 0.85rem;
		margin-top: 0.8rem;
	}
	.loading {
		padding: 3rem 0;
		text-align: center;
	}
</style>
