<script>
	/**
	 * Un arreglo de contenido de «Para revisar» que se resuelve ahí mismo (docs/panel.md,
	 * «Arreglos de contenido»; las filas las arma src/lib/server/admin/contentReview.js):
	 *
	 * - `item.altFix` («Fotos sin descripción»): la miniatura (grande; tocándola se ve entera, en
	 *   ImageViewer), el perfil y un campo para escribir qué se ve. Se guarda con `?/fotoAlt` (el
	 *   texto del perfil, con su historial y Actividad).
	 * - `item.shrink` («Portadas pesadas»): «Achicar» baja la imagen original de la biblioteca, la
	 *   pasa por el mismo achique de la subida (`prepareImage`, con tope de peso), la sube como imagen
	 *   nueva (`POST /imagenes`, con sus copias chicas) y cambia la portada con `?/portada`. La
	 *   original queda en la biblioteca. Solo si la copia pesa bastante menos (`muchLighter`: como
	 *   mucho 300 KB, o un 15 % menos); si no, no sube nada y lo dice. «Dejarla así»
	 *   (`?/portadaAsi`) la saca de la lista sin tocarla; el Inicio ofrece «Deshacer».
	 *
	 * Los campos y botones son las piezas del panel (`Field`, `Button`; formControls.test.js).
	 *
	 * Nunca escribe una descripción sola: si la imagen no tiene texto alternativo, lo pide antes de
	 * subir la copia.
	 */
	import { applyAction, deserialize, enhance } from '$app/forms';
	import { Maximize2 } from '@lucide/svelte';
	import Field from '$lib/components/ui/Field.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import ImageViewer from '$lib/components/admin/panel/ImageViewer.svelte';
	import { invalidateAll } from '$app/navigation';
	import {
		HEAVY_COVER_BYTES,
		appendCopies,
		kbText,
		muchLighter,
		prepareImage
	} from '$lib/utils/imageResize.js';
	import { ALT_MAX } from '$lib/utils/imageAlt.js';

	/** @type {import('$lib/server/admin/inicio.js').ReviewItem} */
	export let item;
	/** Lo que devolvió la última acción de la página (`form` del Inicio). */
	/** @type {any} */
	export let form = null;

	let alt = '';
	let busy = '';
	let error = '';
	/** Falta el texto alternativo de la copia (va debajo de su campo). */
	let altError = '';
	/** El texto alternativo de la copia, si la original no tiene. */
	let coverAlt = '';
	/** La imagen abierta en grande (ImageViewer). */
	let viewing = false;

	// Lo que salió bien lo dice la tarjeta (la fila se va); acá, solo lo que salió mal.
	$: result = form?.contentFix?.id === item.id && !form.contentFix.ok ? form.contentFix : null;
	$: inputId = `fix-${item.id}`;
	$: photoName = item.altFix ? `foto ${item.altFix.index + 1} de ${item.title}` : '';

	async function shrink() {
		const s = item.shrink;
		if (!s || busy) return;
		const description = (s.alt || coverAlt).trim();
		if (!description) {
			altError = 'Escribí qué se ve en la imagen: lo leen quienes usan lector de pantalla.';
			return;
		}
		altError = '';
		error = '';
		busy = 'Bajando la original…';
		try {
			const res = await fetch(s.url);
			if (!res.ok) throw new Error(String(res.status));
			const blob = await res.blob();
			const file = new File([blob], s.title || 'portada', { type: blob.type });
			busy = 'Achicando…';
			const prepared = await prepareImage(file, {}, { targetBytes: HEAVY_COVER_BYTES });
			if (!prepared.converted) {
				error = 'No se pudo hacer una copia más liviana en este navegador. Probá desde otro.';
				return;
			}
			if (!muchLighter(s.size, prepared.blob.size)) {
				// Ni con el lado más chico y la calidad más baja que permitimos alcanza: no se sube.
				const best = Math.min(prepared.blob.size, s.size);
				error = `No se pudo bajar de ${kbText(HEAVY_COVER_BYTES)} sin que se vea mal (queda en ${kbText(best, best === s.size ? undefined : s.size)}). Si se ve bien así, tocá «Dejarla así».`;
				return;
			}
			busy = 'Subiendo la copia…';
			const body = new FormData();
			body.set('file', prepared.blob, prepared.name);
			body.set('name', s.title || prepared.name);
			body.set('alt', description);
			if (prepared.width) body.set('width', String(prepared.width));
			if (prepared.height) body.set('height', String(prepared.height));
			appendCopies(body, prepared);
			const up = await fetch('/imagenes', { method: 'POST', body });
			const out = await up.json().catch(() => ({}));
			if (!up.ok || !out.image) {
				error = out.error || 'No se pudo subir la copia. Probá de nuevo.';
				return;
			}
			busy = 'Cambiando la portada…';
			const swap = new FormData();
			swap.set('item', item.id);
			swap.set('owner', String(s.ownerId));
			swap.set('old', String(s.imageId));
			swap.set('new', String(out.image.id));
			const r = await fetch('?/portada', {
				method: 'POST',
				body: swap,
				headers: { accept: 'application/json', 'x-sveltekit-action': 'true' }
			});
			const action = deserialize(await r.text());
			await applyAction(action);
			if (action.type === 'success') await invalidateAll();
		} catch {
			error = 'No se pudo achicar la portada. Revisá tu conexión y probá de nuevo.';
		} finally {
			busy = '';
		}
	}
</script>

