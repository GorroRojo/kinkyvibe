<script>
	/**
	 * Campo «Organizan» / «Autores» del formulario: OrganizerPicker con su etiqueta y su ayuda (la
	 * ayuda va en el slot). Movido tal cual desde /admin/eventos/nuevo y PostEditor.
	 *
	 * Props:
	 * - `authors` (bind): los nombres o slugs elegidos.
	 * - `profiles`, `authorUsage`: los de `data` (perfiles de amigues y cuánto se usa cada nombre).
	 * - `label`, `id`, `helpId`.
	 */
	import OrganizerPicker from '$lib/components/admin/OrganizerPicker.svelte';
	import { buildOrganizerOptions } from '$lib/utils/organizers.js';

	/** @type {string[]} */
	export let authors = [];
	/** @type {any[]} */
	export let profiles = [];
	/** @type {Record<string, number>} */
	export let authorUsage = {};
	export let label = 'Organizan';
	export let id = 'authors-input';
	export let helpId = 'authors-help';

	const options = buildOrganizerOptions(profiles, authorUsage);
</script>

<div class="field-label">
	<label for={id}>{label}</label>
	<OrganizerPicker bind:authors {profiles} {options} {id} describedby={helpId} />
	<small id={helpId}><slot /></small>
</div>
