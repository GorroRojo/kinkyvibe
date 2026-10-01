<script>
	/**
	 * Respuestas de una orden a las preguntas de inscripción (pestaña Órdenes del panel). Son
	 * datos de quien compra: este componente se usa solo en el panel.
	 *
	 * Props: `answers` ({ id, label, value }[]).
	 */
	/** @type {import('$lib/utils/signupFields.js').Answer[]} */
	export let answers = [];
</script>

{#if answers.length}
	<dl class="answers" aria-label="Respuestas a las preguntas">
		{#each answers as a (a.id)}
			<div>
				<dt>{a.label}</dt>
				<dd>{a.value}</dd>
			</div>
		{/each}
	</dl>
{/if}

<style>
	.answers {
		margin: 0.4rem 0;
		padding: 0.5rem 0.8rem;
		border-radius: 0.8em;
		background: var(--surface-2, #f4eff7);
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
		font-size: 0.9rem;
	}
	dt {
		font-weight: 700;
	}
	dd {
		margin: 0;
		white-space: pre-line;
		overflow-wrap: anywhere;
	}
</style>
