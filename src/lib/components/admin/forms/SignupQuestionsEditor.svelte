<script>
	/**
	 * Las preguntas de inscripción con el editor compartido (QuestionEditor; interruptor
	 * `formularios`, docs/formularios.md): pestaña Preguntas de un evento y Eventos › Roles y
	 * preguntas. Se guarda la lista entera con su orden (`?/saveFields`,
	 * src/lib/server/personas/admin.js `saveFieldsAction`); los datos siguen en `signup_fields`.
	 * Si se sacan preguntas guardadas, pide confirmar (se recuperan desde Actividad).
	 *
	 * Props: `fields` (las preguntas guardadas), `types` (los tipos de entrada del evento; vacío en
	 * las generales), `form` (lo que devolvió la acción), `idPrefix`, `max`.
	 */
	import { enhance } from '$app/forms';
	import { askConfirm } from '$lib/admin/confirm.js';
	import Button from '$lib/components/ui/Button.svelte';
	import Notice from '$lib/components/ui/Notice.svelte';
	import { FIELD_KINDS } from '$lib/utils/signupFields.js';
	import QuestionEditor from './QuestionEditor.svelte';

	/** @type {import('$lib/utils/signupFields.js').SignupField[]} */
	export let fields = [];
	/** @type {{ id: string, name: string }[]} */
	export let types = [];
	/** @type {any} */
	export let form = null;
	export let idPrefix = 'inscripcion';
	export let max = 10;

	let dirty = false;
	let removed = 0;
	let saving = false;
	$: result = form?.fields ?? null;
</script>

<form
	class="kv-form signup-editor"
	method="POST"
	action="?/saveFields"
	use:enhance={async ({ cancel }) => {
		if (removed) {
			const ok = await askConfirm({
				title:
					removed === 1
						? '¿Borrar 1 pregunta guardada?'
						: `¿Borrar ${removed} preguntas guardadas?`,
				text: 'Las respuestas que ya había quedan en las órdenes. Si te equivocás, las recuperás desde Ajustes › Actividad.',
				confirmLabel: 'Guardar y borrar',
				tone: 'danger'
			});
			if (!ok) return cancel();
		}
		saving = true;
		return async ({ update }) => {
			await update({ reset: false });
			saving = false;
		};
	}}
>
	{#key fields}
		<QuestionEditor
			questions={fields}
			kinds={FIELD_KINDS}
			signup
			{types}
			{max}
			{idPrefix}
			errors={result && !result.ok ? (result.errors ?? {}) : {}}
			bind:dirty
			bind:removed
		/>
	{/key}
	<div class="kv-row save">
		<Button type="submit" busy={saving} disabled={saving}>Guardar preguntas</Button>
		{#if dirty}<span class="kv-note">Hay cambios sin guardar.</span>{/if}
	</div>
	{#if result?.message}
		<Notice tone={result.ok ? 'ok' : 'error'} compact>{result.message}</Notice>
	{/if}
	<small class="kv-note">
		Las respuestas que ya llegaron quedan como se respondieron (con la pregunta como estaba).
	</small>
</form>

<style>
	.signup-editor {
		display: flex;
		flex-direction: column;
		gap: var(--space-xs);
	}
	.save {
		align-items: center;
	}
</style>
