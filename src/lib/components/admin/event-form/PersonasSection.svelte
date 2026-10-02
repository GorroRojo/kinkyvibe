<script>
	/**
	 * Sección «👥 Personas» del formulario: quiénes organizan (o escriben) y quiénes participan con
	 * otro rol, en una sola lista (PersonasField). Antes eran dos: «Organizan» en Datos y
	 * «Personas» (con el interruptor personas_eventos). La misma al crear un evento, al editar una
	 * publicación (PostEditor) y en ContentEditor (material).
	 *
	 * Props: los de PersonasField (`items` y `roles` con bind) y `helpId`. Sin el interruptor
	 * personas_eventos, `roles` es solo el rol de autores (`defaultRole`): no hay selector de rol ni
	 * perfiles de la base, como el viejo «Organizan».
	 */
	import PersonasField from './PersonasField.svelte';

	/** @type {import('$lib/utils/personasList.js').PersonaItem[]} */
	export let items = [];
	/** @type {string[]} */
	export let roles = [];
	export let defaultRole = 'Organiza';
	export let category = 'calendario';
	/** @type {import('$lib/utils/organizers.js').Profile[]} */
	export let profiles = [];
	/** @type {import('$lib/utils/personasPicker.js').DbProfile[]} */
	export let dbProfiles = [];
	/** @type {Record<string, number>} */
	export let authorUsage = {};
	export let addRoleAction = '';
	export let id = 'authors-input';
	export let helpId = 'authors-help';
	export let idPrefix = 'personas';
	/** @type {string[]} */
	export let errors = [];

	$: withRoles = roles.length > 1;
	$: who = category === 'calendario' ? 'quién organiza' : 'quién escribe';
</script>

<fieldset class="card" id="sec-personas">
	<legend>👥 Personas</legend>
	<label class="add-label" for={id}>Sumar persona</label>
	<PersonasField
		bind:items
		bind:roles
		{defaultRole}
		{category}
		{profiles}
		{dbProfiles}
		{authorUsage}
		{addRoleAction}
		{id}
		describedby={helpId}
		{idPrefix}
		{errors}
	/>
	<small id={helpId} class="help">
		{#if withRoles}
			Elegí de amigues o de Perfiles (se enlaza su perfil) o escribí un nombre y elegí «Agregar».
			Cada persona va con su rol: «{defaultRole}» es {who}. En la página se muestran con link a su
			perfil (solo los perfiles públicos).
		{:else}
			Elegí de amigues (se enlaza su perfil) o escribí un nombre y elegí «Agregar». Pueden ser
			varias personas o grupos.
		{/if}
	</small>
</fieldset>

<style>
	.add-label {
		display: block;
		font-weight: bold;
		margin-top: 0.4em;
	}
	.help {
		display: block;
		margin-top: 0.4em;
		opacity: 0.85;
	}
</style>
