<script>
	/**
	 * El formulario de eventos en una sola página (crear, duplicar y editar), según lo que eligió
	 * gorrite (opciones 1B y 2B): todas las secciones en una página, con un índice de secciones
	 * (columna al costado en la compu, fila fija arriba en el celu), un solo botón para guardar al
	 * final (fijo abajo) y un borrador local que se guarda mientras se escribe.
	 *
	 * Lo usan /admin/eventos/nuevo y PostEditor (pestaña Editar de la ficha y /edit/...). Cada uno
	 * pone sus secciones adentro (las compartidas están en esta carpeta: TagsSection,
	 * OrganizersField, FieldGrid; Entradas es TicketsEditor). La barra de guardar es el elemento
	 * con la clase `bar sticky`.
	 *
	 * Borrador y aviso al salir: UnsavedChanges, ofreciendo «Recuperar / Descartar» en vez de
	 * recuperarlo solo, y diciendo qué secciones tiene distintas.
	 *
	 * Props:
	 * - `sections`: las del índice (`formSections` en `$lib/admin/eventForm.js`); con menos de dos,
	 *   no hay índice.
	 * - `draftKey`, `base`, `dirty`, `snapshot`, `restore`, `saved`, `saveForm`, `saving`: los de
	 *   UnsavedChanges (`base` es el sha del archivo: si cambió, pregunta antes de recuperar).
	 */
	import SectionIndex from './SectionIndex.svelte';
	import UnsavedChanges from '$lib/components/admin/panel/UnsavedChanges.svelte';
	import { changedKeys } from '$lib/admin/draft.js';
	import { draftSectionLabels } from '$lib/admin/eventForm.js';

	/** @type {import('$lib/admin/eventForm.js').FormSection[]} */
	export let sections = [];
	export let draftKey = '';
	export let base = '';
	export let dirty = false;
	/** @type {unknown} */
	export let snapshot = null;
	/** @type {(data: any) => void} */
	export let restore = () => {};
	export let saved = false;
	export let saveForm = '';
	export let saving = false;

	/** @param {unknown} draft @param {unknown} current */
	const describe = (draft, current) => draftSectionLabels(changedKeys(draft, current));

	$: withIndex = sections.length > 1;
</script>

<div class="event-form">
	<div class="layout" class:with-index={withIndex}>
		{#if withIndex}<SectionIndex {sections} />{/if}
		<div class="sections">
			<UnsavedChanges
				{draftKey}
				{base}
				{dirty}
				{snapshot}
				{restore}
				{saved}
				{saveForm}
				{saving}
				{describe}
				ask
			/>
			<slot />
		</div>
	</div>
</div>

<style>
	.event-form {
		container: event-form / inline-size;
	}
	.sections {
		min-width: 0;
	}
	/* Que la barra fija de arriba (y la fila del índice en el celu) no tape el título. */
	.sections :global(fieldset.card) {
		scroll-margin-top: calc(var(--form-sticky-top, 0px) + 4.5rem);
	}
	@container event-form (min-width: 48rem) {
		.layout.with-index {
			display: grid;
			grid-template-columns: 11.5rem minmax(0, 1fr);
			gap: 1.5rem;
			align-items: start;
		}
		.sections :global(fieldset.card) {
			scroll-margin-top: calc(var(--form-sticky-top, 0px) + 1rem);
		}
	}
	/* El único «Guardar»: fijo abajo mientras se edita. */
	.sections :global(.bar.sticky) {
		position: sticky;
		bottom: var(--form-sticky-bottom, 0px);
		z-index: 3;
		margin-inline: -0.5rem;
		padding: 0.6rem 0.5rem;
		background: var(--bg, #fff7fb);
		box-shadow: 0 -1px 0 var(--line, rgba(0, 0, 0, 0.08));
	}
</style>
