<script>
	/**
	 * Ventas › Órdenes, vista «Respuestas»: una tarjeta por pregunta de inscripción, en el orden
	 * del formulario (cards de `questionCards`, $lib/admin/ordersView.js).
	 *
	 * - Opciones y casillas: barras con cuántas (👥 si se pregunta por entrada, 🧾 si por compra),
	 *   con todas las opciones. Tocar una barra va a Compras filtrado por esa respuesta
	 *   (`onFilter`).
	 * - Texto: solo quienes escribieron algo, con su nombre (lleva a su compra, `onReveal`),
	 *   pronombres y «primera vez». «Copiar para el equipo» copia «Nombre (pronombres): respuesta»,
	 *   una por línea, como texto común (sin permiso para el portapapeles, lo deja seleccionado).
	 *
	 * Son datos de quien compra: solo en el panel.
	 */
	import { tick } from 'svelte';
	import { Copy } from '@lucide/svelte';
	import Badge from '$lib/components/admin/panel/Badge.svelte';
	import EmptyState from '$lib/components/admin/panel/EmptyState.svelte';
	import { announce } from '$lib/admin/announce.js';
	import { copyText } from '$lib/admin/ordersView.js';

	/** @type {import('$lib/admin/ordersView.js').QuestionCard[]} */
	export let cards = [];
	/** De qué compras salen las cuentas («Compras aprobadas · 🧾 3 · 👥 5»). */
	export let scope = '';
	/** La pestaña Preguntas del evento (para un evento sin preguntas). */
	export let questionsHref = '';
	/** @type {(card: import('$lib/admin/ordersView.js').QuestionCard, value: string) => void} */
	export let onFilter = () => {};
	/** @type {(orderId: string) => void} */
	export let onReveal = () => {};

	/** La tarjeta copiada (para decir «Copiado») o la que quedó con el texto seleccionado. */
	let copied = '';
	let fallback = '';
	/** @type {HTMLTextAreaElement | undefined} */
	let area;

	/** @param {import('$lib/admin/ordersView.js').QuestionCard} card */
	function copy(card) {
		const text = copyText(card);
		const showText = async () => {
			// Sin portapapeles (permiso, http): el texto queda a la vista y seleccionado.
			fallback = card.key;
			copied = '';
			await tick();
			area?.focus();
			area?.select();
			announce('No se pudo copiar solo: el texto quedó seleccionado para copiarlo a mano.');
		};
		try {
			// Dentro del clic: si no, Safari no deja escribir en el portapapeles.
			navigator.clipboard.writeText(text).then(() => {
				copied = card.key;
				fallback = '';
				announce('Copiado: pegalo donde quieras.');
			}, showText);
		} catch {
			showText();
		}
	}

	/**
	 * Lo que va debajo de la pregunta: por entrada o por compra y cuántas respondieron.
	 * @param {import('$lib/admin/ordersView.js').QuestionCard} c
	 */
	function caption(c) {
		const per = c.perTicket ? 'por entrada' : 'por compra';
		if (c.removed) {
			return `ya no está en el formulario · ${c.answered} ${c.answered === 1 ? 'respuesta' : 'respuestas'}`;
		}
		if (c.kind === 'text') return `${per} · ${c.entries.length} de ${c.asked} escribieron algo`;
		return `${per} · ${c.answered} de ${c.asked} respondieron`;
	}
</script>

