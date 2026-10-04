<script>
	/**
	 * La agenda como planilla: los eventos próximos en una tabla editable. Cada fila se guarda sola
	 * (Enter) por la action `save` de /admin/eventos/agenda, y "Guardar N filas" las guarda todas en
	 * un commit por la action `saveMany`; Escape deshace lo que no se guardó.
	 * Las filas van agrupadas por semana y por día (con lo guardado: una fila no salta de grupo
	 * mientras se edita), cada día con sus notas (ver dayNotes.js), y se pueden filtrar.
	 * Props: `rows` (filas de `agendaRows()`, se leen al montar), `places` (regiones válidas),
	 * `notes` (notas de los días), `today` (YYYY-MM-DD), `notesEnabled` (se pueden cargar notas),
	 * `dirtyCount` (bind: filas con cambios sin guardar). Eventos: `saved` { slug, values } cada vez
	 * que se guarda (o se deshace) una fila, para que la página actualice el calendario;
	 * `addNote` (detail: día) y `openNote` (detail: nota), para que la página abra el editor.
	 */
	import { createEventDispatcher } from 'svelte';
	import {
		CalendarDays,
		RotateCcw,
		Save,
		SearchX,
		SquareArrowOutUpRight,
		StickyNote
	} from '@lucide/svelte';
	import Badge from '$lib/components/admin/panel/Badge.svelte';
	import Card from '$lib/components/admin/panel/Card.svelte';
	import CsvButton from '$lib/components/admin/panel/CsvButton.svelte';
	import EmptyState from '$lib/components/admin/panel/EmptyState.svelte';
	import UndoToast from '$lib/components/admin/panel/UndoToast.svelte';
	import DayNoteChip from './DayNoteChip.svelte';
	import SheetFilters from './SheetFilters.svelte';
	import MissingBadge from './MissingBadge.svelte';
	import { postAgendaSave, postAgendaSaveMany } from '$lib/admin/agendaSave.js';
	import { eventPanelLink } from '$lib/admin/nav.js';
	import { dayLabel } from '$lib/admin/eventFormat.js';
	import {
		AGENDA_STATES,
		agendaValues,
		changedAgendaFields,
		validateAgendaRow
	} from '$lib/utils/agenda.js';
	import { EMPTY_SHEET_FILTER, agendaCsvRows, agendaSheetGroups } from '$lib/utils/agendaSheet.js';
	import { isDraftRow } from '$lib/utils/calendario.js';

	/** @typedef {import('$lib/utils/agenda.js').AgendaValues} Values */
	/** @typedef {import('$lib/utils/agenda.js').AgendaRow & { sellsTickets?: boolean, draft?: boolean, missing?: import('$lib/utils/eventMissing.js').MissingItem[] }} Row */

	/** @type {Row[]} */
	export let rows = [];
	/** @type {string[]} */
	export let places = [];
	/** @type {import('$lib/utils/dayNotes.js').DayNote[]} */
	export let notes = [];
	export let today = '';
	export let notesEnabled = false;
	/** Filas con cambios sin guardar (para avisar antes de cambiar de vista). */
	export let dirtyCount = 0;
	/** Filtro «a confirmar» de la agenda: solo los borradores (`isDraftRow`). */
	export let draftsOnly = false;

	const dispatch = createEventDispatcher();
	// Se leen una vez: después, cada fila lleva su propio estado.
	const data = { rows, places };

	const pick = agendaValues;

	/**
	 * Estado de cada fila: lo guardado (lo que dice el archivo) y lo que se está editando.
	 * @type {Record<string, { saved: Values, values: Values, saving: boolean, message: string, error: boolean, errors: Record<string, string> }>}
	 */
	let state = Object.fromEntries(
		data.rows.map((r) => [
			r.slug,
			{ saved: pick(r), values: pick(r), saving: false, message: '', error: false, errors: {} }
		])
	);
	/** El último cambio guardado, para "Deshacer". @type {{ slug: string, title: string, before: Values, after: Values } | null} */
	let last = null;
	let undoing = false;

	$: dirty = data.rows.filter(
		(r) => changedAgendaFields(state[r.slug].saved, state[r.slug].values).length
	);
	$: dirtyCount = dirty.length;

	/** @param {string} slug */
	function isDirty(slug) {
		return changedAgendaFields(state[slug].saved, state[slug].values).length > 0;
	}
	/** @param {string} slug */
	function liveErrors(slug) {
		const s = state[slug];
		if (!isDirty(slug)) return {};
		return validateAgendaRow(s.values, {
			places: data.places,
			allowEmptyPlace: s.saved.place === ''
		});
	}

	const post = postAgendaSave;

	/** @param {string} slug */
	async function save(slug) {
		const s = state[slug];
		if (s.saving || !isDirty(slug)) return;
		const errors = liveErrors(slug);
		if (Object.keys(errors).length) {
			state[slug] = { ...s, errors, message: 'Revisá los campos marcados.', error: true };
			return;
		}
		const before = { ...s.saved };
		const after = { ...s.values };
		state[slug] = { ...s, saving: true, message: 'Guardando…', error: false, errors: {} };
		const r = await post(slug, before, after);
		if (!r) return;
		applyResult(slug, before, after, r);
	}

	/**
	 * Lo que respondió el servidor para una fila (sola o dentro de "Guardar N filas").
	 * @param {string} slug
	 * @param {Values} before
	 * @param {Values} after
	 * @param {import('$lib/admin/agendaSave.js').AgendaSaveResponse} r
	 */
	function applyResult(slug, before, after, r) {
		const cur = state[slug];
		if (r.ok) {
			state[slug] = { ...cur, saving: false, saved: after, message: r.message, error: false };
			dispatch('saved', { slug, values: after });
			if (r.changed?.length) {
				const row = data.rows.find((x) => x.slug === slug);
				last = { slug, title: after.title || row?.title || slug, before, after };
			}
		} else if (r.current) {
			// Conflicto: la fila pasa a mostrar lo último del archivo.
			const fresh = pick(r.current);
			state[slug] = {
				...cur,
				saving: false,
				saved: fresh,
				values: fresh,
				message: r.message,
				error: true,
				errors: {}
			};
			dispatch('saved', { slug, values: fresh });
		} else {
			state[slug] = {
				...cur,
				saving: false,
				message: r.message,
				error: true,
				errors: r.errors ?? {}
			};
		}
	}

	let savingAll = false;

	/**
	 * "Guardar N filas": todas juntas en un commit (action `saveMany`, la misma de "Guardar cambios"
	 * del calendario). Las que no pasan la validación en vivo no se mandan; el servidor valida de
	 * nuevo cada una y devuelve un resultado por fila.
	 */
	async function saveAll() {
		if (savingAll) return;
		/** @type {import('$lib/admin/agendaSave.js').AgendaChange[]} */
		const changes = [];
		for (const row of dirty) {
			const s = state[row.slug];
			if (s.saving) continue;
			const errors = liveErrors(row.slug);
			if (Object.keys(errors).length) {
				state[row.slug] = { ...s, errors, message: 'Revisá los campos marcados.', error: true };
				continue;
			}
			changes.push({ slug: row.slug, before: { ...s.saved }, after: { ...s.values } });
			state[row.slug] = { ...s, saving: true, message: 'Guardando…', error: false, errors: {} };
		}
		if (!changes.length) return;
		savingAll = true;
		const r = await postAgendaSaveMany(changes);
		savingAll = false;
		if (!r) return;
		const bySlug = new Map(r.results.map((x) => [x.slug, x]));
		for (const c of changes) {
			applyResult(
				c.slug,
				c.before,
				c.after,
				bySlug.get(c.slug) ?? { status: r.status, ok: false, message: r.message }
			);
		}
	}

	/** @param {string} slug */
	function revert(slug) {
		const s = state[slug];
		state[slug] = { ...s, values: { ...s.saved }, message: '', error: false, errors: {} };
	}

	async function undo() {
		if (!last || undoing) return;
		undoing = true;
		const { slug, before, after } = last;
		const r = await post(slug, after, before);
		undoing = false;
		if (!r) return;
		const cur = state[slug];
		if (r.ok) {
			state[slug] = {
				...cur,
				saved: before,
				values: before,
				message: 'Cambio deshecho.',
				error: false,
				errors: {}
			};
			dispatch('saved', { slug, values: before });
			last = null;
		} else {
			state[slug] = { ...cur, message: `No se pudo deshacer: ${r.message}`, error: true };
		}
	}

	/** @param {KeyboardEvent} e @param {string} slug */
	function onKey(e, slug) {
		if (e.key === 'Enter' && !(e.target instanceof HTMLTextAreaElement)) {
			e.preventDefault();
			save(slug);
		} else if (e.key === 'Escape') {
			revert(slug);
		}
	}

	/** @param {BeforeUnloadEvent} e */
	function beforeUnload(e) {
		if (dirty.length) e.preventDefault();
	}

	/* ---------- grupos (semana → día), filtros y CSV ---------- */
	/** @type {import('$lib/utils/agendaSheet.js').SheetFilter} */
	let filter = { ...EMPTY_SHEET_FILTER };
	$: items = data.rows
		.filter((row) => !draftsOnly || isDraftRow({ ...row, state: state[row.slug].saved.state }))
		.map((row) => ({ ...state[row.slug].saved, slug: row.slug, row }));
	$: weeks = agendaSheetGroups(items, notes, { from: today, filter });
	$: shown = weeks.reduce((n, w) => n + w.days.reduce((m, d) => m + d.rows.length, 0), 0);
	$: csvRows = agendaCsvRows(weeks);
	const COLS = 8;

	/** @param {number} n */
	const eventsLabel = (n) => (n === 1 ? '1 evento' : n ? `${n} eventos` : 'Sin eventos');

	/**
	 * Un valor de la fila del CSV: lo que se ve en la planilla (con lo editado sin guardar).
	 * @param {{ row: Row | null }} x
	 * @param {keyof Values} field
	 */
	const cell = (x, field) => (x.row ? state[x.row.slug].values[field] : '');

	/** @type {import('$lib/admin/csv.js').CsvColumn<{ date: string, row: Row | null, notes: string }>[]} */
	const columns = [
		{ label: 'fecha', value: (x) => (x.row ? state[x.row.slug].values.date : x.date) },
		{ label: 'empieza', value: (x) => cell(x, 'startTime') },
		{ label: 'termina', value: (x) => cell(x, 'endTime') },
		{ label: 'evento', value: (x) => cell(x, 'title') },
		{ label: 'lugar', value: (x) => cell(x, 'locationName') },
		{ label: 'región', value: (x) => cell(x, 'place') },
		{ label: 'estado', value: (x) => cell(x, 'state') },
		{ label: 'venta', value: (x) => x.row?.status ?? '' },
		{ label: 'notas del día', key: 'notes' },
		{ label: 'slug', value: (x) => x.row?.slug ?? '' }
	];
