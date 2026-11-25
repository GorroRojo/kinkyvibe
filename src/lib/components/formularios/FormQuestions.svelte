<script>
	/**
	 * Las preguntas de un formulario como las ve quien responde (docs/formularios.md): la página
	 * pública (/formularios/<dirección> y /calendario/<evento>/encuesta) y la vista previa del
	 * editor del panel. Campos comunes (`name` = `answerName(id)`): andan sin JavaScript.
	 *
	 * Piezas del sitio público: opciones con `ChoiceCard` (`.kv-choice`); «Varias opciones» con una
	 * casilla por opción, todas con el mismo `name` (en columnas en pantallas anchas: pueden ser
	 * hasta 40); el puntaje con cinco
	 * botones iguales (radios nativos: las flechas recorren el grupo; gorrite, 5/11: «el 1 a 5 se ve
	 * mal, como estirado») y los textos y casillas con el estilo de las preguntas
	 * de inscripción del flujo de compra (SignupFieldInputs.svelte). «Texto corto», «Número» y
	 * «Fecha» son inputs nativos (`text`, `number` con `step="any"`, `date`: manda `aaaa-mm-dd`) y
	 * «Lista desplegable» un `<select>`; «Foto», `<input type="file" accept="image/*">` (el
	 * formulario que la usa va `multipart`: PublicForm.svelte). La ayuda de cada pregunta va debajo de su título, antes de
	 * lo que se contesta (gorrite, 24/11).
	 *
	 * Props: `questions` (Question[]), `values` (lo que se mandó, por id de pregunta), `errors` (por
	 * id), `idPrefix`, `preview` (en el panel: sin `name`, así no se manda nada).
	 */
	import ChoiceCard from '$lib/components/ui/ChoiceCard.svelte';
	import { FORM_ANSWER_MAX, answerName, splitMulti } from '$lib/utils/formularios.js';

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
	/**
	 * Lo mismo para «Varias opciones» (lo que volvió son las elegidas juntas, con « | »). Recibe
	 * `values` para que la plantilla se actualice cuando cambia.
	 * @param {Record<string, string>} vals @param {string} id @param {string} v
	 */
	const pickedMulti = (vals, id, v) => (splitMulti(vals[id]).includes(v) ? { checked: true } : {});
	/**
	 * Lo que describe el campo: el error (si hay) y la ayuda.
	 * @param {string} id @param {{ help?: string }} q @param {string | undefined} err
	 */
	const describedBy = (id, q, err) =>
		[err ? `${id}-error` : '', q.help ? `${id}-help` : ''].filter(Boolean).join(' ') || undefined;
</script>

