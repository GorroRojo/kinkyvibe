<script>
	/**
	 * Respuestas a las preguntas de inscripción dentro de una compra (Ventas › Órdenes, vista
	 * Compras): «Pregunta: respuesta», en una fila que se parte si no entra. Son datos de quien
	 * compra: solo en el panel.
	 *
	 * - La de texto largo va cortada en una línea; tocarla la abre entera (tocar nunca filtra).
	 * - La de opciones o casilla lleva «ver quiénes respondieron igual», que filtra las compras por
	 *   esa respuesta (`onFilter`).
	 *
	 * Props: `answers` (ShownAnswer[] de $lib/admin/ordersView.js), `onFilter(answer)` y
	 * `showTicket`.
	 */
	import { answerTicketLabel } from '$lib/utils/signupFields.js';
	import { isLongAnswer } from '$lib/admin/ordersView.js';

	/** @type {import('$lib/admin/ordersView.js').ShownAnswer[]} */
	export let answers = [];
	/** @type {(answer: import('$lib/admin/ordersView.js').ShownAnswer) => void} */
	export let onFilter = () => {};
	/** «Pregunta:» (sin repetir: «¿Cómo te enteraste?» no lleva los dos puntos). @param {string} label */
	const withColon = (label) => (/[?:]$/.test(label) ? label : `${label}:`);
	/** «Entrada 2 · …» (no hace falta debajo de la persona de esa entrada). */
	export let showTicket = true;

	/** Las respuestas largas abiertas (`clave|entrada`). @type {Set<string>} */
	let open = new Set();
	/** @param {string} id */
	function toggle(id) {
		open = new Set(open);
		if (open.has(id)) open.delete(id);
		else open.add(id);
	}
</script>

{#if answers.length}
	<ul class="answers" aria-label="Respuestas">
		{#each answers as a (`${a.key}|${a.ticket ?? 0}`)}
			{@const id = `${a.key}|${a.ticket ?? 0}`}
			<li>
				<span class="q" title={a.fullLabel !== a.label ? a.fullLabel : undefined}
					>{#if showTicket && a.ticket}{`${answerTicketLabel(a.ticket)} · `}{/if}{withColon(
						a.label
					)}</span
				>
				{#if !a.choice && isLongAnswer(a.value)}
					<button
						type="button"
						class="long"
						class:open={open.has(id)}
						aria-expanded={open.has(id)}
						title={open.has(id) ? 'Tocá para achicar' : 'Tocá para leer entera'}
						on:click={() => toggle(id)}>{a.value}</button
					>
				{:else}
					<span class="v">{a.value}</span>
				{/if}
				{#if a.choice}
					<button type="button" class="same" on:click={() => onFilter(a)}
						>ver quiénes respondieron igual</button
					>
				{/if}
			</li>
		{/each}
	</ul>
{/if}

<style>
	.answers {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-wrap: wrap;
		gap: 0.15rem var(--space-s);
		min-width: 0;
		font-size: var(--text-sm);
	}
	li {
		min-width: 0;
		max-width: 100%;
		overflow-wrap: anywhere;
	}
	.q {
		color: var(--muted);
	}
	.v {
		white-space: pre-line;
	}
	.long {
		font: inherit;
		color: inherit;
		background: none;
		border: 0;
		padding: 0;
		text-align: left;
		cursor: pointer;
		display: inline-block;
		max-width: min(36rem, 100%);
		vertical-align: bottom;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		text-decoration: underline dotted var(--muted);
		text-underline-offset: 0.2em;
	}
	.long.open {
		display: inline;
		white-space: pre-line;
		text-decoration: none;
	}
	.same {
		font: inherit;
		font-size: var(--text-xs);
		background: none;
		border: 0;
		padding: 0 0.2rem;
		color: var(--link);
		text-decoration: underline;
		cursor: pointer;
	}
</style>