</script>

<svelte:window on:beforeunload={beforeUnload} />

{#if data.rows.length || notes.length}
	<SheetFilters bind:filter places={data.places} {shown} total={data.rows.length} />
{/if}

<div class="sheet-actions">
	<CsvButton rows={csvRows} {columns} filename="agenda.csv" />
	<button class="kv-btn" on:click={saveAll} disabled={!dirty.length || savingAll}
		><Save size={16} aria-hidden="true" /> Guardar {dirty.length || ''}
		{dirty.length === 1 ? 'fila' : 'filas'}</button
	>
</div>

{#if last}
	<UndoToast message="Guardaste «{last.title}»." busy={undoing} on:undo={undo} />
{/if}

<!-- La tabla es más ancha y más alta que la pantalla: se desliza adentro (con el encabezado y la
     fecha fijos), sin mover la página. -->
<div class="sheet-box">
	<Card padded={false}>
		{#if data.rows.length === 0 && weeks.length === 0}
			<EmptyState
				icon={CalendarDays}
				title="No hay eventos próximos"
				text="Cargá uno o importá la planilla."
			>
				<a class="kv-btn" href="/admin/eventos/importar">Importar planilla</a>
			</EmptyState>
		{:else if weeks.length === 0}
			<EmptyState
				icon={SearchX}
				title="Ningún evento coincide"
				text="Probá con otra búsqueda o sacá los filtros."
			>
				<button class="kv-btn ghost" on:click={() => (filter = { ...EMPTY_SHEET_FILTER })}
					>Limpiar filtros</button
				>
			</EmptyState>
		{:else}
			<div class="sheet-scroll">
				<table class="kv-table sheet">
					<thead>
						<tr>
							<th class="col-date">Fecha</th>
							<th>Empieza</th>
							<th>Termina</th>
							<th>Evento</th>
							<th>Lugar</th>
							<th>Región</th>
							<th>Estado</th>
							<th><span class="sr-only">Acciones</span></th>
						</tr>
					</thead>
					{#each weeks as w (w.start)}
						<tbody class="week">
							<tr class="week-head">
								<th colspan={COLS} scope="rowgroup"><span class="stick">{w.label}</span></th>
							</tr>
							{#each w.days as d (d.date)}
								<tr class="day-head" class:is-today={d.date === today}>
									<th colspan={COLS} scope="rowgroup">
										<div class="stick day-line">
											<span class="day-label">{d.label}</span>
											{#if d.date === today}<Badge tone="info">hoy</Badge>{/if}
											<span class="day-count">{eventsLabel(d.rows.length)}</span>
											{#each d.notes as n (n.id)}
												<DayNoteChip
													note={n}
													disabled={!notesEnabled}
													on:open={(e) => dispatch('openNote', e.detail)}
												/>
											{/each}
											{#if notesEnabled && d.date}
												<button
													type="button"
													class="add-note"
													on:click={() => dispatch('addNote', d.date)}
													aria-label="Agregar una nota al {d.label}"
													><StickyNote size={14} aria-hidden="true" /> Nota</button
												>
											{/if}
										</div>
									</th>
								</tr>
								{#each d.rows as item (item.slug)}
									{@const row = item.row}
									{@const s = state[row.slug]}
									{@const errs = { ...liveErrors(row.slug), ...s.errors }}
									{@const changed = changedAgendaFields(s.saved, s.values)}
									<tr
										class="ev"
										class:dirty={changed.length}
										class:cancelled={s.values.state === 'cancelado'}
										on:keydown={(e) => onKey(e, row.slug)}
									>
										<td
											class="col-date"
											class:changed={changed.includes('date')}
											class:bad={errs.date}
										>
											<input
												type="date"
												bind:value={state[row.slug].values.date}
												aria-label="Fecha de {s.saved.title}"
												aria-invalid={errs.date ? 'true' : undefined}
												title={errs.date}
											/>
											<small class="hint left"
												>{s.values.date ? dayLabel(s.values.date).split(' ')[0] : ''}</small
											>
										</td>
										<td class:changed={changed.includes('startTime')} class:bad={errs.startTime}>
											<input
												type="time"
												bind:value={state[row.slug].values.startTime}
												aria-label="Hora de inicio de {s.saved.title}"
												aria-invalid={errs.startTime ? 'true' : undefined}
												title={errs.startTime}
											/>
										</td>
										<td class:changed={changed.includes('endTime')} class:bad={errs.endTime}>
											<input
												type="time"
												bind:value={state[row.slug].values.endTime}
												aria-label="Hora de fin de {s.saved.title}"
												aria-invalid={errs.endTime ? 'true' : undefined}
												title={errs.endTime}
											/>
										</td>
										<td
											class="title"
											class:changed={changed.includes('title')}
											class:bad={errs.title}
										>
											<input
												bind:value={state[row.slug].values.title}
												maxlength="200"
												aria-label="Título"
												aria-invalid={errs.title ? 'true' : undefined}
												title={errs.title}
											/>
										</td>
										<td
											class="place"
											class:changed={changed.includes('locationName')}
											class:bad={errs.locationName}
										>
											<input
												bind:value={state[row.slug].values.locationName}
												maxlength="200"
												placeholder="—"
												aria-label="Lugar de {s.saved.title}"
												title={errs.locationName}
											/>
										</td>
										<td class:changed={changed.includes('place')} class:bad={errs.place}>
											<select
												bind:value={state[row.slug].values.place}
												aria-label="Región de {s.saved.title}"
												aria-invalid={errs.place ? 'true' : undefined}
												title={errs.place}
											>
												{#if s.saved.place === ''}<option value="">—</option>{/if}
												{#each data.places as p}<option value={p}>{p}</option>{/each}
											</select>
										</td>
										<td class:changed={changed.includes('state')}>
											<select
												bind:value={state[row.slug].values.state}
												aria-label="Estado de {s.saved.title}"
											>
												{#each AGENDA_STATES as st}<option value={st.value} title={st.help}
														>{st.label}</option
													>{/each}
											</select>
											{#if isDraftRow({ ...row, state: s.saved.state })}
												<MissingBadge missing={row.missing ?? []} />
											{/if}
										</td>
										<td class="row-actions">
											{#if changed.length || s.saving}
												<button
													class="kv-btn small"
													on:click={() => save(row.slug)}
													disabled={s.saving}
													aria-label="Guardar {s.saved.title}">{s.saving ? '…' : 'Guardar'}</button
												>
												<button
													class="icon"
													on:click={() => revert(row.slug)}
													disabled={s.saving}
													title="Deshacer los cambios de esta fila"
													aria-label="Deshacer los cambios de {s.saved.title}"
													><RotateCcw size={16} aria-hidden="true" /></button
												>
											{/if}
											<a
												class="icon"
												href={eventPanelLink(row.slug, { tickets: row.sellsTickets })}
												title="Abrir la ficha del evento"
												aria-label="Abrir la ficha de {s.saved.title}"
												><SquareArrowOutUpRight size={16} aria-hidden="true" /></a
											>
											{#if s.message}
												<small class="msg" class:error={s.error} role="status">{s.message}</small>
											{/if}
										</td>
									</tr>
								{/each}
							{/each}
						</tbody>
					{/each}
				</table>
			</div>
		{/if}
	</Card>
</div>
<p class="muted foot">
	Cada fila se guarda con un cambio en GitHub (igual que el editor) y queda en el registro de
	actividad. El sitio tarda unos minutos en mostrarlo. Para todo lo demás (texto, imagen, entradas),
	abrí la ficha del evento. Las notas de los días solo las ven les admins.
</p>

<style>
	.sheet-actions {
		display: flex;
		flex-wrap: wrap;
		justify-content: flex-end;
		gap: var(--space-2xs);
		margin-bottom: 0.8rem;
	}
	.sheet-box {
		contain: inline-size;
	}
	/* Se desliza adentro en las dos direcciones: el encabezado y la fecha quedan fijos. */
	.sheet-scroll {
		overflow: auto;
		max-height: max(24rem, calc(100dvh - 14rem));
		border-radius: var(--card-round);
	}
	.sheet {
		border-collapse: separate;
		border-spacing: 0;
	}
	.sheet thead th {
		white-space: nowrap;
		position: sticky;
		top: 0;
		z-index: 3;
		background: var(--surface);
		box-shadow: inset 0 -2px 0 var(--line);
	}
	.sheet thead th.col-date {
		left: 0;
		z-index: 4;
	}
	.sheet td {
		padding: 0;
		border-right: 1px solid var(--line);
		vertical-align: top;
		position: relative;
		background: var(--surface);
	}
	.sheet td:last-child {
		border-right: 0;
	}
	.sheet td.col-date {
		position: sticky;
		left: 0;
		z-index: 1;
		box-shadow: inset -1px 0 0 var(--line);
	}

	/* Semana y día: filas de título que agrupan. */
	.week-head th {
		background: var(--surface);
		color: var(--link);
		font-size: var(--text-xs);
		text-transform: uppercase;
		letter-spacing: 0.04em;
		padding: var(--space-xs) var(--space-2xs) var(--space-3xs);
		border-bottom: 2px solid var(--link);
	}
	.day-head th {
		background: var(--surface-2);
		color: var(--text);
		font-size: var(--text-sm);
		font-weight: 400;
		padding: 0.4rem var(--space-2xs);
	}
	.day-head.is-today th {
		background: var(--link-bg);
	}
	.stick {
		position: sticky;
		left: 0.6rem;
		display: inline-flex;
		max-width: calc(100vw - 4rem);
	}
	.day-line {
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-3xs) var(--space-2xs);
	}
	.day-label {
		font-weight: 700;
		min-width: 6.5rem;
	}
	.day-label::first-letter {
		text-transform: uppercase;
	}
	.day-count {
		color: var(--muted);
		font-size: var(--text-xs);
	}
	.add-note {
		display: inline-flex;
		align-items: center;
		gap: 0.25em;
		border: 1px dashed var(--muted);
		border-radius: 0.4rem;
		background: transparent;
		color: var(--muted);
		font: inherit;
		font-size: var(--text-xs);
		padding: 0.1rem 0.45rem;
		cursor: pointer;
	}
	.add-note:hover,
	.add-note:focus-visible {
		color: var(--link);
		border-color: var(--link);
	}

	/* Filas de eventos: hover, foco, cambios sin guardar, cancelados. */
	.sheet tr.ev:hover td {
		background: var(--surface-2);
	}
	.sheet tr.ev:focus-within td {
		background: var(--link-bg);
	}
	.sheet tr.ev:focus-within td.col-date {
		box-shadow:
			inset 3px 0 0 var(--link),
			inset -1px 0 0 var(--line);
	}
	.sheet tr.dirty td {
		background: var(--warn-bg);
	}
	.sheet tr.cancelled .title input {
		text-decoration: line-through;
		color: var(--muted);
	}
	.sheet input,
	.sheet select {
		width: 100%;
		box-sizing: border-box;
		border: 0;
		background: transparent;
		padding: var(--space-2xs) var(--space-2xs);
		min-height: 2.6rem;
		min-width: 6.5rem;
		color: var(--text);
		font-variant-numeric: tabular-nums;
	}
	.sheet input[type='time'] {
		min-width: 6rem;
	}
	.sheet .place input {
		min-width: 11rem;
	}
	.sheet select {
		min-width: 8.5rem;
		cursor: pointer;
	}
	.sheet .title input {
		min-width: 16rem;
		font-weight: 700;
	}
	.sheet input:hover,
	.sheet select:hover {
		box-shadow: inset 0 -1px 0 var(--muted);
	}
	.sheet input:focus,
	.sheet select:focus {
		outline: 2px solid var(--link);
		outline-offset: -2px;
		background: var(--link-bg);
		box-shadow: none;
	}
	.sheet td.changed input,
	.sheet td.changed select {
		font-style: italic;
	}
	.sheet td.bad {
		box-shadow: inset 0 0 0 2px var(--bad);
	}
	.hint {
		position: absolute;
		left: 0.6rem;
		bottom: 0.1rem;
		font-size: var(--text-xs);
		color: var(--muted);
		pointer-events: none;
	}
	.row-actions {
		white-space: nowrap;
		padding: var(--space-3xs) var(--space-2xs) !important;
		min-width: 9rem;
		vertical-align: middle !important;
		text-align: right !important;
	}
	.kv-btn.small {
		padding: var(--space-3xs) var(--space-xs);
		font-size: var(--text-xs);
	}
	.icon {
		border: 0;
		background: transparent;
		color: var(--muted);
		width: 2.2rem;
		height: 2.2rem;
		border-radius: 50%;
		cursor: pointer;
		vertical-align: middle;
		display: inline-grid;
		place-items: center;
	}
	.icon:hover,
	.icon:focus-visible {
		background: var(--surface-2);
		color: var(--link);
	}
	.msg {
		display: block;
		white-space: normal;
		max-width: 16rem;
		font-size: var(--text-xs);
		color: var(--ok);
		margin-top: 0.2rem;
		text-align: left;
	}
	.msg.error {
		color: var(--error);
	}
	.foot {
		font-size: var(--text-xs);
		margin-top: 0.8rem;
	}
	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
		white-space: nowrap;
	}
</style>
