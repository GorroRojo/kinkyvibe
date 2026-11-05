<script>
	/**
	 * El editor de preguntas compartido (docs/formularios.md): lo usan los formularios (Comunidad ›
	 * Formularios, la encuesta de cada evento) y las preguntas de inscripción (pestaña Preguntas de
	 * un evento y Eventos › Roles y preguntas). Una tarjeta por pregunta con su texto, tipo, opciones,
	 * ayuda y si es obligatoria; ↑ ↓ para cambiar el orden (y arrastrar en la compu), «Duplicar» y
	 * «Sacar». Al lado (abajo en el celu), la vista previa como la ve quien responde.
	 *
	 * Va dentro del `<form>` de quien lo usa: manda la lista entera, en su orden, como JSON en el
	 * campo `name` (las cuentas, en $lib/admin/questionEditor.js). Solo usa las piezas del panel
	 * (`Field`, `Segmented`, `Checkbox`, `Button`), nunca inputs a mano.
	 *
	 * Props: `questions` (las guardadas), `kinds` (los tipos que se ofrecen; las de inscripción no
	 * tienen puntaje), `signup` (preguntas de inscripción: «una vez por entrada» y a qué entradas
	 * aplica), `types` (los tipos de entrada del evento), `errors` (por posición, lo que devolvió el
	 * servidor), `name`, `max`, `dirty` (bind: hay cambios sin guardar), `removed` (bind: cuántas
	 * preguntas guardadas se sacaron).
	 */
	import { tick } from 'svelte';
	import { ArrowDown, ArrowUp, Copy, GripVertical, Plus, Trash2 } from '@lucide/svelte';
	import Badge from '$lib/components/ui/Badge.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Checkbox from '$lib/components/ui/Checkbox.svelte';
	import Field from '$lib/components/ui/Field.svelte';
	import Segmented from '$lib/components/ui/Segmented.svelte';
	import FormQuestions from '$lib/components/formularios/FormQuestions.svelte';
	import {
		blankItem,
		duplicateItem,
		moveItem,
		previewQuestions,
		toEditorItems,
		toPayload
	} from '$lib/admin/questionEditor.js';
	import {
		MAX_OPTIONS,
		MAX_QUESTIONS,
		QUESTION_KINDS,
		QUESTION_KIND_LABELS
	} from '$lib/utils/formularios.js';

	/** @type {readonly Record<string, any>[]} */
	export let questions = [];
	/** @type {readonly string[]} */
	export let kinds = QUESTION_KINDS;
	export let signup = false;
	/** @type {{ id: string, name: string }[]} */
	export let types = [];
	/** @type {Record<number, Record<string, string>>} */
	export let errors = {};
	export let name = 'questions';
	export let max = MAX_QUESTIONS;
	export let dirty = false;
	export let removed = 0;
	export let idPrefix = 'preguntas';

	let items = toEditorItems(questions);
	const initial = JSON.stringify(toPayload(items, { signup }));
	const savedIds = new Set(items.map((q) => q.id).filter((id) => id !== null));

	$: payload = JSON.stringify(toPayload(items, { signup }));
	$: dirty = payload !== initial;
	$: removed = [...savedIds].filter((id) => !items.some((q) => q.id === id)).length;
	/** @type {Record<string, string>} */
	const KIND_LABELS = QUESTION_KIND_LABELS;
	$: kindOptions = kinds.map((k) => ({ value: k, label: KIND_LABELS[k] ?? k }));
	$: preview = previewQuestions(items.filter((q) => q.label.trim()));

	/** Lo que anuncia el lector de pantalla después de mover. */
	let status = '';

	/**
	 * @param {number} from
	 * @param {number} to
	 * @param {string} [focus] qué botón vuelve a tener el foco (`up` / `down`)
	 */
	async function move(from, to, focus) {
		if (to < 0 || to >= items.length) return;
		const key = items[from].key;
		items = moveItem(items, from, to);
		status = `Pregunta movida al lugar ${to + 1} de ${items.length}.`;
		if (!focus) return;
		await tick();
		// ↑ y ↓ son los dos primeros botones de la tarjeta; si el que se tocó quedó apagado (la
		// pregunta llegó arriba o abajo de todo), el otro.
		const buttons = /** @type {HTMLButtonElement[]} */ ([
			...(document.querySelectorAll(`[data-question="${key}"] .q-actions button`) ?? [])
		]).slice(0, 2);
		const [up, down] = buttons;
		const wanted = focus === 'up' ? up : down;
		(wanted && !wanted.disabled ? wanted : buttons.find((b) => !b.disabled))?.focus();
	}

	async function add() {
		const item = blankItem();
		items = [...items, item];
		await tick();
		document.getElementById(`${idPrefix}-${item.key}-label`)?.focus();
	}

	/** @param {number} i */
	function duplicate(i) {
		items = duplicateItem(items, i);
		status = `Pregunta duplicada: la copia quedó en el lugar ${i + 2}.`;
	}

	/** @param {number} i */
	function remove(i) {
		const label = items[i].label || 'sin texto';
		items = items.filter((_, n) => n !== i);
		status = `Sacaste la pregunta «${label}».`;
	}

	/** @param {number} i @param {string} typeId @param {boolean} on */
	function toggleType(i, typeId, on) {
		const set = new Set(items[i].ticketTypes);
		if (on) set.add(typeId);
		else set.delete(typeId);
		items[i].ticketTypes = types.map((t) => t.id).filter((id) => set.has(id));
	}

	// Arrastrar (en la compu; en el celu, ↑ ↓).
	/** @type {number | null} */
	let dragFrom = null;
	/** @type {number | null} */
	let dragOver = null;
	/** @param {DragEvent} e @param {number} i */
	function onDragStart(e, i) {
		dragFrom = i;
		e.dataTransfer?.setData('text/plain', String(i));
		if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
	}
	/** @param {DragEvent} e @param {number} i */
	function onDragOver(e, i) {
		if (dragFrom === null) return;
		e.preventDefault();
		dragOver = i;
	}
	/** @param {DragEvent} e @param {number} i */
	function onDrop(e, i) {
		e.preventDefault();
		if (dragFrom !== null) move(dragFrom, i);
		dragFrom = dragOver = null;
	}
	const scopeOptions = [
		{ value: 'all', label: 'Todas' },
		{ value: 'some', label: 'Algunas' }
	];
