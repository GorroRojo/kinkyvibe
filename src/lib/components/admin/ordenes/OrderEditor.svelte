<script>
	/**
	 * «Editar» una compra (Ventas › Órdenes): quien compró (nombre, pronombres, mail), cada entrada
	 * (nombre y pronombres) y las respuestas, con los mismos campos que la compra: las preguntas
	 * van por SignupFieldInputs, así cada tipo de pregunta se edita como se responde. El servidor
	 * valida solo lo que cambió (`edit` en eventActions.js, $lib/server/admin/orderEdits.js); por
	 * eso el formulario va con `novalidate` (una obligatoria que se sumó después no frena).
	 *
	 * Props: `o` (la orden), `fields` (las preguntas del evento), `form` (el de la página: los
	 * errores de esta orden) y `onDone` (se guardó bien).
	 */
	import { enhance } from '$app/forms';
	import SignupFieldInputs from '$lib/components/SignupFieldInputs.svelte';
	import { announceResult } from '$lib/admin/announce.js';
	import { orderEditForm } from '$lib/admin/ordersView.js';

	/** @type {any} */
	export let o;
	/** @type {import('$lib/admin/ordersView.js').ViewField[]} */
	export let fields = [];
	/** @type {any} */
	export let form = null;
	export let onDone = () => {};

	$: edit = orderEditForm(o, fields);
	$: mine = form?.orderEdit?.order === o.id ? form.orderEdit : null;
	/** @type {Record<string, string>} */
	$: errors = mine && !mine.ok ? (mine.errors ?? {}) : {};
	$: id = `editar-${o.id}`;
	let saving = false;
	/** Nombre y pronombres: los mismos topes que la compra (ticketBuyer.js). */
	const PERSON = [
		{ key: 'name', label: 'Nombre', max: 80 },
		{ key: 'pronouns', label: 'Pronombres', max: 40 }
	];

	/** @type {import('@sveltejs/kit').SubmitFunction} */
	const submit = () => {
		saving = true;
		return async ({ result, update }) => {
			await update({ reset: false });
			announceResult(result, 'orderEdit');
			saving = false;
			if (result.type === 'success') onDone();
		};
	};
</script>

<form method="POST" action="?/edit" class="edit" novalidate use:enhance={submit}>
	<input type="hidden" name="order" value={o.id} />
	<input type="hidden" name="since" value={o.edits?.[0]?.id ?? 0} />
	<fieldset>
		<legend>Quien compró</legend>
		<div class="row">
			{#each PERSON as { key: name, label, max } (name)}
				<label>
					<span>{label}</span>
					<input
						class="kv-input"
						id="{id}-{name}"
						{name}
						value={edit.values[name] ?? ''}
						maxlength={max}
						autocomplete="off"
						aria-invalid={errors[name] ? 'true' : undefined}
					/>
					{#if errors[name]}<small class="error">{errors[name]}</small>{/if}
				</label>
			{/each}
			<label class="wide">
				<span>Mail</span>
				<input
					class="kv-input"
					id="{id}-email"
					type="email"
					name="email"
					value={edit.values.email ?? ''}
					maxlength="254"
					autocomplete="off"
					spellcheck="false"
					aria-invalid={errors.email ? 'true' : undefined}
				/>
				{#if errors.email}<small class="error">{errors.email}</small>{/if}
			</label>
		</div>
		<small class="note"
			>Cambiar el mail no manda nada: los links de las entradas siguen andando y los próximos avisos
			van al mail nuevo.</small
		>
		<SignupFieldInputs
			fields={edit.orderFields}
			values={edit.values}
			{errors}
			idPrefix="{id}-campo"
			legend=""
			hint={false}
		/>
	</fieldset>
	{#each o.holders as _, i (i)}
		<fieldset>
			<legend>Entrada {i + 1}</legend>
			<div class="row">
				{#each PERSON as { key, label, max } (key)}
					{@const name = `holder_${key}_${i}`}
					<label>
						<span>{label}</span>
						<input
							class="kv-input"
							id="{id}-{name}"
							{name}
							value={edit.values[name] ?? ''}
							maxlength={max}
							autocomplete="off"
							aria-invalid={errors[name] ? 'true' : undefined}
						/>
						{#if errors[name]}<small class="error">{errors[name]}</small>{/if}
					</label>
				{/each}
			</div>
			<SignupFieldInputs
				fields={edit.ticketFields}
				values={edit.values}
				{errors}
				idPrefix="{id}-campo"
				ticket={i}
				legend=""
				hint={false}
			/>
		</fieldset>
	{/each}
	<div class="buttons">
		<button type="submit" class="kv-btn small" disabled={saving} aria-busy={saving}
			>{saving ? 'Guardando…' : 'Guardar'}</button
		>
	</div>
</form>

<style>
	.edit {
		display: flex;
		flex-direction: column;
		gap: var(--space-2xs);
		margin-top: var(--space-2xs);
		padding: var(--space-2xs) var(--space-xs);
		border: 1px solid var(--line);
		border-radius: var(--radius-m);
		font-size: var(--text-sm);
	}
	fieldset {
		border: 0;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-2xs);
		min-width: 0;
	}
	fieldset + fieldset {
		border-top: 1px solid var(--line);
		padding-top: var(--space-2xs);
	}
	legend {
		font-weight: 700;
		padding: 0;
		margin-bottom: var(--space-3xs);
	}
	.row {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2xs);
	}
	label {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
		flex: 1 1 10rem;
		min-width: 0;
	}
	label.wide {
		flex-basis: 16rem;
	}
	label > span {
		font-weight: 700;
		font-size: var(--text-xs);
	}
	.note {
		color: var(--muted);
		font-size: var(--text-xs);
	}
	.error {
		color: var(--bad);
		font-weight: 700;
		margin: 0;
	}
	.buttons {
		display: flex;
		gap: var(--space-2xs);
	}
	.small {
		padding: var(--space-3xs) var(--space-s);
		font-size: var(--text-xs);
		min-height: 2.25rem;
	}
</style>
