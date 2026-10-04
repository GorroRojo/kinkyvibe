<script>
	/**
	 * Respuestas de una orden a las preguntas de inscripción (pestaña Órdenes del panel). Son
	 * datos de quien compra: este componente se usa solo en el panel.
	 *
	 * Props: `answers` ({ id, label, value, ticket? }[]). Las de "una vez por entrada" dicen de
	 * qué entrada son («Entrada 2 · ¿Alguna restricción alimentaria?»). Se muestra la pregunta
	 * como estaba al comprar.
	 */
	import { answerTicketLabel } from '$lib/utils/signupFields.js';

	/** @type {import('$lib/utils/signupFields.js').Answer[]} */
	export let answers = [];
</script>

{#if answers.length}
	<dl class="answers" aria-label="Respuestas a las preguntas">
		{#each answers as a (`${a.id}-${a.ticket ?? 0}`)}
			<div>
				<dt>
					{#if a.ticket}<span class="ticket">{answerTicketLabel(a.ticket)} ·</span>{/if}
					{a.label}
				</dt>
				<dd>{a.value}</dd>
			</div>
		{/each}
	</dl>
{/if}

<style>
	.answers {
		margin: 0.4rem 0;
		padding: var(--space-2xs) var(--space-xs);
		border-radius: var(--radius-m);
		background: var(--surface-2, #f4eff7);
		display: flex;
		flex-direction: column;
		gap: var(--space-3xs);
		font-size: var(--text-sm);
	}
	dt {
		font-weight: 700;
	}
	.ticket {
		font-weight: 400;
		color: var(--muted);
	}
	dd {
		margin: 0;
		white-space: pre-line;
		overflow-wrap: anywhere;
	}
</style>
