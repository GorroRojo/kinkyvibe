<script>
	/**
	 * Un arreglo de contenido de «Para revisar» que se resuelve ahí mismo (docs/panel.md,
	 * «Arreglos de contenido»; las filas las arma src/lib/server/admin/contentReview.js):
	 *
	 * - `item.altFix` («Fotos sin descripción»): la miniatura, el perfil y un campo para escribir qué
	 *   se ve. Se guarda con `?/fotoAlt` (el texto del perfil, con su historial y Actividad).
	 * - `item.shrink` («Portadas pesadas»): «Achicar» baja la imagen original de la biblioteca, la
	 *   pasa por el mismo achique de la subida (`prepareImage`, con tope de peso), la sube como imagen
	 *   nueva (`POST /imagenes`, con sus copias chicas) y cambia la portada con `?/portada`. La
	 *   original queda en la biblioteca.
	 *
	 * Nunca escribe una descripción sola: si la imagen no tiene texto alternativo, lo pide antes de
	 * subir la copia.
	 */
	import { applyAction, deserialize, enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { HEAVY_COVER_BYTES, appendCopies, prepareImage } from '$lib/utils/imageResize.js';
	import { ALT_MAX } from '$lib/utils/imageAlt.js';

	/** @type {import('$lib/server/admin/inicio.js').ReviewItem} */
	export let item;
	/** Lo que devolvió la última acción de la página (`form` del Inicio). */
	/** @type {any} */
	export let form = null;

	let alt = '';
	let busy = '';
	let error = '';
	/** El texto alternativo de la copia, si la original no tiene. */
	let coverAlt = '';

	// Lo que salió bien lo dice la tarjeta (la fila se va); acá, solo lo que salió mal.
	$: result = form?.contentFix?.id === item.id && !form.contentFix.ok ? form.contentFix : null;
	$: inputId = `fix-${item.id}`;

	/** @param {number} bytes */
	const kb = (bytes) => `${Math.round(bytes / 1024)} KB`;

	async function shrink() {
		const s = item.shrink;
		if (!s || busy) return;
		const description = (s.alt || coverAlt).trim();
		if (!description) {
			error = 'Escribí qué se ve en la imagen: lo leen quienes usan lector de pantalla.';
			return;
		}
		error = '';
		busy = 'Bajando la original…';
		try {
			const res = await fetch(s.url);
			if (!res.ok) throw new Error(String(res.status));
			const blob = await res.blob();
			const file = new File([blob], s.title || 'portada', { type: blob.type });
			busy = 'Achicando…';
			const prepared = await prepareImage(file, {}, { targetBytes: HEAVY_COVER_BYTES });
			if (!prepared.converted || prepared.blob.size >= s.size) {
				error = 'No se pudo hacer una copia más liviana en este navegador. Probá desde otro.';
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
			<a href={item.altFix.thumb} target="_blank" rel="noreferrer" class="thumb"
				><img src={item.altFix.thumb} alt="" loading="lazy" decoding="async" /><span
					class="visually-hidden"
					>Abrir la foto {item.altFix.index + 1} de {item.title} en otra pestaña</span
				></a
			>
		{/if}
		<div class="grow">
			<label for={inputId}
				><b>{item.title}</b> · foto {item.altFix.index + 1}
				{#if item.href}<a href={item.href}>{item.action}</a>{/if}</label
			>
			<div class="row">
				<input
					id={inputId}
					name="alt"
					bind:value={alt}
					maxlength={ALT_MAX}
					required
					placeholder="Qué se ve en la foto"
					autocomplete="off"
				/>
				<button class="kv-btn sm" disabled={Boolean(busy) || !alt.trim()}
					>{busy || 'Guardar'}</button
				>
			</div>
			{#if result}<small class:bad={!result.ok} role="status">{result.message}</small>{/if}
		</div>
		<input type="hidden" name="item" value={item.id} />
		<input type="hidden" name="profile" value={item.altFix.profileId} />
		<input type="hidden" name="index" value={item.altFix.index} />
		<input type="hidden" name="src" value={item.altFix.src} />
	</form>
{:else if item.shrink}
	<div class="fix">
		<a href={item.shrink.url} target="_blank" rel="noreferrer" class="thumb"
			><img
				src={item.shrink.url}
				alt={item.shrink.alt}
				loading="lazy"
				decoding="async"
			/>{#if !item.shrink.alt}<span class="visually-hidden"
					>Abrir la portada de {item.title} en otra pestaña</span
				>{/if}</a
		>
		<div class="grow">
			<span
				><b>{item.title}</b> · {kb(item.shrink.size)}
				{#if item.href}<a href={item.href}>{item.action}</a>{/if}</span
			>
			{#if !item.shrink.alt}
				<label class="row">
					<span class="visually-hidden">Qué se ve en la imagen</span>
					<input
						bind:value={coverAlt}
						maxlength={ALT_MAX}
						placeholder="Qué se ve en la imagen (para la copia)"
						autocomplete="off"
					/>
				</label>
			{/if}
			{#if error}<small class="bad" role="alert">{error}</small>
			{:else if busy}<small role="status">{busy}</small>
			{:else if result}<small class:bad={!result.ok} role="status">{result.message}</small>{/if}
		</div>
		<button type="button" class="kv-btn ghost sm" disabled={Boolean(busy)} on:click={shrink}
			>Achicar</button
		>
	</div>
{/if}

<style lang="scss">
	.fix {
		display: flex;
		gap: var(--space-2xs);
		align-items: center;
		flex: 1;
		min-width: 0;
	}
	.thumb {
		flex: none;
		width: 3.2rem;
		height: 3.2rem;
		border-radius: var(--radius-s, 0.4rem);
		overflow: hidden;
		background: var(--line);
		img {
			width: 100%;
			height: 100%;
			object-fit: cover;
			display: block;
		}
	}
	.grow {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		b {
			overflow-wrap: anywhere;
		}
		a {
			margin-left: 0.3rem;
			font-size: 0.9em;
		}
	}
	.row {
		display: flex;
		gap: var(--space-3xs);
		input {
			flex: 1;
			min-width: 0;
		}
	}
	small.bad {
		color: var(--bad);
	}
</style>
