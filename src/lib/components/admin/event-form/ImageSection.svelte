<script>
	/**
	 * Sección «🖼️ Imagen» del formulario: la miniatura, el botón para subir una imagen y el
	 * aviso de formatos. Lo que cambia entre crear y editar (qué imagen se usa, si es compartida,
	 * los eventos afectados, los botones de quitar o volver) lo pone cada página en los slots:
	 * `before` arriba del botón y el slot por defecto abajo. Movida desde /admin/eventos/nuevo y
	 * PostEditor, que tenían el mismo marco.
	 *
	 * Props:
	 * - `src`: la imagen a mostrar ('' = «Sin imagen»).
	 * - `inputId`; `form`: id del formulario del input, si no está adentro de uno.
	 * - `buttonText`; `maxImageBytes`; `error`: el de la imagen elegida.
	 * - `input` (bind): el `<input type="file">`, para vaciarlo.
	 * - Evento `change` del input.
	 */
	import { IMAGE_TYPES } from '$lib/utils/imageUpload.js';

	/** @type {string | undefined} */
	export let src = '';
	export let inputId = 'image';
	export let form = '';
	export let buttonText = 'Subir una imagen nueva';
	export let maxImageBytes = 0;
	export let error = '';
	/** @type {HTMLInputElement | undefined} */
	export let input = undefined;
</script>

<fieldset class="card" id="sec-imagen">
	<legend>🖼️ Imagen</legend>
	<div class="image-row">
		{#if src}
			<img {src} alt="Imagen del evento" class="thumb" />
		{:else}
			<div class="thumb empty">Sin imagen</div>
		{/if}
		<div class="image-actions">
			<slot name="before" />
			<label class="file">
				<span>{buttonText}</span>
				<input
					bind:this={input}
					type="file"
					name="image"
					form={form || undefined}
					id={inputId}
					accept={IMAGE_TYPES.join(',')}
					on:change
				/>
			</label>
			<small>JPG, PNG o WEBP, hasta {maxImageBytes / 1024 / 1024} MB. Mejor si es cuadrada.</small>
			<slot />
			{#if error}<p class="error">{error}</p>{/if}
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
	input[type='file'] {
		max-width: 100%;
		font-size: var(--step--1);
	}
	.image-actions :global(code) {
		overflow-wrap: anywhere;
	}
</style>