<div class="form-questions">
	{#each questions as q (q.id)}
		{@const id = `${idPrefix}-${q.id}`}
		{@const err = errors[q.id]}
		{#if q.kind === 'rating'}
			<fieldset aria-describedby={describedBy(id, q, err)}>
				<legend
					>{q.label || '…'}{#if !q.required}&nbsp;<small>(opcional)</small>{/if}</legend
				>
				{#if q.help}<small class="help" id="{id}-help">{q.help}</small>{/if}
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
			</fieldset>
		{:else if q.kind === 'choice'}
			<fieldset aria-describedby={describedBy(id, q, err)}>
				<legend
					>{q.label || '…'}{#if !q.required}&nbsp;<small>(opcional)</small>{/if}</legend
				>
				{#if q.help}<small class="help" id="{id}-help">{q.help}</small>{/if}
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
			</fieldset>
		{:else if q.kind === 'multi'}
			<fieldset aria-describedby={describedBy(id, q, err)}>
				<legend
					>{q.label || '…'}{#if !q.required}&nbsp;<small>(opcional)</small>{/if}</legend
				>
				{#if q.help}<small class="help" id="{id}-help">{q.help}</small>{/if}
				<div class="multi">
					{#each q.options as o (o)}
						<label class="multi-option"
							><input
								type="checkbox"
								name={nameOf(q.id) ?? `${id}-vista`}
								value={o}
								{...pickedMulti(values, q.id, o)}
							/><span>{o}</span></label
						>
					{/each}
				</div>
			</fieldset>
		{:else if q.kind === 'checkbox'}
			<label class="check">
				<input
					{id}
					type="checkbox"
					name={nameOf(q.id)}
					{...values[q.id] === 'on' ? { checked: true } : {}}
					aria-invalid={err ? 'true' : undefined}
					aria-describedby={describedBy(id, q, err)}
				/>
				<span
					>{q.label || '…'}{#if !q.required}&nbsp;<small>(opcional)</small>{/if}</span
				>
			</label>
			{#if q.help}<small class="help check-help" id="{id}-help">{q.help}</small>{/if}
		{:else if q.kind === 'select'}
			<label class="field" for={id}>
				<span
					>{q.label || '…'}{#if !q.required}&nbsp;<small>(opcional)</small>{/if}</span
				>
				{#if q.help}<small class="help" id="{id}-help">{q.help}</small>{/if}
				<select
					{id}
					name={nameOf(q.id)}
					aria-invalid={err ? 'true' : undefined}
					aria-describedby={describedBy(id, q, err)}
				>
					<option value="">Elegí una opción</option>
					{#each q.options as o (o)}
						<option value={o} {...values[q.id] === o ? { selected: true } : {}}>{o}</option>
					{/each}
				</select>
			</label>
		{:else if q.kind === 'short' || q.kind === 'number' || q.kind === 'date'}
			<label class="field" for={id}>
				<span
					>{q.label || '…'}{#if !q.required}&nbsp;<small>(opcional)</small>{/if}</span
				>
				{#if q.help}<small class="help" id="{id}-help">{q.help}</small>{/if}
				{#if q.kind === 'number'}
					<input
						{id}
						class="number"
						type="number"
						name={nameOf(q.id)}
						step="any"
						min={q.min}
						max={q.max}
						inputmode="decimal"
						aria-invalid={err ? 'true' : undefined}
						aria-describedby={describedBy(id, q, err)}
						{...values[q.id] ? { value: values[q.id] } : {}}
					/>
				{:else if q.kind === 'date'}
					<input
						{id}
						class="date"
						type="date"
						name={nameOf(q.id)}
						aria-invalid={err ? 'true' : undefined}
						aria-describedby={describedBy(id, q, err)}
						{...values[q.id] ? { value: values[q.id] } : {}}
					/>
				{:else}
					<input
						{id}
						type="text"
						name={nameOf(q.id)}
						maxlength={FORM_ANSWER_MAX}
						aria-invalid={err ? 'true' : undefined}
						aria-describedby={describedBy(id, q, err)}
						{...values[q.id] ? { value: values[q.id] } : {}}
					/>
				{/if}
			</label>
		{:else if q.kind === 'photo'}
			<label class="field" for={id}>
				<span
					>{q.label || '…'}{#if !q.required}&nbsp;<small>(opcional)</small>{/if}</span
				>
				{#if q.help}<small class="help" id="{id}-help">{q.help}</small>{/if}
				<input
					{id}
					class="photo"
					type="file"
					accept="image/*"
					name={nameOf(q.id)}
					aria-invalid={err ? 'true' : undefined}
					aria-describedby={describedBy(id, q, err)}
				/>
			</label>
		{:else}
			<label class="field" for={id}>
				<span
					>{q.label || '…'}{#if !q.required}&nbsp;<small>(opcional)</small>{/if}</span
				>
				{#if q.help}<small class="help" id="{id}-help">{q.help}</small>{/if}
				<textarea
					{id}
					name={nameOf(q.id)}
					rows="3"
					maxlength={FORM_ANSWER_MAX}
					aria-invalid={err ? 'true' : undefined}
					aria-describedby={describedBy(id, q, err)}
					{...values[q.id] ? { value: values[q.id] } : {}}></textarea>
			</label>
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
	/* «Varias opciones»: casillas compactas, en tantas columnas como entren (pueden ser 40). */
	.multi {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(min(100%, 10rem), 1fr));
		gap: 0.35em 1em;
	}
	.multi-option {
		display: flex;
		gap: 0.5em;
		align-items: flex-start;
		min-width: 0;
		padding: 0.2em 0;
		overflow-wrap: anywhere;
		cursor: pointer;
	}
	.multi-option input {
		width: 1.2em;
		height: 1.2em;
		margin: 0.1em 0 0;
		flex: none;
		accent-color: var(--2-dark, var(--2));
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
	textarea,
	input:is([type='text'], [type='number'], [type='date']),
	select {
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
	}
	textarea {
		resize: vertical;
	}
	/* Un número o una fecha no necesitan todo el ancho. */
	input.number,
	input.date {
		max-width: 14rem;
	}
	/* La foto: el botón nativo del navegador (en el celu abre la cámara o la galería). */
	input.photo {
		font: inherit;
		max-width: 100%;
		padding: 0.55em 0.7em;
		border-radius: var(--radius-s);
		border: 2px dashed color-mix(in srgb, var(--2) 45%, transparent);
		background: var(--surface, white);
		box-sizing: border-box;
	}
	.check-help {
		margin-top: -0.6em;
		padding-left: 1.7em;
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
