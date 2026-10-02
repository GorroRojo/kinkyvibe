<script>
	/**
	 * Sección «📝 Datos» del formulario: la grilla de campos (FieldGrid). La misma al crear un evento
	 * (/admin/eventos/nuevo), al editar una publicación (PostEditor) y en ContentEditor (material y
	 * amigues); los campos de cada caso salen de `datosFields` (`$lib/admin/postFields.js`) o de
	 * `fieldsFor` (contenido). Quiénes organizan o escriben ya no están acá: van con el resto de las
	 * personas en «👥 Personas» (PersonasSection).
	 *
	 * Props:
	 * - `legend`: el título de la tarjeta.
	 * - `fields`, `values` (bind), `idFor`, `warnings`, `errors`: los de FieldGrid.
	 * - Slot `grid`: más campos al final de la grilla (la dirección de la página en ContentEditor).
	 * - Slot por defecto: al final de la tarjeta.
	 */
	import FieldGrid from './FieldGrid.svelte';

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
</script>

<fieldset class="card" id="sec-datos">
	<legend>{legend}</legend>
	<FieldGrid {fields} {idFor} {warnings} {errors} bind:values><slot name="grid" /></FieldGrid>
	<slot />
</fieldset>