{#if scope}<p class="scope">{scope}</p>{/if}
{#if cards.length === 0}
	<EmptyState title="Este evento no tiene preguntas de inscripción" />
	{#if questionsHref}<p class="scope"><a href={questionsHref}>Ir a Preguntas</a></p>{/if}
{/if}
<div class="cards">
	{#each cards as c (c.key)}
		{@const icon = c.perTicket ? '👥' : '🧾'}
		{@const top = Math.max(1, ...c.bars.map((b) => b.n))}
		<section class="question" class:removed={c.removed} aria-label={c.fullLabel}>
			<div class="q-head">
				<h3 title={c.fullLabel !== c.label ? c.fullLabel : undefined}>{c.label}</h3>
				<span class="caption">{caption(c)}</span>
				{#if c.kind === 'text' && c.entries.length}
					<button type="button" class="kv-btn ghost small copy" on:click={() => copy(c)}
						><Copy size={14} aria-hidden="true" />
						{copied === c.key ? 'Copiado' : 'Copiar para el equipo'}</button
					>
				{/if}
			</div>
			{#if c.kind === 'text'}
				{#if fallback === c.key}
					<textarea
						class="kv-input copy-area"
						readonly
						rows="4"
						aria-label="Texto para copiar"
						bind:this={area}
						value={copyText(c)}></textarea>
				{/if}
				{#if c.entries.length}
					<ul class="entries">
						{#each c.entries as e, i (i)}
							<li>
								<span class="who"
									><a href="#orden-{e.orderId}" on:click|preventDefault={() => onReveal(e.orderId)}
										>{e.name}</a
									>{#if e.pronouns}
										<span class="muted">({e.pronouns})</span>{/if}{#if e.firstTime}
										<Badge tone="info">primera vez</Badge>{/if}</span
								>
								<span class="text">{e.value}</span>
							</li>
						{/each}
					</ul>
				{:else}
					<p class="muted none">Nadie escribió nada todavía.</p>
				{/if}
			{:else}
				<ul class="bars">
					{#each c.bars as b (b.value)}
						<li>
							<button
								type="button"
								class="bar"
								disabled={b.n === 0}
								title={b.n ? 'Ver esas compras' : undefined}
								on:click={() => onFilter(c, b.value)}
							>
								<span class="label"
									>{b.value}{#if !b.defined}
										<span class="muted"> (ya no es una opción)</span>{/if}</span
								>
								<span class="track" aria-hidden="true"
									><span class="fill" style:width="{(b.n / top) * 100}%"></span></span
								>
								<span class="n">{icon} {b.n}</span>
							</button>
						</li>
					{/each}
				</ul>
			{/if}
		</section>
	{/each}
</div>

<style>
	.scope {
		margin: 0 0 var(--space-2xs);
		font-size: var(--text-sm);
		color: var(--muted);
	}
	.cards {
		display: flex;
		flex-direction: column;
		gap: var(--space-xs);
	}
	.question {
		border: 1px solid var(--line);
		border-radius: var(--card-round);
		padding: var(--space-2xs) var(--space-xs);
		display: flex;
		flex-direction: column;
		gap: var(--space-2xs);
		min-width: 0;
	}
	.removed {
		border-style: dashed;
	}
	.q-head {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 0.2rem var(--space-xs);
	}
	h3 {
		margin: 0;
		font-size: var(--text-base);
	}
	.caption {
		font-size: var(--text-xs);
		color: var(--muted);
	}
	.copy {
		margin-left: auto;
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		padding: var(--space-3xs) var(--space-2xs);
		font-size: var(--text-xs);
	}
	.copy-area {
		width: 100%;
		font-size: var(--text-sm);
	}
	.bars,
	.entries {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
	}
	.bars {
		gap: 0.2rem;
	}
	.bar {
		width: 100%;
		display: grid;
		grid-template-columns: minmax(8rem, 16rem) minmax(0, 1fr) 4.5rem;
		gap: var(--space-2xs);
		align-items: center;
		font: inherit;
		font-size: var(--text-sm);
		color: inherit;
		text-align: left;
		background: none;
		border: 0;
		border-radius: var(--radius-m);
		padding: 0.25rem 0.3rem;
		cursor: pointer;
	}
	.bar:hover:not(:disabled) {
		background: var(--surface-2, #f4eff7);
	}
	.bar:disabled {
		cursor: default;
		color: var(--muted);
	}
	.label {
		overflow-wrap: anywhere;
	}
	.track {
		height: 0.6rem;
		border-radius: 99px;
		background: var(--surface-2, #f4eff7);
		overflow: hidden;
	}
	.fill {
		display: block;
		height: 100%;
		background: var(--link);
		border-radius: 99px;
	}
	.n {
		text-align: right;
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}
	.entries li {
		display: grid;
		grid-template-columns: minmax(10rem, 15rem) minmax(0, 1fr);
		gap: var(--space-3xs) var(--space-s);
		padding: var(--space-3xs) 0;
		border-top: 1px solid var(--line);
		font-size: var(--text-sm);
	}
	.who {
		overflow-wrap: anywhere;
	}
	.who a {
		font-weight: 700;
	}
	.text {
		white-space: pre-line;
		overflow-wrap: anywhere;
	}
	.muted {
		color: var(--muted);
	}
	.none {
		margin: 0;
		font-size: var(--text-sm);
	}
	@media (max-width: 40rem) {
		.bar {
			grid-template-columns: minmax(0, 1fr) 4rem;
		}
		.track {
			grid-column: 1 / -1;
			grid-row: 2;
		}
		.entries li {
			grid-template-columns: minmax(0, 1fr);
		}
	}
</style>
