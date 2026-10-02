<script>
	/**
	 * Sección «👥 Personas» del formulario (interruptor personas_eventos): quiénes participan y con
	 * qué rol, con PersonasEditor. Movida tal cual desde PostEditor.
	 *
	 * Props:
	 * - `personas` (bind): `{ perfil, rol }[]`.
	 * - `roles`, `profiles`: los de `data.personas`.
	 * - `errors`: los nuevos (lo que el archivo ya tenía mal no se muestra como error).
	 * - `idPrefix`: el de PersonasEditor.
	 */
	import PersonasEditor from '$lib/components/admin/PersonasEditor.svelte';

	/** @type {{ perfil: string, rol: string }[]} */
	export let personas = [];
	/** @type {string[]} */
	export let roles = [];
	/** @type {{ slug: string, title: string, kind: 'persona' | 'proyecto' }[]} */
	export let profiles = [];
	/** @type {string[]} */
	export let errors = [];
	export let idPrefix = 'edit-personas';
</script>

<fieldset class="card" id="sec-personas">
	<legend>👥 Personas</legend>
	<p class="hint">
		Quiénes participan y con qué rol. En la página se muestran con link a su perfil (solo los
		perfiles públicos).
	</p>
	<PersonasEditor bind:personas {roles} {profiles} {errors} {idPrefix} />
</fieldset>
