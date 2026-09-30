<script>
	import { deserialize } from '$app/forms';
	import { CalendarDays, FlaskConical, Plus, RotateCcw, Save, Undo2 } from '@lucide/svelte';
	import PageHeader from '$lib/components/admin/panel/PageHeader.svelte';
	import Card from '$lib/components/admin/panel/Card.svelte';
	import CsvButton from '$lib/components/admin/panel/CsvButton.svelte';
	import EmptyState from '$lib/components/admin/panel/EmptyState.svelte';
	import { eventPanelLink } from '$lib/admin/nav.js';
	import { dayLabel } from '$lib/admin/eventFormat.js';
	import {
		AGENDA_FIELDS,
		AGENDA_STATES,
		changedAgendaFields,
		validateAgendaRow
	} from '$lib/utils/agenda.js';

	/** @type {import('./$types').PageData} */
	export let data;

	/** @typedef {import('$lib/utils/agenda.js').AgendaValues} Values */
	/** @typedef {(typeof data.rows)[number]} Row */

	/** @param {Row | Values} r @returns {Values} */
	const pick = (r) =>
		/** @type {Values} */ (Object.fromEntries(AGENDA_FIELDS.map((f) => [f, r[f]])));

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

	/**
	 * @param {string} slug
	 * @param {Values} before
	 * @param {Values} after
	 */
	async function post(slug, before, after) {
		const body = new FormData();
		body.set('slug', slug);
		body.set('before', JSON.stringify(before));
		body.set('after', JSON.stringify(after));
		const res = await fetch('?/save', {
			method: 'POST',
			body,
			headers: { accept: 'application/json', 'x-sveltekit-action': 'true' }
		});
		/** @type {any} */
		const r = deserialize(await res.text());
		if (r.type === 'redirect') {
			location.href = r.location;
			return null;
		}
		return r.data?.save ?? { ok: false, message: 'Error del servidor. Probá de nuevo.' };
	}

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
		const cur = state[slug];
		if (r.ok) {
			state[slug] = { ...cur, saving: false, saved: after, message: r.message, error: false };
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

	async function saveAll() {
		for (const r of dirty) await save(r.slug);
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

	/** @type {import('$lib/admin/csv.js').CsvColumn<Row>[]} */
	const columns = [
		{ label: 'fecha', value: (r) => state[r.slug].values.date },
		{ label: 'empieza', value: (r) => state[r.slug].values.startTime },
		{ label: 'termina', value: (r) => state[r.slug].values.endTime },
		{ label: 'evento', value: (r) => state[r.slug].values.title },
		{ label: 'lugar', value: (r) => state[r.slug].values.locationName },
		{ label: 'región', value: (r) => state[r.slug].values.place },
		{ label: 'estado', value: (r) => state[r.slug].values.state },
		{ label: 'venta', value: (r) => r.status },
		{ label: 'slug', key: 'slug' }
	];
</script>

<svelte:window on:beforeunload={beforeUnload} />

<PageHeader
	title="Agenda"
	subtitle="Los próximos eventos, como en la planilla: tocá una celda, escribí y guardá la fila (Enter). Escape deshace lo que no guardaste."
>
	<svelte:fragment slot="actions">
		<CsvButton rows={data.rows} {columns} filename="agenda.csv" />
		<a class="kv-btn ghost" href="/admin/eventos/nuevo"
			><Plus size={16} aria-hidden="true" /> Evento</a
		>
		<button class="kv-btn" on:click={saveAll} disabled={!dirty.length}
			><Save size={16} aria-hidden="true" /> Guardar {dirty.length || ''}
			{dirty.length === 1 ? 'fila' : 'filas'}</button
		>
	</svelte:fragment>
</PageHeader>

{#if data.mock}
	<p class="note">
		<FlaskConical size={15} aria-hidden="true" /> Modo de prueba: los cambios van a una carpeta temporal,
		no a GitHub.
	</p>
{/if}

{#if last}
	<div class="undo" role="status">
		<span>Guardaste «{last.title}».</span>
		<button class="kv-btn ghost" on:click={undo} disabled={undoing}
			><Undo2 size={16} aria-hidden="true" /> {undoing ? 'Deshaciendo…' : 'Deshacer'}</button
		>
	</div>
{/if}

<Card padded={false}>
	{#if data.rows.length === 0}
		<EmptyState
			icon={CalendarDays}
			title="No hay eventos próximos"
			text="Cargá uno o importá la planilla."
		>
			<a class="kv-btn" href="/admin/eventos/importar">Importar planilla</a>
		</EmptyState>
	{:else}
		<div class="kv-table-wrap">
			<table class="kv-table sheet">
				<thead>
					<tr>
						<th>Fecha</th>
						<th>Empieza</th>
						<th>Termina</th>
						<th>Evento</th>
						<th>Lugar</th>
						<th>Región</th>
						<th>Estado</th>
						<th><span class="sr-only">Acciones</span></th>
					</tr>
				</thead>
				<tbody>
					{#each data.rows as row (row.slug)}
						{@const s = state[row.slug]}
						{@const errs = { ...liveErrors(row.slug), ...s.errors }}
						{@const changed = changedAgendaFields(s.saved, s.values)}
						<tr class:dirty={changed.length} on:keydown={(e) => onKey(e, row.slug)}>
							<td class:changed={changed.includes('date')} class:bad={errs.date}>
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
							<td class="title" class:changed={changed.includes('title')} class:bad={errs.title}>
								<input
									bind:value={state[row.slug].values.title}
									maxlength="200"
									aria-label="Título"
									aria-invalid={errs.title ? 'true' : undefined}
									title={errs.title}
								/>
								<a class="hint" href={eventPanelLink(row.slug, { tickets: row.sellsTickets })}
									>ficha →</a
								>
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
								{#if s.message}
									<small class="msg" class:error={s.error} role="status">{s.message}</small>
								{/if}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</Card>
<p class="muted foot">
	Cada fila se guarda con un cambio en GitHub (igual que el editor) y queda en el registro de
	actividad. El sitio tarda unos minutos en mostrarlo. Para todo lo demás (texto, imagen, entradas),
	abrí la ficha del evento.
</p>

<style>
	.note {
		background: var(--warn-bg);
		border-radius: 0.8rem;
		padding: 0.5rem 0.9rem;
	}
	.undo {
		display: flex;
		align-items: center;
		justify-content: space-between;
		flex-wrap: wrap;
		gap: 0.5rem;
		background: var(--ok-bg);
		border-radius: var(--card-round);
		padding: 0.5rem 0.6rem 0.5rem 1rem;
		margin-bottom: 1rem;
	}
	.sheet td {
		padding: 0;
		border-right: 1px solid var(--line);
		vertical-align: top;
		position: relative;
	}
	.sheet td:last-child {
		border-right: 0;
	}
	.sheet th {
		white-space: nowrap;
	}
	.sheet input,
	.sheet select {
		width: 100%;
		box-sizing: border-box;
		border: 0;
		background: transparent;
		padding: 0.6rem 0.6rem;
		min-height: 2.75rem;
		min-width: 6.5rem;
		color: var(--text);
	}
	.sheet input[type='time'] {
		min-width: 6rem;
	}
	.sheet .place input {
		min-width: 11rem;
	}
	.sheet select {
		min-width: 8.5rem;
	}
	.sheet .title input {
		min-width: 16rem;
		font-weight: 700;
	}
	.sheet input:focus,
	.sheet select:focus {
		outline: 2px solid var(--link);
		outline-offset: -2px;
		background: var(--link-bg);
	}
	.sheet tr.dirty td {
		background: var(--warn-bg);
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
		right: 0.4rem;
		bottom: 0.1rem;
		font-size: 0.68rem;
		color: var(--muted);
		pointer-events: none;
	}
	.hint.left {
		right: auto;
		left: 0.6rem;
	}
	a.hint {
		pointer-events: auto;
		text-decoration: none;
	}
	.row-actions {
		white-space: nowrap;
		padding: 0.35rem 0.5rem !important;
		min-width: 9rem;
		vertical-align: middle !important;
	}
	.kv-btn.small {
		padding: 0.3rem 0.8rem;
		font-size: 0.85rem;
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
	}
	.icon:hover {
		background: var(--surface-2);
	}
	.msg {
		display: block;
		white-space: normal;
		max-width: 16rem;
		font-size: 0.78rem;
		color: var(--ok);
		margin-top: 0.2rem;
	}
	.msg.error {
		color: var(--bad);
	}
	.foot {
		font-size: 0.85rem;
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