{#if item.altFix}
	<form
		class="fix"
		method="POST"
		action="?/fotoAlt"
		use:enhance={() => {
			busy = 'Guardando…';
			return async ({ update, result: done }) => {
				await update({ reset: false });
				if (done.type === 'success') alt = '';
				busy = '';
			};
		}}
	>
		{#if item.altFix.thumb}
			<button
				type="button"
				class="thumb big"
				aria-haspopup="dialog"
				on:click={() => (viewing = true)}
				><img src={item.altFix.thumb} alt="" loading="lazy" decoding="async" /><span
					class="zoom"
					aria-hidden="true"><Maximize2 size={16} /></span
				><span class="visually-hidden">Ver grande la {photoName}</span></button
			>
			<ImageViewer bind:open={viewing} src={item.altFix.thumb} title={photoName} />
		{/if}
		<div class="grow">
			<span class="head"
				><b>{item.title}</b> · foto {item.altFix.index + 1}
				{#if item.href}<a href={item.href}>{item.action}</a>{/if}</span
			>
			<div class="row">
				<Field
					label="Qué se ve en la foto"
					name="alt"
					id={inputId}
					bind:value={alt}
					maxlength={ALT_MAX}
					required
					autocomplete="off"
					error={result && !result.ok ? result.message : ''}
				/>
				<Button type="submit" busy={Boolean(busy)} disabled={Boolean(busy) || !alt.trim()}
					>{busy || 'Guardar'}</Button
				>
			</div>
		</div>
		<input type="hidden" name="item" value={item.id} />
		<input type="hidden" name="profile" value={item.altFix.profileId} />
		<input type="hidden" name="index" value={item.altFix.index} />
		<input type="hidden" name="src" value={item.altFix.src} />
	</form>
{:else if item.shrink}
	<div class="fix">
		<button type="button" class="thumb" aria-haspopup="dialog" on:click={() => (viewing = true)}
			><img src={item.shrink.url} alt="" loading="lazy" decoding="async" /><span
				class="visually-hidden">Ver grande la portada de {item.title}</span
			></button
		>
		<ImageViewer
			bind:open={viewing}
			src={item.shrink.url}
			title="Portada de {item.title}"
			alt={item.shrink.alt}
		/>
		<div class="grow">
			<span class="head"
				><b>{item.title}</b> · <span class="size">{kbText(item.shrink.size)}</span>
				{#if item.href}<a href={item.href}>{item.action}</a>{/if}</span
			>
			<div class="row">
				{#if !item.shrink.alt}
					<Field
						label="Qué se ve en la imagen (para la copia)"
						bind:value={coverAlt}
						id={inputId}
						maxlength={ALT_MAX}
						autocomplete="off"
						error={altError}
					/>
				{/if}
				<Button variant="secondary" busy={Boolean(busy)} disabled={Boolean(busy)} on:click={shrink}
					>Achicar</Button
				>
				<form
					method="POST"
					action="?/portadaAsi"
					use:enhance={() => {
						error = '';
						busy = 'Guardando…';
						return async ({ update }) => {
							await update({ reset: false });
							busy = '';
						};
					}}
				>
					<input type="hidden" name="item" value={item.id} />
					<input type="hidden" name="image" value={item.shrink.imageId} />
					<input type="hidden" name="owner" value={item.shrink.ownerId} />
					<Button type="submit" variant="secondary" disabled={Boolean(busy)}>Dejarla así</Button>
				</form>
			</div>
			{#if error}<p class="kv-flash bad" role="alert">
					{error}
				</p>
			{:else if busy}<p class="kv-note" role="status">{busy}</p>
			{:else if result}<p class="kv-flash" class:bad={!result.ok} role="status">
					{result.message}
				</p>{/if}
		</div>
	</div>
{/if}

<style lang="scss">
	.fix {
		display: flex;
		gap: var(--space-xs);
		align-items: flex-start;
		flex: 1;
		min-width: 0;
	}
	.thumb {
		position: relative;
		flex: none;
		width: 4.5rem;
		height: 4.5rem;
		padding: 0;
		border: 0;
		border-radius: var(--radius-s);
		overflow: hidden;
		background: var(--line);
		cursor: zoom-in;
		&.big {
			width: 8rem;
			height: 8rem;
		}
		img {
			width: 100%;
			height: 100%;
			object-fit: cover;
			display: block;
		}
		.zoom {
			position: absolute;
			right: 0.3rem;
			bottom: 0.3rem;
			display: grid;
			place-items: center;
			width: 1.75rem;
			height: 1.75rem;
			border-radius: 50%;
			background: color-mix(in srgb, var(--surface) 88%, transparent);
			color: var(--text);
		}
		&:focus-visible {
			outline: 2px solid var(--focus-field);
			outline-offset: 2px;
		}
	}
	.grow {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-2xs);
		b {
			overflow-wrap: anywhere;
		}
		.size {
			white-space: nowrap;
		}
		.head a {
			margin-left: 0.3rem;
			font-size: 0.9em;
		}
	}
	.row {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2xs);
		align-items: flex-end;
		> :global(.kv-field) {
			flex: 1 1 14rem;
		}
	}
	// En el celu la miniatura va arriba, a todo el ancho de la fila, y el campo debajo.
	@media (max-width: 559.98px) {
		.fix:has(.thumb.big) {
			flex-direction: column;
			align-items: stretch;
		}
		.thumb.big {
			width: 100%;
			height: auto;
			aspect-ratio: 4 / 3;
		}
	}
</style>
