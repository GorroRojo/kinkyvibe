<script>
	/**
	 * Sección «Etiquetas» del formulario: en los eventos, las reglas (KinkyVibe, idioma,
	 * lugar, precio) con EventTagRules y las demás con TagPicker; en otras publicaciones, solo
	 * TagPicker. Movida tal cual desde /admin/eventos/nuevo y PostEditor.
	 *
	 * Props:
	 * - `category`: la de la publicación (las reglas son solo de `calendario`).
	 * - `usage`: cuántas veces se usa cada etiqueta (`data.tagUsage`), para ordenar las opciones.
	 * - `tagRules` (bind): estado de EventTagRules; `freeTags` (bind): las otras etiquetas.
	 * - `errors`: los de EventTagRules.
	 * - `idPrefix`: el de EventTagRules (`ev` al crear, `edit` al editar).
	 * - `inputId`, `helpId`: ids del buscador y de su ayuda.
	 * - `placeholder`: el del buscador (sin pasarlo, el de TagPicker).
	 * - `label`: el del buscador (sin pasarlo, según la categoría).
	 * - Slot `before`: arriba del buscador (los botones rápidos de ContentEditor); slot `help`: la
	 *   ayuda del buscador.
	 */
	import SectionHeading from './SectionHeading.svelte';
	import EventTagRules from '$lib/components/admin/EventTagRules.svelte';
	import TagPicker from '$lib/components/admin/TagPicker.svelte';
	import { buildTagOptions, reservedPickerTags } from '$lib/utils/adminTags.js';

	export let category = 'calendario';
	/** @type {Record<string, number>} */
	export let usage = {};
	/** @type {any} */
	export let tagRules = {};
	/** @type {string[]} */
	export let freeTags = [];
	/** @type {string[]} */
	export let errors = [];
	export let idPrefix = 'ev';
	export let inputId = 'tags-input';
	export let helpId = 'tags-help';
	/** @type {string | undefined} */
	export let placeholder = undefined;
	/** @type {string | undefined} */
	export let label = undefined;

	const isEvent = category === 'calendario';
	const options = buildTagOptions({ category, usage });
	const reserved = reservedPickerTags(category);
</script>

<fieldset class="card" id="sec-etiquetas">
	<SectionHeading section="etiquetas" />
	{#if isEvent}
		<EventTagRules bind:state={tagRules} {errors} {idPrefix} />
	{/if}
	<slot name="before" />
	<div class="field-label">
		<label for={inputId}
			>{label ??
				(isEvent ? 'Otras etiquetas: tipo de evento, prácticas, temas…' : 'Etiquetas')}</label
		>
		<TagPicker
			bind:tags={freeTags}
			{options}
			{reserved}
			reservedHint="se elige con los botones de arriba (idioma, lugar, precio o Kinky Vibe)."
			id={inputId}
			{placeholder}
			describedby={helpId}
		/>
		<small id={helpId}
			><slot name="help"
				>Escribí para buscar (sin importar tildes). Si no existe, podés crearla, pero preferí las
				que ya existen: son las que se usan para filtrar.</slot
			></small
		>
	</div>
</fieldset>
