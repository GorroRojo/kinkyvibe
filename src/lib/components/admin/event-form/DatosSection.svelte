<script>
	/**
	 * Sección «📝 Datos» del formulario: la grilla de campos (FieldGrid) y Organizan / Autores
	 * (OrganizersField). La misma al crear un evento (/admin/eventos/nuevo), al editar una
	 * publicación (PostEditor) y en ContentEditor (material y amigues); los campos de cada caso
	 * salen de `datosFields` (`$lib/admin/postFields.js`) o de `fieldsFor` (contenido).
	 *
	 * Props:
	 * - `legend`: el título de la tarjeta.
	 * - `fields`, `values` (bind), `idFor`, `warnings`, `errors`: los de FieldGrid.
	 * - `hasAuthors`: mostrar Organizan / Autores; `authors` (bind), `profiles`, `authorUsage`,
	 *   `authorsLabel`, `authorsId`, `authorsHelpId`, `authorsHelp`: los de OrganizersField.
	 * - Slot `grid`: más campos al final de la grilla (la dirección de la página en ContentEditor).
	 * - Slot por defecto: al final de la tarjeta.
	 */
	import FieldGrid from './FieldGrid.svelte';
	import OrganizersField from './OrganizersField.svelte';

	export let legend = '📝 Datos';
	/** @type {import('$lib/admin/postFields.js').Field[]} */
	export let fields = [];
	/** @type {Record<string, any>} */
	export let values = {};
	/** @type {(key: string) => string} */
	export let idFor = (key) => `${key}-input`;
	/** @type {Record<string, string>} */
	export let warnings = {};
	/** @type {Record<string, string>} */
	export let errors = {};

	export let hasAuthors = true;
	/** @type {string[]} */
	export let authors = [];
	/** @type {any[]} */
	export let profiles = [];
	/** @type {Record<string, number>} */
	export let authorUsage = {};
	export let authorsLabel = 'Organizan';
	export let authorsId = 'authors-input';
	export let authorsHelpId = 'authors-help';
	export let authorsHelp =
		'Elegí de amigues (se enlaza su perfil) o escribí un nombre y elegí «Agregar».';
</script>

<fieldset class="card" id="sec-datos">
	<legend>{legend}</legend>
	<FieldGrid {fields} {idFor} {warnings} {errors} bind:values><slot name="grid" /></FieldGrid>
	{#if hasAuthors}
		<OrganizersField
			bind:authors
			{profiles}
			{authorUsage}
			label={authorsLabel}
			id={authorsId}
			helpId={authorsHelpId}>{authorsHelp}</OrganizersField
		>
	{/if}
	<slot />
</fieldset>
