<script>
	/**
	 * La lista de entradas al costado de la Puerta, en la compu (pedido de gorrite, 22/11): todas
	 * las entradas del evento con quién entró, buscador y «Faltan / Adentro / Todas». Usa la lista
	 * que la Puerta ya guarda en el celu (`door.list`, la de sin conexión), así que no pide nada
	 * nuevo al servidor y anda igual sin conexión.
	 *
	 * Tocar una fila abre la compra («Ver compra», evento `details`); «Marcar» en una que falta la
	 * marca como un escaneo (evento `mark`, con el código o `ticket:<id>`, como el buscador).
	 */
	import { createEventDispatcher } from 'svelte';
	import { CircleCheck, Sparkles } from '@lucide/svelte';
	import { localSearch } from '$lib/admin/doorOffline.js';
	import { foldText } from '$lib/utils/text.js';

	/** @type {import('$lib/admin/doorOffline.js').OfflineTicket[]} */
	export let list = [];
	export let busy = false;

	const dispatch = createEventDispatcher();

	/** @type {'missing' | 'inside' | 'all'} */
	let show = 'missing';
	let q = '';

	$: valid = list.filter((t) => t.valid);
	$: insideCount = valid.filter((t) => t.at).length;
	$: base = q.trim() ? localSearch(list, q, 500) : list;
	$: rows = base
		.filter((t) => (show === 'all' ? true : show === 'inside' ? t.valid && t.at : t.valid && !t.at))
		.slice()
		.sort((a, b) => foldText(a.holder).localeCompare(foldText(b.holder)));

	/** @param {number | null} at */
	const time = (at) =>
		at ? new Date(at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }) : '';
</script>

<aside class="door-list" aria-label="Entradas del evento">
	<div class="head">
		<input
			type="search"
			placeholder="Buscar en la lista"
			aria-label="Buscar en la lista"
			bind:value={q}
		/>
		<div class="tabs" role="group" aria-label="Mostrar">
			<button type="button" aria-pressed={show === 'missing'} on:click={() => (show = 'missing')}
				>Faltan <span class="num">{valid.length - insideCount}</span></button
			>
			<button type="button" aria-pressed={show === 'inside'} on:click={() => (show = 'inside')}
				>Adentro <span class="num">{insideCount}</span></button
			>
			<button type="button" aria-pressed={show === 'all'} on:click={() => (show = 'all')}
				>Todas <span class="num">{list.length}</span></button
			>
		</div>
	</div>
	{#if rows.length}
		<ul>
			{#each rows as t (t.ticketId)}
				<li class:inside={t.at} class:void={!t.valid}>
					<button type="button" class="row" on:click={() => dispatch('details', t)}>
						<span class="who">
							<strong>{t.holder}</strong>
							{#if t.firstTime}<Sparkles size={14} aria-label="primera vez" />{/if}
							{#if t.pronouns}<span class="muted">{t.pronouns}</span>{/if}
						</span>
						<span class="meta muted">
							{t.type} · {t.orderRef}{#if !t.valid}
								· anulada{/if}
						</span>
					</button>
					{#if t.at}
						<span class="state"><CircleCheck size={16} aria-hidden="true" /> {time(t.at)}</span>
					{:else if t.valid}
						<button
							type="button"
							class="mark"
							disabled={busy}
							on:click={() => dispatch('mark', t.code || `ticket:${t.ticketId}`)}>Marcar</button
						>
					{/if}
				</li>
			{/each}
		</ul>
	{:else}
		<p class="muted empty">
			{q.trim()
				? 'Nadie con ese nombre.'
				: show === 'missing'
					? 'Ya entraron todes.'
					: 'Todavía no hay nadie.'}
		</p>
	{/if}
</aside>

<style>
	.door-list {
		display: flex;
		flex-direction: column;
		gap: var(--space-2xs);
		background: var(--surface);
		border: 1px solid var(--line);
		border-radius: 1rem;
		padding: var(--space-xs);
		min-height: 0;
	}
	.head {
		display: flex;
		flex-direction: column;
		gap: var(--space-2xs);
	}
	input {
		font: inherit;
		color: var(--text);
		background: var(--bg);
		border: 1px solid var(--line);
		border-radius: 0.6rem;
		padding: 0.5rem 0.7rem;
	}
	.tabs {
		display: flex;
		gap: 0.3rem;
		flex-wrap: wrap;
	}
	.tabs button {
		font: inherit;
		color: var(--text);
		background: transparent;
		border: 1px solid var(--line);
		border-radius: 2em;
		padding: 0.25rem 0.8rem;
		cursor: pointer;
	}
	.tabs button[aria-pressed='true'] {
		background: var(--accent);
		border-color: var(--accent);
		color: #fff;
	}
	ul {
		list-style: none;
		margin: 0;
		padding: 0;
		overflow-y: auto;
		min-height: 0;
		flex: 1;
	}
	li {
		display: flex;
		align-items: center;
		gap: var(--space-2xs);
		border-top: 1px solid var(--line);
	}
	li.void {
		opacity: 0.55;
	}
	.row {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 0.1rem;
		font: inherit;
		color: inherit;
		text-align: left;
		background: none;
		border: 0;
		padding: 0.5rem 0.2rem;
		cursor: pointer;
	}
	.who {
		display: flex;
		align-items: center;
		gap: 0.35rem;
		flex-wrap: wrap;
	}
	.muted {
		color: var(--muted);
	}
	.meta {
		font-size: 0.85em;
	}
	.state {
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
		color: var(--muted);
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}
	li.inside .state {
		color: hsl(160, 70%, 55%);
	}
	.mark {
		font: inherit;
		color: var(--text);
		background: var(--surface-2);
		border: 1px solid var(--line);
		border-radius: 0.6rem;
		padding: 0.3rem 0.7rem;
		cursor: pointer;
	}
	.num {
		font-variant-numeric: tabular-nums;
	}
	.empty {
		margin: var(--space-xs) 0;
	}
</style>
