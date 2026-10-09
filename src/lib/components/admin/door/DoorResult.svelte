<script>
	/**
	 * Resultado grande del modo puerta: verde "Adelante", amarillo "Ya ingresó", rosa "Anulada",
	 * "De otro evento" o "QR inválido". Tocar el bloque (o "Ver compra") abre la compra completa.
	 *
	 * Eventos: `undo`, `details`, `reveal` (DNI completo).
	 */
	import { createEventDispatcher } from 'svelte';
	import { invalidTitle } from '$lib/admin/doorOffline.js';
	import { argTime } from '$lib/utils/dates.js';
	import {
		ChevronRight,
		CircleCheck,
		CircleX,
		CloudUpload,
		Sparkles,
		TriangleAlert,
		Undo2
	} from '@lucide/svelte';

	/** @typedef {import('$lib/admin/doorOffline.js').DoorScan} DoorScan */

	/** @type {DoorScan} */
	export let scan;
	/** Nombre de la serie ("Primera vez en …"). */
	export let series = '';
	/** DNI completo si ya se pidió. */
	/** @type {string | null} */
	export let dni = null;
	export let canUndo = false;

	const dispatch = createEventDispatcher();

	const TITLES = {
		ok: 'Adelante',
		sold: 'Vendida · adentro',
		already: 'Ya ingresó',
		void: 'Anulada',
		'wrong-event': 'De otro evento',
		invalid: 'QR inválido',
		error: 'No se pudo validar'
	};
	$: title =
		scan.result === 'invalid' ? invalidTitle(scan.result, scan.typed) : TITLES[scan.result];

	$: tone =
		scan.result === 'ok' || scan.result === 'sold'
			? 'ok'
			: scan.result === 'already'
				? 'warn'
				: 'bad';
	$: card = scan.card;

	/** @param {number | null | undefined} ms */
	function time(ms) {
		return ms ? argTime(ms) : '';
	}

	/** @param {string} d */
	const dotted = (d) => Number(d).toLocaleString('es-AR');

	function details() {
		if (card) dispatch('details', card);
	}
</script>

<!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions (con teclado: el botón "Ver compra") -->
<div
	class="result {tone}"
	class:clickable={Boolean(card)}
	role="status"
	aria-live="assertive"
	on:click={details}
