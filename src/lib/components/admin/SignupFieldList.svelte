<script>
	/**
	 * Lista de preguntas de inscripción con su CSV y el botón para borrar cada una (acción
	 * `?/deleteField`). La usan las preguntas generales (Ajustes) y las de un evento.
	 *
	 * Props: `fields` (SignupField[]), `csvName` (nombre del archivo), `empty` (texto sin
	 * preguntas), `canDelete` (default true).
	 */
	import { enhance } from '$app/forms';
	import Badge from '$lib/components/admin/panel/Badge.svelte';
	import CsvButton from '$lib/components/admin/panel/CsvButton.svelte';
	import { FIELD_CSV_COLUMNS, FIELD_KIND_LABELS } from '$lib/utils/signupFields.js';

	/** @type {import('$lib/utils/signupFields.js').SignupField[]} */
	export let fields = [];
	export let csvName = 'preguntas.csv';
	export let empty = 'Todavía no hay preguntas.';
	export let canDelete = true;
</script>

<div class="list-head">
	<span class="kv-note">{fields.length === 1 ? '1 pregunta' : `${fields.length} preguntas`}</span>
	<CsvButton rows={fields} columns={FIELD_CSV_COLUMNS} filename={csvName} />
</div>
{#if fields.length === 0}
	<p class="kv-note">{empty}</p>
{:else}
	<ul class="fields">
		{#each fields as f (f.id)}
			<li>
				<div class="what">
					<strong>{f.label}</strong>
					<span class="meta">
						<Badge tone="neutral">{FIELD_KIND_LABELS[f.kind]}</Badge>
						{#if f.required}<Badge tone="info">obligatoria</Badge>{/if}
					</span>
					{#if f.options.length}<small class="kv-note">{f.options.join(' · ')}</small>{/if}
				</div>
				{#if canDelete}
					<form method="POST" action="?/deleteField" use:enhance>
						<input type="hidden" name="id" value={f.id} />
						<button class="kv-btn ghost small" type="submit">Borrar</button>
					</form>
				{/if}
			</li>
		{/each}
	</ul>
{/if}

<style>
	.list-head {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 0.5rem;
		margin-bottom: 0.5rem;
	}
	.fields {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	li {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 0.8rem;
		padding: 0.6rem 0;
		border-top: 1px solid var(--line);
	}
	.what {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
		min-width: 0;
		overflow-wrap: anywhere;
	}
	.meta {
		display: flex;
		flex-wrap: wrap;
		gap: 0.3rem;
	}
</style>
