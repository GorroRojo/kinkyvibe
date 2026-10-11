<script>
	/**
	 * El título de una sección del formulario de eventos (y de ContentEditor): el mismo ícono de
	 * Lucide y el mismo nombre que la sección tiene en el índice (SectionIndex), los dos de
	 * `SECTION_LABELS` / `formSections` en `$lib/admin/eventForm.js` y `SECTION_ICONS`.
	 *
	 * Props:
	 * - `section`: la clave de la sección (`icon` en `formSections`: 'cuando', 'datos'…).
	 * - `as`: el elemento (`legend` por defecto, primer hijo de su `<fieldset class="card">`;
	 *   `h2` en una `<section>`).
	 * - `id`: opcional (por ejemplo, para un `aria-labelledby`).
	 */
	import { SECTION_LABELS } from '$lib/admin/eventForm.js';
	import { SECTION_ICONS } from './sectionIcons.js';

	/** @type {import('$lib/admin/eventForm.js').SectionIcon} */
	export let section;
	/** @type {'legend' | 'h2'} */
	export let as = 'legend';
	/** @type {string | undefined} */
	export let id = undefined;
</script>

<svelte:element this={as} class="section-heading" {id}
	><svelte:component this={SECTION_ICONS[section]} size="1em" aria-hidden="true" />
	{SECTION_LABELS[section]}</svelte:element
>

<style>
	.section-heading {
		display: flex;
		align-items: center;
		gap: var(--space-3xs);
	}
	/* el ícono, gris como en el índice */
	.section-heading > :global(svg) {
		flex: none;
		color: var(--muted);
	}
</style>
