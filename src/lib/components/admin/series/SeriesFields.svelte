<script>
	/**
	 * Los campos de una serie en Eventos → Series, para «Crear serie» y para «Editar».
	 * Props:
	 * - `mode`: 'create' (pide el nombre con el que la nombran los eventos) o 'edit' (el nombre de
	 *   la etiqueta, que se puede renombrar como en Etiquetas, el nombre visible, el ícono, la
	 *   imagen y la descripción); en los dos, la meta de venta por defecto de las ediciones nuevas
	 *   (SalesGoalField: `goal_kind` y `goal_value`);
	 * - `values`: lo que ya tiene (o lo que se escribió antes de un error); en 'edit', `id` es el
	 *   nombre de la etiqueta ahora y `key` el que se escribió;
	 * - `dbMode`: interruptor `etiquetas_db` (cambia qué se puede elegir al renombrar);
	 * - `assets`: las imágenes de src/lib/assets para elegir;
	 * - `id`: prefijo único para los ids de los campos.
	 */
	import RenameChoice from '$lib/components/admin/tags/RenameChoice.svelte';
	import { eventImageRef } from '$lib/utils/series.js';
	import { goalToForm } from '$lib/utils/salesGoal.js';
	import SalesGoalField from '$lib/components/admin/SalesGoalField.svelte';

	/** @type {'create' | 'edit'} */
	export let mode = 'create';
	/** @type {{ id?: string, key?: string, keepAlias?: string, name?: string, visible_name?: string, icon?: string, image?: string, description?: string, meta_venta?: string, goal_kind?: string, goal_value?: string }} */
	export let values = {};
	/** @type {readonly string[]} */
	export let assets = [];
	export let dbMode = false;
	export let id = 'serie';
	$: imageMissing = Boolean(values.image) && !assets.includes(values.image ?? '');
	// La imagen de un evento (calendario:<evento>/<archivo>): se conserva si no se cambia.
	$: eventImage = eventImageRef(values.image);
	let key = values.key ?? values.id ?? '';
	// Como en Etiquetas: con la base, por defecto sin alias (se renombra en las publicaciones).
	let keepAlias = values.keepAlias !== undefined ? values.keepAlias === '1' : !dbMode;
	// La meta: lo que se escribió antes de un error o, si no, la guardada.
	const savedGoal = goalToForm(values.meta_venta);
	/** @type {'' | 'plata' | 'entradas'} */
	let goalKind =
		values.goal_kind === 'plata' || values.goal_kind === 'entradas'
			? values.goal_kind
			: values.goal_kind === ''
				? ''
				: savedGoal.kind;
	let goalValue = values.goal_value !== undefined ? values.goal_value : savedGoal.value;
	$: renaming = mode === 'edit' && key.trim() !== '' && key.trim() !== (values.id ?? '');
</script>

{#if mode === 'create'}
	<label class="kv-field" for="{id}-name">
		<span>Nombre</span>
		<input id="{id}-name" name="name" required maxlength="60" value={values.name ?? ''} />
		<small class="muted">Es la etiqueta que les vas a poner a sus eventos.</small>
	</label>
{:else}
	<label class="kv-field" for="{id}-key">
		<span>Nombre de la etiqueta</span>
		<input id="{id}-key" name="key" required maxlength="60" bind:value={key} />
		<small class="muted">Es la etiqueta que llevan sus eventos. Cambiarlo es renombrarla.</small>
	</label>
	{#if renaming}
		<RenameChoice {dbMode} bind:keepAlias name="keepAlias" idPrefix="{id}-renombrar" />
	{:else}
		<input type="hidden" name="keepAlias" value={keepAlias ? '1' : ''} />
	{/if}
	<label class="kv-field" for="{id}-visible">
		<span>Nombre visible (opcional)</span>
		<input
			id="{id}-visible"
			name="visible_name"
			maxlength="100"
			value={values.visible_name ?? ''}
			placeholder="Igual que la etiqueta"
		/>
	</label>
	<label class="kv-field" for="{id}-icon">
		<span>Ícono (opcional)</span>
		<input
			id="{id}-icon"
			name="icon"
			maxlength="16"
			value={values.icon ?? ''}
			placeholder="Ej.: 🎭"
		/>
	</label>
{/if}
<label class="kv-field" for="{id}-image">
	<span>Imagen (opcional)</span>
	<select id="{id}-image" name="image" value={values.image ?? ''}>
		<option value="">Sin imagen</option>
		{#if imageMissing}<option value={values.image}>{values.image}</option>{/if}
		{#each assets as a (a)}<option value={a}>{a}</option>{/each}
	</select>
	<small class="muted">
		Un archivo de src/lib/assets.
		{#if eventImage}Ahora usa la imagen del evento «{eventImage.slug}».{/if}
	</small>
</label>
<label class="kv-field" for="{id}-description">
	<span>Descripción (opcional)</span>
	<textarea id="{id}-description" name="description" rows="3" maxlength="2000"
		>{values.description ?? ''}</textarea
	>
	<small class="muted">Se ve en la página de la serie y en la Kinkipedia.</small>
</label>
<SalesGoalField
	bind:kind={goalKind}
	bind:value={goalValue}
	idPrefix={id}
	named
	legend="Meta de venta por defecto (opcional)"
	help="La heredan las ediciones nuevas de la serie al cargarlas o duplicarlas (se copia: cambiarla después no toca los eventos que ya existen). Cada edición la puede cambiar en su sección Entradas."
/>
