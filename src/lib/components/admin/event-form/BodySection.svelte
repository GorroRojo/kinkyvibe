<script>
	/**
	 * Sección «Texto» del formulario: el texto de la página en markdown, con CodeMirror. La
	 * misma al crear un evento (/admin/eventos/nuevo), al editar (PostEditor) y en ContentEditor.
	 * CodeMirror (~150 KB comprimido) se baja recién cuando se monta la sección (`import()`), no con
	 * el resto del panel: mientras llega, el texto se ve tal cual en un recuadro del mismo tamaño
	 * («Cargando el editor…»), y en el servidor sale ese recuadro.
	 * Con el slot `preview` (ContentEditor) muestra al lado una vista previa; en pantallas angostas,
	 * con botones «Editar / Vista previa».
	 *
	 * Props:
	 * - `value` (bind): el texto.
	 * - El título es el de la sección en el índice (SectionHeading, `formSections`).
	 * - `id`: id del contenedor del editor (`ev-body` al crear).
	 * - Slot `hint`: la ayuda de formato (arriba del editor).
	 * - Slot `preview`: la vista previa (opcional).
	 */
	import { onMount, tick } from 'svelte';
	import SectionHeading from './SectionHeading.svelte';
	import { valueGuard } from './markdownEditorSync.js';

	export let value = '';
	/** @type {string | undefined} */
	export let id = undefined;

	/** Donde se monta CodeMirror. @type {HTMLDivElement | undefined} */
	let host;
	/** El editor, cuando llegó. @type {import('@codemirror/view').EditorView | null} */
	let view = null;
	/** @type {((view: any, value: string) => boolean) | null} */
	let syncDoc = null;
	let failed = false;
	// El eco: lo que manda el editor no vuelve a entrar como un cambio de afuera.
	const guard = valueGuard(value);

	onMount(() => {
		let destroyed = false;
		import('./markdownEditor.js')
			.then(async (m) => {
				if (destroyed) return;
				// Que el recuadro de «Cargando…» se vaya antes de crear el editor en su lugar.
				ready = true;
				await tick();
				if (destroyed || !host) return;
				syncDoc = m.syncDoc;
				guard.fromEditor(value);
				view = m.createMarkdownEditor(host, {
					doc: value,
					onChange(text) {
						guard.fromEditor(text);
						value = text;
					},
					onFail: fallBack
				});
			})
			.catch((e) => {
				console.error('[editor] no se pudo cargar CodeMirror:', e);
				failed = true;
			});
		return () => {
			destroyed = true;
			view?.destroy();
			view = null;
		};
	});

	/** CodeMirror se rompió: un campo común con el mismo texto, así se puede seguir. */
	function fallBack() {
		if (view) value = view.state.doc.toString();
		view?.destroy();
		view = null;
		failed = true;
	}

	/** El módulo llegó (se oculta «Cargando el editor…»). */
	let ready = false;

	// Un texto nuevo de afuera (recuperar un borrador): entra como un cambio, solo si es otro.
	$: if (view && syncDoc && guard.incoming(value)) syncDoc(view, value);

	const withPreview = Boolean($$slots.preview);
	/** @type {'editar'|'vista'} */
	let pane = 'editar';
	// Al volver a «Editar» (estaba con display: none), que mida de nuevo.
	$: if (pane === 'editar' && view) tick().then(() => view?.requestMeasure());
</script>

<fieldset class="card body-card" id="sec-texto">
	<SectionHeading section="texto" />
	{#if withPreview}
		<!-- Dos botones que se excluyen (aria-pressed): no son pestañas, que piden flechas y un tabpanel. -->
		<div class="panes-toggle" role="group" aria-label="Texto">
			<button type="button" aria-pressed={pane === 'editar'} on:click={() => (pane = 'editar')}
				>Editar</button
			>
			<button type="button" aria-pressed={pane === 'vista'} on:click={() => (pane = 'vista')}
				>Vista previa</button
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
				{#if failed}
					<!-- Sin CodeMirror (se cortó la conexión o se rompió): un campo común, así se puede seguir. -->
					<textarea class="editor-fallback" bind:value aria-label="Texto"></textarea>
				{:else if !ready}
					<div class="editor-loading">
						<span class="editor-loading-label" role="status">Cargando el editor…</span>
						<pre>{value}</pre>
					</div>
				{/if}
				<div class="cm-host" bind:this={host} hidden={failed || !ready}></div>
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
		/* Sin overflow: hidden acá: un ancestro recortado confunde a CodeMirror al calcular qué
		   líneas se ven y qué scrollear. Las esquinas las redondean el editor y su scroller. */
		/* Con fallback para /edit (fuera del panel); en el panel valen los tokens (claro y oscuro). */
		/* Alto: crece con el texto entre 12rem y 40rem; con más, scrollea adentro (.cm-scroller). */
		:global(.cm-editor) {
			max-height: 40rem;
			min-height: 12rem;
			border-radius: inherit;
			background: var(--surface, white);
			color: var(--text, #333);
		}
		/* Sin la línea punteada de CodeMirror al enfocar (como antes): el borde es el del recuadro. */
		:global(.cm-editor.cm-focused) {
			outline: none;
		}
		/* scroll-behavior: auto, a pesar del `* { scroll-behavior: smooth }` de style.scss:
		   CodeMirror mueve su scroll por código (para mostrar el cursor, o para que no salte el
		   texto cuando mide el alto de las líneas) y lee la posición enseguida. Con scroll suave,
		   lo que lee es una posición a mitad de camino: dibujaba las líneas equivocadas (el recuadro
		   arrancaba en la línea 10, con un hueco abajo), el cursor quedaba fuera de la vista y cada
		   cuadro de la animación lo hacía medir de nuevo. */
		:global(.cm-scroller) {
			overflow: auto;
			border-radius: inherit;
			scroll-behavior: auto;
		}
		:global(.cm-gutters) {
			background: var(--surface-2, #f5f5f5);
			color: var(--muted, inherit);
			border-color: var(--line, #ddd);
		}
	}
	.editor-loading,
	.editor-fallback {
		border-radius: inherit;
	}
	/* Mientras llega CodeMirror: el mismo recuadro (alto mínimo y máximo, fondo), con el texto. */
	.editor-loading,
	.editor-fallback {
		display: block;
		width: 100%;
		min-height: 12rem;
		max-height: 40rem;
		overflow: auto;
		margin: 0;
		border: 0;
		padding: var(--space-3xs) var(--space-xs);
		background: var(--surface, white);
		color: var(--text, #333);
	}
	.editor-loading pre {
		margin: 0;
		white-space: pre-wrap;
		overflow-wrap: anywhere;
		color: var(--muted, inherit);
	}
	.editor-loading-label {
		display: block;
		font-size: var(--text-xs);
		color: var(--muted, inherit);
		margin-bottom: var(--space-3xs);
	}
	.editor-fallback {
		font-family: monospace;
		resize: vertical;
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
		button[aria-pressed='true'] {
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