</script>

<div class="q-editor">
	<input type="hidden" {name} value={payload} />
	<div class="q-list">
		{#if items.length === 0}
			<p class="kv-note">Todavía no hay preguntas.</p>
		{/if}
		<ol>
			{#each items as q, i (q.key)}
				{@const err = errors[i] ?? {}}
				<li
					class="q-card"
					class:over={dragOver === i && dragFrom !== i}
					data-question={q.key}
					on:dragover={(e) => onDragOver(e, i)}
					on:drop={(e) => onDrop(e, i)}
				>
					<div class="q-head">
						<span
							class="grip"
							draggable="true"
							title="Arrastrá para cambiar el orden"
							aria-hidden="true"
							on:dragstart={(e) => onDragStart(e, i)}
							on:dragend={() => (dragFrom = dragOver = null)}><GripVertical size={18} /></span
						>
						<strong class="num">Pregunta {i + 1}</strong>
						{#if q.required}<Badge tone="info">obligatoria</Badge>{/if}
						<span class="q-actions">
							<Button
								variant="secondary"
								size="small"
								iconOnly
								icon={ArrowUp}
								label="Subir la pregunta {i + 1}"
								disabled={i === 0}
								on:click={() => move(i, i - 1, 'up')}
							/>
							<Button
								variant="secondary"
								size="small"
								iconOnly
								icon={ArrowDown}
								label="Bajar la pregunta {i + 1}"
								disabled={i === items.length - 1}
								on:click={() => move(i, i + 1, 'down')}
							/>
							<Button
								variant="secondary"
								size="small"
								iconOnly
								icon={Copy}
								label="Duplicar la pregunta {i + 1}"
								disabled={items.length >= max}
								on:click={() => duplicate(i)}
							/>
							<Button
								variant="danger"
								size="small"
								iconOnly
								icon={Trash2}
								label="Sacar la pregunta {i + 1}"
								on:click={() => remove(i)}
							/>
						</span>
					</div>
					<Field
						id="{idPrefix}-{q.key}-label"
						label="Pregunta"
						bind:value={q.label}
						placeholder="Ej.: ¿Qué te gustó?"
						error={err.label ?? ''}
					/>
					<div class="kind">
						<span class="kv-label">Tipo</span>
						<Segmented
							options={kindOptions}
							bind:value={q.kind}
							label="Tipo de la pregunta {i + 1}"
						/>
						{#if err.kind}<small class="kv-error">{err.kind}</small>{/if}
					</div>
					{#if q.kind === 'choice'}
						<Field
							type="textarea"
							rows={4}
							label="Opciones (una por renglón, hasta {MAX_OPTIONS})"
							bind:value={q.optionsText}
							error={err.options ?? ''}
						/>
					{:else if q.kind === 'rating'}
						<div class="kv-grid-2">
							<Field label="Qué quiere decir 1" placeholder="Mal" bind:value={q.low} />
							<Field label="Qué quiere decir 5" placeholder="Re bien" bind:value={q.high} />
						</div>
						{#if err.scale}<small class="kv-error">{err.scale}</small>{/if}
					{/if}
					{#if !signup}
						<Field
							label="Ayuda (opcional)"
							help="Una línea gris debajo de la pregunta."
							bind:value={q.help}
							error={err.help ?? ''}
						/>
					{/if}
					<div class="checks">
						<Checkbox bind:checked={q.required} label="Obligatoria" />
						{#if signup}
							<Checkbox
								bind:checked={q.perTicket}
								label="Una vez por entrada (si compran 3, responden 3 veces)"
							/>
						{/if}
					</div>
					{#if signup && types.length > 1}
						<div class="kind">
							<span class="kv-label">¿A qué entradas aplica?</span>
							<Segmented
								options={scopeOptions}
								bind:value={q.scope}
								label="A qué entradas aplica la pregunta {i + 1}"
							/>
							{#if q.scope === 'some'}
								<div class="types">
									{#each types as t (t.id)}
										<Checkbox
											checked={q.ticketTypes.includes(t.id)}
											label={t.name}
											on:change={(e) =>
												toggleType(i, t.id, /** @type {HTMLInputElement} */ (e.target).checked)}
										/>
									{/each}
								</div>
							{/if}
							{#if err.ticketTypes}<small class="kv-error">{err.ticketTypes}</small>{/if}
						</div>
					{/if}
				</li>
			{/each}
		</ol>
		{#if items.length < max}
			<Button variant="secondary" icon={Plus} on:click={add}>Agregar una pregunta</Button>
		{:else}
			<p class="kv-note">Llegaste al máximo: {max} preguntas.</p>
		{/if}
		<p class="visually-hidden" role="status" aria-live="polite">{status}</p>
	</div>
	<aside class="q-preview" aria-label="Vista previa">
		<h3>Vista previa</h3>
		<p class="kv-note">Así lo ve quien responde.</p>
		<div class="preview-box">
			{#if preview.length}
				<FormQuestions questions={preview} preview idPrefix="{idPrefix}-vista" />
			{:else}
				<p class="kv-note">Escribí una pregunta para verla acá.</p>
			{/if}
		</div>
	</aside>
</div>

<style>
	.q-editor {
		display: grid;
		gap: var(--space-s);
		min-width: 0;
	}
	@media (min-width: 1100px) {
		.q-editor {
			grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr);
			align-items: start;
		}
		.q-preview {
			position: sticky;
			top: var(--space-s);
		}
	}
	.q-list {
		display: flex;
		flex-direction: column;
		gap: var(--space-xs);
		align-items: flex-start;
		min-width: 0;
	}
	ol {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-xs);
		width: 100%;
	}
	.q-card {
		display: flex;
		flex-direction: column;
		gap: var(--space-2xs);
		padding: var(--space-xs);
		border: 1px solid var(--line);
		border-radius: var(--radius-m);
		background: var(--surface);
		min-width: 0;
	}
	.q-card.over {
		border-color: var(--accent);
		box-shadow: 0 0 0 2px var(--accent);
	}
	.q-head {
		display: flex;
		align-items: center;
		gap: var(--space-3xs);
		flex-wrap: wrap;
	}
	.grip {
		display: none;
		cursor: grab;
		color: var(--muted);
	}
	@media (hover: hover) and (pointer: fine) {
		.grip {
			display: inline-flex;
		}
	}
	.q-actions {
		margin-left: auto;
		display: inline-flex;
		gap: var(--space-3xs);
	}
	.kind {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
		align-items: flex-start;
		min-width: 0;
	}
	.kv-label {
		font-weight: 700;
	}
	.checks,
	.types {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-3xs) var(--space-xs);
	}
	.q-preview h3 {
		margin: 0;
		font-size: var(--text-sm);
	}
	.preview-box {
		margin-top: var(--space-2xs);
		padding: var(--space-xs);
		border: 1px dashed var(--line);
		border-radius: var(--radius-m);
		background: var(--bg);
	}
</style>
