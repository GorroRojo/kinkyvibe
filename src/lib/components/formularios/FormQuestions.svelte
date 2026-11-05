<script>
	/**
	 * Las preguntas de un formulario como las ve quien responde (docs/formularios.md): la página
	 * pública (/formularios/<dirección> y /calendario/<evento>/encuesta) y la vista previa del
	 * editor del panel. Campos comunes (`name` = `answerName(id)`): andan sin JavaScript.
	 *
	 * Piezas del sitio público: opciones con `ChoiceCard` (`.kv-choice`), el puntaje con cinco
	 * botones iguales (radios nativos: las flechas recorren el grupo; gorrite, 5/11: «el 1 a 5 se ve
	 * mal, como estirado») y los textos y casillas con el estilo de las preguntas
	 * de inscripción del flujo de compra (SignupFieldInputs.svelte).
	 *
	 * Props: `questions` (Question[]), `values` (lo que se mandó, por id de pregunta), `errors` (por
	 * id), `idPrefix`, `preview` (en el panel: sin `name`, así no se manda nada).
	 */
	import ChoiceCard from '$lib/components/ui/ChoiceCard.svelte';
	import { FORM_ANSWER_MAX, answerName } from '$lib/utils/formularios.js';

	/** @type {import('$lib/utils/formularios.js').Question[]} */
	export let questions = [];
	/** @type {Record<string, string>} */
	export let values = {};
	/** @type {Record<string, string>} */
	export let errors = {};
	export let idPrefix = 'form';
	export let preview = false;

	/** @type {Record<string, string>} */
	let chosen = {};
	$: for (const q of questions) if (!(q.id in chosen)) chosen[q.id] = values[q.id] ?? '';

	/** @param {string} id */
	const nameOf = (id) => (preview ? undefined : answerName(id));
	/*
	 * Lo elegido vuelve solo después de un error (`values`): sin nada para devolver no se pasa
	 * `checked`, así al hidratar no se borra lo que alguien eligió antes de que cargue el JavaScript.
	 */
	/** @param {string} id @param {string} v */
	const picked = (id, v) => (values[id] === v ? { checked: true } : {});
</script>

