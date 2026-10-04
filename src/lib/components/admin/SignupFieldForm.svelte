<script>
	/**
	 * Formulario de una pregunta (texto, opciones o casilla; obligatoria u opcional; una vez por
	 * compra o una vez por entrada; para todos los tipos de entrada o algunos). Sin `field`,
	 * "Agregar pregunta" (`?/createField`); con `field`, editarla (`?/updateField`). Lo usan
	 * Eventos › Roles y preguntas (generales) y la pestaña Preguntas de un evento. Las acciones
	 * están en src/lib/server/personas/admin.js.
	 *
	 * Props: `form` (lo que devolvió la acción, para errores y valores), `idPrefix`, `field` (la
	 * pregunta a editar, o `null`), `types` (los tipos de entrada del evento; vacío en las
	 * generales: aplican a todos y cada evento las acota al elegirlas).
	 */
	import { enhance } from '$app/forms';
	import {
		FIELD_KINDS,
		FIELD_KIND_LABELS,
		LABEL_MAX,
		MAX_OPTIONS
	} from '$lib/utils/signupFields.js';

	/** @type {any} */
	export let form = null;
	export let idPrefix = 'pregunta';
	/** @type {(import('$lib/utils/signupFields.js').SignupField) | null} */
	export let field = null;
	/** @type {{ id: string, name: string }[]} */
	export let types = [];

	// Los errores y valores devueltos son de este formulario: el de agregar (sin `editing`) o el
	// de editar esa pregunta.
	$: mine = field ? form?.field?.editing === field.id : form?.field?.editing === undefined;
	$: failed = mine && form?.field && !form.field.ok ? form.field : null;
	$: errors = failed?.errors ?? {};
	/** @type {any} */
	$: values = failed?.values ?? (field ? { ...field, options: field.options.join('\n') } : {});

	let kind = field?.kind ?? 'text';
	let scope = field?.ticketTypes?.length ? 'some' : 'all';
	$: chosenTypes = new Set(
		failed?.values?.ticketTypes ?? field?.ticketTypes ?? types.map((t) => t.id)
	);
	$: prefix = field ? `${idPrefix}-${field.id}` : idPrefix;
</script>

<form
	class="kv-form field-form"
	method="POST"
	action={field ? '?/updateField' : '?/createField'}
	use:enhance={() =>
		async ({ update }) =>
			update({ reset: !field })}
>
	{#if field}<input type="hidden" name="id" value={field.id} />{/if}
	<label class="kv-field">
		<span>Pregunta</span>
		<input
			id="{prefix}-label"
			name="label"
			maxlength={LABEL_MAX}
			required
			value={values.label ?? ''}
			placeholder="Ej.: ¿Tenés alguna restricción alimentaria?"
			aria-invalid={errors.label ? 'true' : undefined}
		/>
		{#if errors.label}<small class="kv-error">{errors.label}</small>{/if}
	</label>
	<div class="kv-grid-2">
		<label class="kv-field">
			<span>Tipo</span>
			<select id="{prefix}-kind" name="kind" bind:value={kind}>
				{#each FIELD_KINDS as k (k)}<option value={k}>{FIELD_KIND_LABELS[k]}</option>{/each}
			</select>
			{#if errors.kind}<small class="kv-error">{errors.kind}</small>{/if}
		</label>
		<div class="checks">
			<label class="kv-check">
				<input type="checkbox" name="required" checked={Boolean(values.required)} />
				<span>Obligatoria</span>
			</label>
			<label class="kv-check">
				<input type="checkbox" name="per_ticket" checked={Boolean(values.perTicket)} />
				<span>Una vez por entrada (si compran 3, responden 3 veces)</span>
			</label>
		</div>
	</div>
	{#if kind === 'choice'}
		<label class="kv-field">
			<span>Opciones (una por renglón, hasta {MAX_OPTIONS})</span>
			<textarea
				id="{prefix}-options"
				name="options"
				rows="4"
				value={values.options ?? ''}
				aria-invalid={errors.options ? 'true' : undefined}></textarea>
			{#if errors.options}<small class="kv-error">{errors.options}</small>{/if}
		</label>
	{/if}
	{#if types.length > 1}
		<fieldset class="kv-field scope">
			<legend>¿A qué entradas aplica?</legend>
			<label class="kv-check">
				<input type="radio" name="scope" value="all" bind:group={scope} />
				<span>A todas</span>
			</label>
			<label class="kv-check">
				<input type="radio" name="scope" value="some" bind:group={scope} />
				<span>Solo a algunos tipos de entrada</span>
			</label>
			{#if scope === 'some'}
				<div class="types">
					{#each types as t (t.id)}
						<label class="kv-check">
							<input
								type="checkbox"
								name="ticket_types"
								value={t.id}
								checked={chosenTypes.has(t.id)}
							/>
							<span>{t.name}</span>
						</label>
					{/each}
				</div>
			{/if}
			{#if errors.ticketTypes}<small class="kv-error">{errors.ticketTypes}</small>{/if}
		</fieldset>
	{/if}
	<div class="kv-row">
		<button class="kv-btn" type="submit">{field ? 'Guardar cambios' : 'Agregar pregunta'}</button>
	</div>
	{#if field}
		<small class="kv-note">
			Las respuestas que ya llegaron quedan como se respondieron (con la pregunta como estaba).
		</small>
	{/if}
</form>

<style>
	.checks {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}
	.scope {
		border: 0;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-3xs);
	}
	.scope legend {
		font-weight: 700;
		margin-bottom: 0.2rem;
	}
	.types {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-3xs) var(--space-xs);
		padding-left: var(--space-m);
	}
</style>
