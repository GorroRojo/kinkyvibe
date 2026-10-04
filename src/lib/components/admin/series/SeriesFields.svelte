<script>
	/**
	 * Los campos de una serie en Eventos → Series, para «Crear serie» y para «Editar».
	 * Props:
	 * - `mode`: 'create' (pide el nombre con el que la nombran los eventos) o 'edit' (el nombre de
	 *   la etiqueta, que se puede renombrar como en Etiquetas, el nombre visible, el ícono, la
	 *   imagen y la descripción);
	 * - `values`: lo que ya tiene (o lo que se escribió antes de un error); en 'edit', `id` es el
	 *   nombre de la etiqueta ahora y `key` el que se escribió;
	 * - `dbMode`: siempre `true` hoy (las etiquetas están en la base; cambia qué se puede elegir al
	 *   renombrar);
	 * - `assets`: las imágenes de src/lib/assets para elegir;
	 * - `parents` (solo 'create'): las series que pueden ser madre de la nueva (serie hija: una por
	 *   año, una edición especial). Vacío = no se pregunta;
	 * - `id`: prefijo único para los ids de los campos.
	 */
	import RenameChoice from '$lib/components/admin/tags/RenameChoice.svelte';
	import { eventImageRef } from '$lib/utils/series.js';

	/** @type {'create' | 'edit'} */
	export let mode = 'create';
	/** @type {{ id?: string, key?: string, keepAlias?: string, name?: string, visible_name?: string, icon?: string, image?: string, description?: string, parent?: string }} */
	export let values = {};
	/** @type {readonly string[]} */
	export let assets = [];
	/** @type {readonly { id: string, name: string, icon?: string }[]} */
	export let parents = [];
	/**
	 * La imagen se elige con el selector de imágenes (docs/imagenes.md), afuera de estos campos: acá
	 * solo queda la imagen vieja (`image`) tal cual, o vacía si se eligió o se sacó una en el
	 * selector (`clearLegacy`).
	 */
	export let library = false;
	export let clearLegacy = false;
	export let dbMode = false;
	export let id = 'serie';
	$: imageMissing = Boolean(values.image) && !assets.includes(values.image ?? '');
	// La imagen de un evento (calendario:<evento>/<archivo>): se conserva si no se cambia.
	$: eventImage = eventImageRef(values.image);
	let key = values.key ?? values.id ?? '';
	// Como en Etiquetas: con la base, por defecto sin alias (se renombra en las publicaciones).
	let keepAlias = values.keepAlias !== undefined ? values.keepAlias === '1' : !dbMode;
	$: renaming = mode === 'edit' && key.trim() !== '' && key.trim() !== (values.id ?? '');
</script>

{#if mode === 'create'}
	<label class="kv-field" for="{id}-name">
		<span>Nombre</span>
		<input id="{id}-name" name="name" required maxlength="60" value={values.name ?? ''} />
		<small class="muted">Es la etiqueta que les vas a poner a sus eventos.</small>
	</label>
	{#if parents.length}
		<label class="kv-field" for="{id}-parent">
			<span>¿Va dentro de otra serie? (opcional)</span>
			<select id="{id}-parent" name="parent" value={values.parent ?? ''}>
				<option value="">No, es una serie aparte</option>
				{#each parents as p (p.id)}<option value={p.id}>{p.icon ? `${p.icon} ` : ''}{p.name}</option
					>{/each}
			</select>
			<small class="muted">
				Para una edición especial (como «Picantearla: Deluxe»). Sus eventos llevan las dos
				etiquetas: la de esta serie y la de la madre.
			</small>
		</label>
	{/if}
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
{#if library}
	<input type="hidden" name="image" value={clearLegacy ? '' : (values.image ?? '')} />
{:else}
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
{/if}
<label class="kv-field" for="{id}-description">
	<span>Descripción (opcional)</span>
	<textarea id="{id}-description" name="description" rows="3" maxlength="2000"
		>{values.description ?? ''}</textarea
	>
	<small class="muted">Se ve en la página de la serie y en la Kinkipedia.</small>
</label>
