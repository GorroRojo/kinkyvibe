<script>
	/**
	 * Formulario "Agregar pregunta" (texto, opciones o casilla; obligatoria u opcional). Lo usan
	 * Eventos › Roles y preguntas (generales) y la pestaña Preguntas de un evento. Manda a la
	 * acción `?/createField` (src/lib/server/personas/admin.js).
	 *
	 * Props: `form` (lo que devolvió la acción, para errores y valores), `idPrefix`.
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

	$: failed = form?.field && !form.field.ok ? form.field : null;
	$: errors = failed?.errors ?? {};
	let kind = 'text';
</script>

<form class="kv-form field-form" method="POST" action="?/createField" use:enhance>
	<label class="kv-field">
		<span>Pregunta</span>
		<input
			id="{idPrefix}-label"
			name="label"
			maxlength={LABEL_MAX}
			required
			value={failed?.values?.label ?? ''}
			placeholder="Ej: ¿Tenés alguna restricción alimentaria?"
			aria-invalid={errors.label ? 'true' : undefined}
		/>
		{#if errors.label}<small class="kv-error">{errors.label}</small>{/if}
	</label>
	<div class="kv-grid-2">
		<label class="kv-field">
			<span>Tipo</span>
			<select id="{idPrefix}-kind" name="kind" bind:value={kind}>
				{#each FIELD_KINDS as k (k)}<option value={k}>{FIELD_KIND_LABELS[k]}</option>{/each}
			</select>
			{#if errors.kind}<small class="kv-error">{errors.kind}</small>{/if}
		</label>
		<label class="kv-check">
			<input type="checkbox" name="required" />
			<span>Obligatoria</span>
		</label>
	</div>
	{#if kind === 'choice'}
		<label class="kv-field">
			<span>Opciones (una por renglón, hasta {MAX_OPTIONS})</span>
			<textarea
				id="{idPrefix}-options"
				name="options"
				rows="4"
				value={failed?.values?.options ?? ''}
				aria-invalid={errors.options ? 'true' : undefined}></textarea>
			{#if errors.options}<small class="kv-error">{errors.options}</small>{/if}
		</label>
	{/if}
	<div class="kv-row">
		<button class="kv-btn" type="submit">Agregar pregunta</button>
	</div>
</form>
