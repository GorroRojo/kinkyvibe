<script>
	/**
	 * Preguntas extra del formulario de compra o inscripción (texto, opciones o casilla). Campos
	 * comunes del formulario (`name` = fieldInputName): funcionan sin JavaScript. El servidor
	 * vuelve a validar todo (validatePurchase → validateAnswers).
	 *
	 * Las respuestas no se guardan en sessionStorage: son datos de la persona y no hace falta.
	 *
	 * Props: `fields` (SignupField[]), `values` (lo que se mandó, por `name`), `errors` (por
	 * `name`), `idPrefix`, `ticket` (0, 1, 2…: las preguntas "una vez por entrada" de esa entrada;
	 * `null` = las de una vez por compra), `legend` (`''` = sin título) y `hint` (el aviso de
	 * quién ve las respuestas).
	 */
	import { ANSWER_MAX, fieldInputName } from '$lib/utils/signupFields.js';

	/** @type {import('$lib/utils/signupFields.js').SignupField[]} */
	export let fields = [];
	/** @type {Record<string, string>} */
	export let values = {};
	/** @type {Record<string, string>} */
	export let errors = {};
	export let idPrefix = 'entradas-campo';
	/** @type {number | null} */
	export let ticket = null;
	export let legend = 'Unas preguntas más';
	export let hint = true;
</script>

{#if fields.length}
	<fieldset class="signup-fields">
		{#if legend}<legend>{legend}</legend>{/if}
		{#each fields as f (f.id)}
			{@const name = fieldInputName(f.id, ticket)}
			{@const id = ticket === null ? `${idPrefix}-${f.id}` : `${idPrefix}-${f.id}-${ticket}`}
			{#if f.kind === 'checkbox'}
				<label class="check">
					<input
						{id}
						type="checkbox"
						{name}
						required={f.required}
						checked={values[name] === 'on'}
						aria-invalid={errors[name] ? 'true' : undefined}
					/>
					<span
						>{f.label}{#if !f.required}&nbsp;<small>(opcional)</small>{/if}</span
					>
				</label>
			{:else if f.kind === 'choice'}
				<label class="field" for={id}>
					<span
						>{f.label}{#if !f.required}&nbsp;<small>(opcional)</small>{/if}</span
					>
					<select
						{id}
						{name}
						required={f.required}
						aria-invalid={errors[name] ? 'true' : undefined}
					>
						<option value="">Elegí una opción</option>
						{#each f.options as o (o)}
							<option value={o} selected={values[name] === o}>{o}</option>
						{/each}
					</select>
				</label>
			{:else}
				<label class="field" for={id}>
					<span
						>{f.label}{#if !f.required}&nbsp;<small>(opcional)</small>{/if}</span
					>
					<textarea
						{id}
						{name}
						rows="2"
						maxlength={ANSWER_MAX}
						required={f.required}
						value={values[name] ?? ''}
						aria-invalid={errors[name] ? 'true' : undefined}></textarea>
				</label>
			{/if}
			{#if errors[name]}<span class="field-error">{errors[name]}</span>{/if}
		{/each}
		{#if hint}<small class="hint">Tus respuestas las ven solo les organizadores.</small>{/if}
	</fieldset>
{/if}

<style>
	.signup-fields {
		border: 0;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 0.6em;
		min-width: 0;
	}
	legend {
		font-weight: bold;
		margin-bottom: 0.4em;
	}
	.field {
		display: flex;
		flex-direction: column;
		gap: 0.25em;
		min-width: 0;
	}
	.field > span {
		font-weight: bold;
		font-size: var(--step--1);
	}
	.check {
		display: flex;
		gap: 0.5em;
		align-items: flex-start;
	}
	.check input {
		width: 1.2em;
		height: 1.2em;
		margin-top: 0.15em;
		flex: none;
	}
	small {
		font-weight: normal;
	}
	textarea,
	select {
		font: inherit;
		padding: 0.55em 0.7em;
		border-radius: 0.5em;
		border: 2px solid color-mix(in srgb, var(--2) 45%, transparent);
		background: white;
		min-height: 2.8em;
		min-width: 0;
		width: 100%;
		box-sizing: border-box;
	}
	textarea {
		resize: vertical;
	}
	.field-error {
		color: var(--bad, #b00020);
		font-size: var(--step--1);
		font-weight: bold;
	}
	.hint {
		color: var(--muted);
		font-size: var(--step--2);
	}
</style>
