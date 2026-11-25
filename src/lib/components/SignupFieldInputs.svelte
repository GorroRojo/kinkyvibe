<script>
	/**
	 * Preguntas extra del formulario de compra o inscripción, con todos los tipos de los
	 * formularios menos «Foto» (src/lib/utils/questions.js). Las dibuja el mismo componente que los
	 * formularios (FormQuestions.svelte): acá solo van el título, el aviso y el `name` de cada campo
	 * (`fieldInputName`, con la entrada en las de "una vez por entrada"). Campos comunes: funcionan
	 * sin JavaScript (con `required` del navegador). El servidor vuelve a validar todo
	 * (validatePurchase → validateAnswers).
	 *
	 * Las respuestas no se guardan en sessionStorage: son datos de la persona y no hace falta.
	 *
	 * Props: `fields` (SignupField[]), `values` (lo que se mandó, por `name`), `errors` (por
	 * `name`), `idPrefix`, `ticket` (0, 1, 2…: las preguntas "una vez por entrada" de esa entrada;
	 * `null` = las de una vez por compra), `legend` (`''` = sin título) y `hint` (el aviso de
	 * quién ve las respuestas).
	 */
	import FormQuestions from '$lib/components/formularios/FormQuestions.svelte';
	import { ANSWER_MAX, fieldInputName } from '$lib/utils/signupFields.js';

	/** @type {import('$lib/utils/signupFields.js').SignupField[]} */
	export let fields = [];
	/** @type {Record<string, string | string[]>} */
	export let values = {};
	/** @type {Record<string, string>} */
	export let errors = {};
	export let idPrefix = 'entradas-campo';
	/** @type {number | null} */
	export let ticket = null;
	export let legend = 'Unas preguntas más';
	export let hint = true;

	/** @param {number} id */
	const inputName = (id) => fieldInputName(id, ticket);
	/**
	 * Lo de cada pregunta (por `name`), por id de pregunta: lo que usa FormQuestions.
	 * @template T
	 * @param {Record<string, T>} byName
	 * @returns {Record<string, T>}
	 */
	const byId = (byName) =>
		Object.fromEntries(
			fields
				.filter((f) => byName[fieldInputName(f.id, ticket)] !== undefined)
				.map((f) => [String(f.id), byName[fieldInputName(f.id, ticket)]])
		);
</script>

{#if fields.length}
	<fieldset class="signup-fields">
		{#if legend}<legend>{legend}</legend>{/if}
		<FormQuestions
			questions={fields}
			values={byId(values)}
			errors={byId(errors)}
			idPrefix={ticket === null ? idPrefix : `${idPrefix}-t${ticket}`}
			{inputName}
			textMax={ANSWER_MAX}
			nativeRequired
		/>
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
	.hint {
		color: var(--muted);
		font-size: var(--step--2);
	}
</style>
