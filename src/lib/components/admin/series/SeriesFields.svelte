<script>
	/**
	 * Los campos de una serie en Eventos → Series, para «Crear serie» y para «Editar».
	 * Props:
	 * - `mode`: 'create' (pide el nombre con el que la nombran los eventos) o 'edit' (pide el
	 *   nombre visible, el ícono, la imagen y la descripción; el nombre de la etiqueta no cambia acá);
	 * - `values`: lo que ya tiene (o lo que se escribió antes de un error);
	 * - `assets`: las imágenes de src/lib/assets para elegir;
	 * - `id`: prefijo único para los ids de los campos.
	 */
	/** @type {'create' | 'edit'} */
	export let mode = 'create';
	/** @type {{ name?: string, visible_name?: string, icon?: string, image?: string, description?: string }} */
	export let values = {};
	/** @type {readonly string[]} */
	export let assets = [];
	export let id = 'serie';
	$: imageMissing = Boolean(values.image) && !assets.includes(values.image ?? '');
</script>

{#if mode === 'create'}
	<label class="kv-field" for="{id}-name">
		<span>Nombre</span>
		<input id="{id}-name" name="name" required maxlength="60" value={values.name ?? ''} />
		<small class="muted">Es la etiqueta que les vas a poner a sus eventos.</small>
	</label>
{:else}
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
		<input id="{id}-icon" name="icon" maxlength="16" value={values.icon ?? ''} placeholder="🎭" />
	</label>
{/if}
<label class="kv-field" for="{id}-image">
	<span>Imagen (opcional)</span>
	<select id="{id}-image" name="image" value={values.image ?? ''}>
		<option value="">Sin imagen</option>
		{#if imageMissing}<option value={values.image}>{values.image}</option>{/if}
		{#each assets as a (a)}<option value={a}>{a}</option>{/each}
	</select>
	<small class="muted">Un archivo de src/lib/assets.</small>
</label>
<label class="kv-field" for="{id}-description">
	<span>Descripción (opcional)</span>
	<textarea id="{id}-description" name="description" rows="3" maxlength="2000"
		>{values.description ?? ''}</textarea
	>
	<small class="muted">Se ve en la página de la serie y en la Kinkipedia.</small>
</label>
