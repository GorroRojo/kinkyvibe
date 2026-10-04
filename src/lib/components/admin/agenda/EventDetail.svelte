<script>
	/**
	 * Lo principal de un evento de la agenda, en una hoja (abajo en el celu, centrada en desktop):
	 * cuándo, dónde, estado, links a la ficha, al editor y al sitio, y "Mover a otro día" (lo mismo
	 * que arrastrarlo en el calendario, para hacerlo con teclado).
	 * Mover no guarda: queda pendiente hasta "Guardar cambios" (ver pendingMoves.js).
	 * Props: `row` (fila de la agenda como se ve, con lo pendiente aplicado, o null), `open` (bind),
	 * `problem` (por qué no se puede mover; null = se puede), `busy` (guardando), `pending` (el cambio
	 * sin guardar de este evento, o null). Eventos: `move` { date }, `revert` (volver a lo guardado),
	 * `confirm` (los borradores: «Confirmar», ver ConfirmDraft.svelte).
	 */
	import { createEventDispatcher } from 'svelte';
	import {
		CalendarClock,
		ExternalLink,
		Pencil,
		SquareArrowOutUpRight,
		Undo2
	} from '@lucide/svelte';
	import Sheet from '$lib/components/admin/door/Sheet.svelte';
	import Badge from '$lib/components/admin/panel/Badge.svelte';
	import ConfirmDraft from './ConfirmDraft.svelte';
	import { eventLink, editEventHref } from '$lib/admin/links.js';
	import { dayLabel } from '$lib/admin/eventFormat.js';
	import { isDraftRow, rowBadges } from '$lib/utils/calendario.js';
	import { isValidDate } from '$lib/utils/eventDraft.js';

	/** @type {(import('$lib/utils/agenda.js').AgendaRow & { sellsTickets?: boolean, draft?: boolean, missing?: import('$lib/utils/eventMissing.js').MissingItem[] }) | null} */
	export let row = null;
	export let open = false;
	/** @type {string | null} */
	export let problem = null;
	export let busy = false;
	/** @type {import('$lib/utils/pendingMoves.js').PendingMove | null} */
	export let pending = null;

	const dispatch = createEventDispatcher();
	let moveTo = '';
	let lastSlug = '';
	$: if (row && row.slug !== lastSlug) {
		lastSlug = row.slug;
		moveTo = row.date;
	}
	$: badges = row ? rowBadges(row) : [];
	$: time = row?.startTime ? [row.startTime, row.endTime].filter(Boolean).join(' – ') : '';
	$: savedWhen = pending
		? `${dayLabel(pending.before.date)}${pending.before.startTime ? ` · ${pending.before.startTime}` : ''}`
		: '';
</script>

<Sheet bind:open title={row?.title ?? ''}>
	{#if row}
		{#if pending}
			<div class="pending" role="status">
				<p>
					<b>Cambio sin guardar.</b> Estaba el {savedWhen}. Se guarda con «Guardar cambios».
				</p>
				<button class="kv-btn ghost small" type="button" on:click={() => dispatch('revert')}
					><Undo2 size={16} aria-hidden="true" /> Volver a su día</button
				>
			</div>
		{/if}
		<dl class="facts">
			<dt>Cuándo</dt>
			<dd>{row.date ? dayLabel(row.date) : '—'}{time ? ` · ${time}` : ''}</dd>
			<dt>Lugar</dt>
			<dd>{row.locationName || '—'}{row.place ? ` (${row.place})` : ''}</dd>
			{#if badges.length}
				<dt>Estado</dt>
				<dd class="badges">
					{#each badges as b}<Badge tone={b.tone}>{b.label}</Badge>{/each}
				</dd>
			{/if}
		</dl>

		{#if isDraftRow(row)}
			{#key row.slug}
				<ConfirmDraft
					missing={row.missing ?? []}
					busy={busy || Boolean(pending)}
					editHref={editEventHref(row.slug)}
					on:confirm={() => dispatch('confirm')}
				/>
			{/key}
			{#if pending}<small class="muted"
					>Guardá o descartá el cambio de día antes de confirmarlo.</small
				>{/if}
		{/if}

		<div class="links">
			<a class="kv-btn" href={eventLink(row.slug, { tickets: row.sellsTickets })}
				><SquareArrowOutUpRight size={16} aria-hidden="true" /> Ficha</a
			>
			<a class="kv-btn ghost" href={editEventHref(row.slug)}
				><Pencil size={16} aria-hidden="true" /> Editar</a
			>
			<a class="kv-btn ghost" href="/calendario/{row.slug}" target="_blank" rel="noreferrer"
				><ExternalLink size={16} aria-hidden="true" /> Ver en el sitio</a
			>
		</div>

		<form
			class="move"
			on:submit|preventDefault={() => {
				if (isValidDate(moveTo) && moveTo !== row?.date) dispatch('move', { date: moveTo });
			}}
		>
			<label for="ev-move-date"
				><CalendarClock size={16} aria-hidden="true" /> Mover a otro día</label
			>
			<div class="move-row">
				<input
					id="ev-move-date"
					type="date"
					bind:value={moveTo}
					disabled={!!problem || busy}
					aria-describedby={problem ? 'ev-move-problem' : undefined}
				/>
				<button
					class="kv-btn ghost"
					disabled={!!problem || busy || !isValidDate(moveTo) || moveTo === row.date}>Mover</button
				>
			</div>
			{#if problem}
				<small id="ev-move-problem" class="muted">{problem}</small>
			{:else}
				<small class="muted"
					>Mantiene la hora y queda pendiente hasta que toques «Guardar cambios». También podés
					arrastrarlo en el calendario.</small
				>
			{/if}
		</form>
	{/if}
</Sheet>

<style>
	.pending {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2xs) var(--space-xs);
		background: var(--warn-bg);
		border: 1px dashed var(--warn);
		border-radius: var(--radius-m);
		padding: var(--space-2xs) var(--space-xs);
	}
	.pending p {
		margin: 0;
		flex: 1 1 14rem;
	}
	.facts {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr);
		gap: 0.4rem var(--space-xs);
		margin: 0;
	}
	dt {
		color: var(--muted);
		font-size: var(--text-xs);
	}
	dd {
		margin: 0;
		overflow-wrap: anywhere;
	}
	.badges {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-3xs);
	}
	.links {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2xs);
	}
	.move {
		display: flex;
		flex-direction: column;
		gap: var(--space-3xs);
		border-top: 1px solid var(--line);
		padding-top: var(--space-xs);
	}
	.move label {
		display: inline-flex;
		align-items: center;
		gap: var(--space-3xs);
		font-weight: 700;
	}
	.move-row {
		display: flex;
		gap: var(--space-2xs);
		flex-wrap: wrap;
	}
	.move input {
		min-height: 2.6rem;
		border: 1px solid var(--line);
		border-radius: var(--radius-s);
		padding: 0 var(--space-2xs);
		background: var(--surface);
		color: var(--text);
	}
</style>
