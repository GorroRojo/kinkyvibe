<script>
	/**
	 * Sección «📄 Texto» del formulario: el texto de la página en markdown, con CodeMirror. La
	 * misma al crear un evento (/admin/eventos/nuevo), al editar (PostEditor) y en ContentEditor.
	 * Con el slot `preview` (ContentEditor) muestra al lado una vista previa; en pantallas angostas,
	 * con botones «Editar / Vista previa».
	 *
	 * Props:
	 * - `value` (bind): el texto.
	 * - `legend`: el título de la tarjeta.
	 * - `id`: id del contenedor del editor (`ev-body` al crear).
	 * - Slot `hint`: la ayuda de formato (arriba del editor).
	 * - Slot `preview`: la vista previa (opcional).
	 */
	import CodeMirror from 'svelte-codemirror-editor';
	import { markdown } from '@codemirror/lang-markdown';

	export let value = '';
	export let legend = '📄 Texto de la página';
	/** @type {string | undefined} */
	export let id = undefined;

	const lang = markdown();
	const withPreview = Boolean($$slots.preview);
	/** @type {'editar'|'vista'} */
	let pane = 'editar';
</script>

<fieldset class="card body-card" id="sec-texto">
	<legend>{legend}</legend>
	{#if withPreview}
		<div class="panes-toggle" role="tablist" aria-label="Texto">
			<button
				type="button"
				role="tab"
				aria-selected={pane === 'editar'}
				on:click={() => (pane = 'editar')}>Editar</button
			>
			<button
				type="button"
				role="tab"
				aria-selected={pane === 'vista'}
				on:click={() => (pane = 'vista')}>Vista previa</button
			>
		</div>
	{/if}
	<div class="panes" class:with-preview={withPreview} data-pane={pane}>
		<div class="pane-edit">
			<p class="hint">
				<slot name="hint"
					>Formato: <code>## Título</code>, <code>- lista</code>, <code>**negrita**</code>.</slot
				>
			</p>
			<div class="editor" {id}>
				<CodeMirror lineWrapping tabSize={4} bind:value {lang} />
			</div>
		</div>
		{#if withPreview}
			<div class="pane-preview" aria-label="Vista previa">
				<slot name="preview" />
			</div>
		{/if}
	</div>
</fieldset>

<style lang="scss">
	.editor {
		border-radius: var(--radius-m);
		outline: 1px solid var(--line, var(--1-light));
		overflow: hidden;
		/* Con fallback para /edit (fuera del panel); en el panel valen los tokens (claro y oscuro). */
		:global(.cm-editor) {
			max-height: 40rem;
			min-height: 12rem;
			background: var(--surface, white);
			color: var(--text, #333);
		}
		:global(.cm-gutters) {
			background: var(--surface-2, #f5f5f5);
			color: var(--muted, inherit);
			border-color: var(--line, #ddd);
		}
	}
	.panes-toggle {
		display: none;
		gap: var(--space-3xs);
		button {
			border: 1px solid var(--line);
			background: var(--surface);
			border-radius: 2em;
			padding: 0.4rem var(--space-xs);
			font-weight: 700;
			cursor: pointer;
			min-height: 2.4rem;
		}
		button[aria-selected='true'] {
			background: var(--accent);
			color: var(--accent-ink);
			border-color: var(--accent);
		}
	}
	.panes.with-preview {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
		gap: var(--space-xs);
	}
	.pane-edit,
	.pane-preview {
		min-width: 0;
	}
	.pane-preview {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}
	@media (max-width: 1000px) {
		.panes-toggle {
			display: flex;
		}
		.panes.with-preview {
			grid-template-columns: minmax(0, 1fr);
		}
		.panes[data-pane='editar'] .pane-preview,
		.panes[data-pane='vista'] .pane-edit {
			display: none;
		}
	}
</style>
