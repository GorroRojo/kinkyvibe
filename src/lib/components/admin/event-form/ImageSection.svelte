<script>
	/**
	 * Sección «🖼️ Imagen» del formulario: la miniatura, el botón para subir una imagen, el aviso
	 * de formatos y el estado de la imagen elegida (`upload`: revisarla, la URL local de la
	 * miniatura y soltarla al cambiarla o al salir; ver `$lib/admin/imageState.js`). Queda solo para
	 * las fichas de amigues en ContentEditor (suben su imagen al repo); lo demás usa la biblioteca
	 * (ImagePicker, docs/imagenes.md). Lo propio de quien la usa va en los slots: `before` arriba
	 * del botón y el slot por defecto abajo; `formats` reemplaza el aviso de formatos.
	 *
	 * Props:
	 * - `upload` (bind): la imagen elegida (`{ url, name, ext, error }`).
	 * - `src`: la imagen a mostrar ('' = «Sin imagen»).
	 * - `alt`, `inputId`; `form`: id del formulario del input, si no está adentro de uno.
	 * - `buttonText`; `maxImageBytes`.
	 * - Evento `chosen`: se eligió una imagen que sirve.
	 * - `resetInput()`: vacía el `<input type="file">`; `clear()`: además suelta la imagen elegida
	 *   («No cambiar la imagen»).
	 */
	import { createEventDispatcher, onDestroy } from 'svelte';
	import { IMAGE_TYPES } from '$lib/utils/imageUpload.js';
	import { chooseImage, clearImage, emptyUpload } from '$lib/admin/imageState.js';

	/** @type {import('$lib/admin/imageState.js').Upload} */
	export let upload = emptyUpload();
	/** @type {string | null | undefined} */
	export let src = '';
	export let alt = 'Imagen del evento';
	export let inputId = 'image';
	export let form = '';
	export let buttonText = 'Subir una imagen nueva';
	export let maxImageBytes = 0;

	/** @type {HTMLInputElement | undefined} */
	let input;
	const dispatch = createEventDispatcher();

	/** @param {Event} e */
	function onChange(e) {
		const file = /** @type {HTMLInputElement} */ (e.currentTarget).files?.[0];
		const r = chooseImage(upload, file, maxImageBytes);
		upload = r.upload;
		if (r.clearInput) resetInput();
		if (r.chosen) dispatch('chosen');
	}
	export function resetInput() {
		if (input) input.value = '';
	}
	export function clear() {
		resetInput();
		upload = clearImage(upload);
	}
	onDestroy(() => upload.url && URL.revokeObjectURL(upload.url));
</script>

<fieldset class="card" id="sec-imagen">
	<legend>🖼️ Imagen</legend>
	<div class="image-row">
		{#if src}
			<img {src} {alt} class="thumb" />
		{:else}
			<div class="thumb empty">Sin imagen</div>
		{/if}
		<div class="image-actions">
			<slot name="before" />
			<!-- El input nativo dice «Choose File» en el idioma del navegador: queda escondido (pero
			     se enfoca con el teclado y abre con Enter o Espacio) y se ve el botón en castellano. -->
			<label class="file" for={inputId}>
				<span>{buttonText}</span>
				<input
					bind:this={input}
					class="file-input"
					type="file"
					name="image"
					form={form || undefined}
					id={inputId}
					accept={IMAGE_TYPES.join(',')}
					aria-describedby="{inputId}-name"
					on:change={onChange}
				/>
				<span class="file-button" aria-hidden="true">Elegir archivo</span>
			</label>
			<small class="file-name" id="{inputId}-name"
				>{upload.name ? `Elegiste: ${upload.name}` : 'Ningún archivo elegido'}</small
			>
			<small
				><slot name="formats"
					>JPG, PNG o WEBP, hasta {maxImageBytes / 1024 / 1024} MB. Mejor si es cuadrada.</slot
				></small
			>
			<slot />
			{#if upload.error}<p class="error">{upload.error}</p>{/if}
		</div>
	</div>
</fieldset>

<style>
	.image-row {
		display: flex;
		gap: 1em;
		align-items: flex-start;
		flex-wrap: wrap;
	}
	.thumb {
		width: 8em;
		height: 8em;
		object-fit: cover;
		border-radius: 1em;
	}
	.thumb.empty {
		display: grid;
		place-items: center;
		background: var(--surface-2, #f3eef6);
		font-size: var(--step--1);
	}
	.image-actions {
		display: flex;
		flex-direction: column;
		gap: 0.4em;
		align-items: flex-start;
		flex: 1 1 14em;
		min-width: 0;
	}
	.file {
		position: relative;
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.4em 0.8em;
		cursor: pointer;
	}
	/* Escondido a la vista, no a los lectores de pantalla ni al teclado. */
	.file-input {
		position: absolute;
		width: 1px;
		height: 1px;
		opacity: 0;
		overflow: hidden;
		clip: rect(0 0 0 0);
		white-space: nowrap;
	}
	.file-button {
		display: inline-flex;
		align-items: center;
		min-height: 2.5rem;
		padding: 0.35em 1.1em;
		border: 2px solid var(--accent, var(--1));
		border-radius: 2em;
		background: var(--surface, white);
		color: var(--accent-dark, var(--1-dark));
		font-weight: 700;
		white-space: nowrap;
	}
	.file:hover .file-button {
		background: color-mix(in srgb, var(--accent, var(--1)) 10%, var(--surface, white));
	}
	.file-input:focus-visible + .file-button {
		outline: 2px solid var(--link, var(--2));
		outline-offset: 2px;
	}
	.file-name {
		overflow-wrap: anywhere;
	}
	.image-actions :global(code) {
		overflow-wrap: anywhere;
	}
</style>