>
	<div class="head">
		<p class="title">
			{#if tone === 'ok'}<CircleCheck size={34} strokeWidth={2.5} />
			{:else if tone === 'warn'}<TriangleAlert size={34} strokeWidth={2.5} />
			{:else}<CircleX size={34} strokeWidth={2.5} />{/if}
			<span>{title}</span>
		</p>
		{#if canUndo && card}
			<button type="button" class="pill" on:click|stopPropagation={() => dispatch('undo', card)}>
				<Undo2 size={18} /> Deshacer
			</button>
		{/if}
	</div>

	{#if card}
		<p class="who">
			<strong>{card.holder}</strong>{#if card.pronouns}&nbsp;({card.pronouns}){/if} · {card.type}
		</p>
		{#if scan.result === 'already'}
			<p class="when">
				Entró a las {time(card.at)}{#if card.by}, marcó {card.by}{/if}
			</p>
		{:else if scan.result === 'void'}
			<p class="when">La compra fue reembolsada o cancelada.</p>
		{/if}
		{#if card.firstTime && series && tone === 'ok'}
			<p class="first"><Sparkles size={16} /> Primera vez en {series}</p>
		{/if}
		{#if scan.cards && scan.cards.length > 1}
			<p class="small">
				También: {scan.cards
					.slice(1)
					.map((c) => c.holder)
					.join(', ')}
			</p>
		{/if}
		<p class="small">
			Compró: {card.buyer}{#if card.email}&nbsp;· <span class="email">{card.email}</span>{/if}
		</p>
		<p class="small meta">
			{#if card.dniTail}
				{#if dni}
					<span class="mono">DNI {dotted(dni)}</span>
				{:else}
					<button
						type="button"
						class="dni"
						on:click|stopPropagation={() => dispatch('reveal', card)}
						title="Tocá para ver el DNI completo (queda registrado)"
					>
						DNI •••.{card.dniTail}
					</button>
				{/if}
			{/if}
			{#if card.code}<span class="mono code">{card.code.slice(0, 3)} {card.code.slice(3)}</span
				>{/if}
			{#if scan.offline}<span class="offline"><CloudUpload size={14} /> sin conexión</span>{/if}
		</p>
		<button type="button" class="more" on:click|stopPropagation={details}>
			Ver compra <ChevronRight size={18} />
		</button>
	{:else if scan.result === 'wrong-event'}
		<p class="who">Esta entrada es para: <strong>{scan.otherEvent ?? 'otro evento'}</strong></p>
	{:else if scan.result === 'invalid'}
		<p class="who">
			{#if scan.offline}No está en la lista de este evento ({scan.typed
					? 'código mal escrito'
					: 'QR inválido'} o de otro evento).
			{:else}No existe ninguna entrada con ese código.{/if}
		</p>
	{:else if scan.message}
		<p class="who">{scan.message}</p>
	{/if}
</div>

<style>
	.result {
		border-radius: var(--radius-l);
		padding: var(--space-xs) var(--space-s) var(--space-xs);
		display: flex;
		flex-direction: column;
		gap: var(--space-3xs);
		animation: pop 0.22s ease-out;
		box-shadow: var(--shadow-3);
	}
	.clickable {
		cursor: pointer;
	}
	.ok {
		background: var(--3);
		color: #032a1f;
	}
	.warn {
		background: var(--4);
		color: #2e2600;
	}
	.bad {
		background: var(--1-dark-fixed, hsl(319, 100%, 40%));
		color: #fff;
	}
	@keyframes pop {
		from {
			transform: scale(0.95);
			opacity: 0.5;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.result {
			animation: none;
		}
	}
	p {
		margin: 0;
	}
	.head {
		display: flex;
		align-items: center;
		gap: var(--space-2xs);
	}
	.title {
		flex: 1;
		display: flex;
		align-items: center;
		gap: 0.45rem;
		font-size: var(--text-2xl);
		font-weight: 700;
		line-height: 1.1;
	}
	.who {
		font-size: var(--text-base);
		overflow-wrap: anywhere;
	}
	.when {
		font-size: var(--text-sm);
	}
	.small {
		font-size: var(--text-sm);
		overflow-wrap: anywhere;
	}
	.meta {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.4rem var(--space-2xs);
	}
	.first {
		align-self: flex-start;
		display: inline-flex;
		align-items: center;
		gap: var(--space-3xs);
		background: rgba(255, 255, 255, 0.55);
		color: #3b0a52;
		font-weight: 700;
		border-radius: 2em;
		padding: 0.2rem var(--space-2xs);
		margin: 0.15rem 0;
	}
	.bad .first {
		background: rgba(0, 0, 0, 0.25);
		color: #fff;
	}
	.mono {
		font-family: ui-monospace, monospace;
		font-weight: 700;
	}
	.code {
		background: rgba(255, 255, 255, 0.45);
		border-radius: 0.4rem;
		padding: 0 0.4rem;
		letter-spacing: 0.08em;
	}
	.bad .code {
		background: rgba(0, 0, 0, 0.25);
	}
	.dni {
		font: inherit;
		font-family: ui-monospace, monospace;
		font-weight: 700;
		color: inherit;
		background: none;
		border: 0;
		border-bottom: 2px dotted currentColor;
		padding: var(--space-3xs) 0;
		cursor: pointer;
	}
	.offline {
		display: inline-flex;
		align-items: center;
		gap: 0.2rem;
		font-weight: 700;
	}
	.pill,
	.more {
		display: inline-flex;
		align-items: center;
		gap: var(--space-3xs);
		border: 0;
		border-radius: 2em;
		font-weight: 700;
		cursor: pointer;
		color: inherit;
	}
	.pill {
		background: rgba(255, 255, 255, 0.6);
		padding: var(--space-2xs) var(--space-xs);
		min-height: 2.75rem;
	}
	.bad .pill {
		background: rgba(0, 0, 0, 0.25);
	}
	.more {
		align-self: flex-end;
		background: none;
		padding: var(--space-2xs) 0 0.2rem;
		min-height: 2.75rem;
	}
</style>