<div class="form-questions">
	{#each questions as q (q.id)}
		{@const id = `${idPrefix}-${q.id}`}
		{@const err = errors[q.id]}
		{#if q.kind === 'rating'}
			<fieldset aria-describedby={err ? `${id}-error` : q.help ? `${id}-help` : undefined}>
				<legend
					>{q.label || '…'}{#if !q.required}&nbsp;<small>(opcional)</small>{/if}</legend
				>
				<div class="rating">
					<div
						class="rating-options"
						role="radiogroup"
						aria-label={q.label}
						aria-describedby="{id}-scale"
					>
						{#each [1, 2, 3, 4, 5] as n (n)}
							<label
								><input
									type="radio"
									name={nameOf(q.id) ?? `${id}-vista`}
									value={String(n)}
									{...picked(q.id, String(n))}
								/><span>{n}</span></label
							>
						{/each}
					</div>
					<small class="scale" id="{id}-scale"
						><span>1 = {q.low}</span><span>5 = {q.high}</span></small
					>
				</div>
				{#if q.help}<small class="help" id="{id}-help">{q.help}</small>{/if}
			</fieldset>
		{:else if q.kind === 'choice'}
			<fieldset aria-describedby={err ? `${id}-error` : q.help ? `${id}-help` : undefined}>
				<legend
					>{q.label || '…'}{#if !q.required}&nbsp;<small>(opcional)</small>{/if}</legend
				>
				<div class="choices">
					{#each q.options as o (o)}
						<ChoiceCard
							name={nameOf(q.id) ?? `${id}-vista`}
							value={o}
							title={o}
							bind:group={chosen[q.id]}
						/>
					{/each}
				</div>
				{#if q.help}<small class="help" id="{id}-help">{q.help}</small>{/if}
			</fieldset>
		{:else if q.kind === 'checkbox'}
			<label class="check">
				<input
					{id}
					type="checkbox"
					name={nameOf(q.id)}
					{...values[q.id] === 'on' ? { checked: true } : {}}
					aria-invalid={err ? 'true' : undefined}
					aria-describedby={err ? `${id}-error` : q.help ? `${id}-help` : undefined}
				/>
				<span
					>{q.label || '…'}{#if !q.required}&nbsp;<small>(opcional)</small>{/if}</span
				>
			</label>
			{#if q.help}<small class="help" id="{id}-help">{q.help}</small>{/if}
		{:else}
			<label class="field" for={id}>
				<span
					>{q.label || '…'}{#if !q.required}&nbsp;<small>(opcional)</small>{/if}</span
				>
				<textarea
					{id}
					name={nameOf(q.id)}
					rows="3"
					maxlength={FORM_ANSWER_MAX}
					aria-invalid={err ? 'true' : undefined}
					aria-describedby={err ? `${id}-error` : q.help ? `${id}-help` : undefined}
					{...values[q.id] ? { value: values[q.id] } : {}}></textarea>
			</label>
			{#if q.help}<small class="help" id="{id}-help">{q.help}</small>{/if}
		{/if}
		{#if err}<span class="field-error" id="{id}-error">{err}</span>{/if}
	{/each}
</div>

<style>
	.form-questions {
		display: flex;
		flex-direction: column;
		gap: 1.1em;
		min-width: 0;
	}
	fieldset {
		border: 0;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 0.45em;
		min-width: 0;
	}
	legend,
	.field > span {
		font-weight: bold;
		padding: 0;
		margin-bottom: 0.35em;
		overflow-wrap: anywhere;
	}
	small {
		font-weight: normal;
	}
	/* El puntaje: cinco botones iguales, juntos y a la izquierda; «1 = …» y «5 = …» debajo de las
	   puntas del grupo (no de toda la fila). */
	.rating {
		display: inline-grid;
		justify-self: start;
		gap: 0.35em;
		max-width: 100%;
	}
	.rating-options {
		display: grid;
		grid-template-columns: repeat(5, 2.75rem);
		gap: 0.4rem;
	}
	.rating-options label {
		position: relative;
		display: grid;
		place-items: center;
		aspect-ratio: 1;
		border-radius: var(--radius-s, 0.5rem);
		box-shadow: inset 0 0 0 2px color-mix(in srgb, var(--2) 45%, transparent);
		background: var(--surface, white);
		color: var(--2-dark, var(--2));
		font-weight: bold;
		font-size: var(--text-sm, 1rem);
		cursor: pointer;
		transition: background 150ms;
	}
	.rating-options label:hover {
		background: color-mix(in srgb, var(--2) 10%, var(--surface, white));
	}
	.rating-options label:has(input:checked) {
		background: var(--2-dark, var(--2));
		box-shadow: inset 0 0 0 2px var(--2-dark, var(--2));
		color: white;
	}
	.rating-options label:has(input:focus-visible) {
		outline: var(--focus-ring, 2px solid var(--2-dark));
		outline-offset: 2px;
	}
	.rating-options input {
		position: absolute;
		opacity: 0;
		width: 1px;
		height: 1px;
		margin: 0;
		pointer-events: none;
	}
	.scale {
		display: flex;
		justify-content: space-between;
		gap: 1em;
		color: var(--muted);
	}
	.choices {
		display: grid;
		gap: 0.5em;
	}
	.field {
		display: flex;
		flex-direction: column;
		gap: 0.25em;
		min-width: 0;
	}
	.check {
		display: flex;
		gap: 0.5em;
		align-items: flex-start;
		font-weight: bold;
	}
	.check input {
		width: 1.2em;
		height: 1.2em;
		margin-top: 0.15em;
		flex: none;
	}
	textarea {
		font: inherit;
		font-size: max(1rem, 16px);
		padding: 0.55em 0.7em;
		border-radius: var(--radius-s);
		border: 2px solid color-mix(in srgb, var(--2) 45%, transparent);
		background: var(--surface, white);
		color: inherit;
		min-height: 2.8em;
		width: 100%;
		box-sizing: border-box;
		resize: vertical;
	}
	.help {
		color: var(--muted);
		font-size: var(--step--1);
	}
	.field-error {
		color: var(--bad, #b00020);
		font-size: var(--step--1);
		font-weight: bold;
	}
</style>
