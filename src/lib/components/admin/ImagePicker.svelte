<script>
	/**
	 * El selector de imágenes de los editores (evento, material, serie y perfil; docs/imagenes.md).
	 * Tres pestañas:
	 * - «Subir»: elegir un archivo, escribir qué se ve (texto alternativo, obligatorio) y subirlo.
	 *   Se achica y se pasa a WEBP en el navegador ($lib/utils/imageResize.js); va a R2 y a la
	 *   biblioteca al momento. Todo lo que se sube queda en la biblioteca.
	 * - «Buscar»: buscar en la biblioteca por nombre o texto alternativo.
	 * - «De este evento» (`contextLabel`): las imágenes que ya usa este objeto o su serie.
	 *
	 * La imagen elegida va en un campo oculto (`name`, por defecto `imageId`; ver
	 * $lib/utils/imageChoice.js): vacío si no se tocó, `none` si se sacó, o el id de la imagen.
	 *
	 * Props:
	 * - `value` (bind): la imagen elegida de la biblioteca (`PublicImage`) o null.
	 * - `legacyUrl`: la imagen vieja del repo, si el objeto todavía no tiene una de la biblioteca.
	 * - `target`: `evento:<dirección>`… para «De este…» (sin `target`, no hay esa pestaña).
	 * - `contextLabel`, `legend`, `idPrefix`, `form` (id del formulario del campo oculto).
	 * - `canDelete`: «Sacar imágenes de la biblioteca…» en «Buscar» (solo admins): recién ahí cada
	 *   imagen muestra «Sacar».
	 * - `canDeleteOwn`: «Borrar imágenes sin usar…» en «Buscar» (Mi rincón: una cuenta ve solo las
	 *   que subió). Solo las que nada usa muestran «Borrar»; las otras dicen dónde se usan.
	 * - Evento `change`: se eligió o se sacó una imagen.
	 */
	import { createEventDispatcher, onDestroy } from 'svelte';
	import { askConfirm } from '$lib/admin/confirm.js';
	import { Trash2 } from '@lucide/svelte';
	import {
		IMAGE_FIELD,
		contextHref,
		imageFieldValue,
		searchHref,
		usageText
	} from '$lib/utils/imageChoice.js';
	import { PICKABLE_TYPES, pickProblem, prepareImage } from '$lib/utils/imageResize.js';

	/** @typedef {import('$lib/server/media/library.js').PublicImage} PublicImage */

	/** @type {PublicImage | null} */
	export let value = null;
	/** @type {string | null | undefined} */
	export let legacyUrl = null;
	/** @type {string | null} */
	export let target = null;
	export let contextLabel = 'De este evento';
	export let legend = '🖼️ Imagen';
	export let idPrefix = 'img';
	export let name = IMAGE_FIELD;
	export let form = '';
	export let canDelete = false;
	export let canDeleteOwn = false;
	/** `id` del fieldset (para el índice de secciones). */
	export let sectionId = 'sec-imagen';

	const dispatch = createEventDispatcher();

	/** @type {'subir' | 'buscar' | 'contexto'} */
	let tab = 'subir';
	let touched = false;
	let removedLegacy = false;

	/* ---------- Subir ---------- */
	/** @type {HTMLInputElement | undefined} */
	let fileInput;
	/** @type {File | null} */
	let file = null;
	let localUrl = '';
	let alt = '';
	let title = '';
	let uploadError = '';
	/** @type {'' | 'achicando' | 'subiendo'} */
	let busy = '';

	/** @param {Event} e */
	function onFile(e) {
		const picked = /** @type {HTMLInputElement} */ (e.currentTarget).files?.[0] ?? null;
		uploadError = '';
		if (!picked) return;
		const problem = pickProblem(picked);
		if (problem) {
			uploadError = problem;
			if (fileInput) fileInput.value = '';
			return;
		}
		if (localUrl) URL.revokeObjectURL(localUrl);
		file = picked;
		localUrl = URL.createObjectURL(picked);
		title = picked.name.replace(/\.[^./]+$/, '');
	}

	function clearFile() {
		if (localUrl) URL.revokeObjectURL(localUrl);
		localUrl = '';
		file = null;
		alt = '';
		title = '';
		if (fileInput) fileInput.value = '';
	}

	async function upload() {
		if (!file || busy) return;
		if (!alt.trim()) {
			uploadError = 'Escribí qué se ve en la imagen: lo leen quienes usan lector de pantalla.';
			return;
		}
		uploadError = '';
		busy = 'achicando';
		// Lo que se sube es lo que había al tocar «Subir» (aunque se cambie mientras sube).
		const picked = file;
		const pickedAlt = alt.trim();
		const pickedTitle = title.trim();
		try {
			const prepared = await prepareImage(picked);
			busy = 'subiendo';
			const body = new FormData();
			body.set('file', prepared.blob, prepared.name);
			body.set('name', pickedTitle || prepared.name);
			body.set('alt', pickedAlt);
			if (prepared.width) body.set('width', String(prepared.width));
			if (prepared.height) body.set('height', String(prepared.height));
			const res = await fetch('/imagenes', { method: 'POST', body });
			const out = await res.json().catch(() => ({}));
			if (!res.ok || !out.image) {
				uploadError = out.error || 'No se pudo subir la imagen. Probá de nuevo.';
				return;
			}
			choose(out.image);
			if (file === picked) clearFile();
		} catch {
			uploadError = 'No se pudo subir la imagen. Revisá tu conexión y probá de nuevo.';
		} finally {
			busy = '';
		}
	}

	/* ---------- Buscar y «De este…» ---------- */
	let q = '';
	/** @type {(PublicImage & { usedIn?: string[] })[] | null} */
	let results = null;
	/** «Sacar imágenes de la biblioteca…»: recién ahí aparece «Sacar» en cada imagen. */
	let managing = false;
	let searching = false;
	let searchError = '';
	/** @type {ReturnType<typeof setTimeout> | undefined} */
	let timer;
	/** @type {PublicImage[] | null} */
	let contextResults = null;
	let contextError = '';

	/** @param {string} href */
	async function load(href) {
		const res = await fetch(href, { headers: { accept: 'application/json' } });
		if (!res.ok) throw new Error(String(res.status));
		const out = await res.json();
		return /** @type {PublicImage[]} */ (out.images ?? []);
	}

	async function search() {
		searching = true;
		searchError = '';
		const asked = q;
		try {
			const found = await load(searchHref(asked));
			if (asked === q) results = found;
		} catch {
			searchError = 'No pudimos buscar. Probá de nuevo.';
		} finally {
			searching = false;
		}
	}

	function onSearchInput() {
		clearTimeout(timer);
		timer = setTimeout(search, 250);
	}

	async function loadContext() {
		if (!target) return;
		contextError = '';
		try {
			contextResults = await load(contextHref(target));
		} catch {
			contextError = 'No pudimos traer las imágenes. Probá de nuevo.';
		}
	}

	/** @param {string} t */
	function openTab(t) {
		tab = t === 'buscar' || t === 'contexto' ? t : 'subir';
		if (t === 'buscar' && results === null) search();
		if (t === 'contexto' && contextResults === null) loadContext();
	}

	/** @param {PublicImage} image */
	function choose(image) {
		value = image;
		touched = true;
		dispatch('change', { image });
	}

	function remove() {
		value = null;
		removedLegacy = true;
		touched = true;
		dispatch('change', { image: null });
	}

	/** @param {PublicImage} image */
	async function deleteFromLibrary(image) {
		const ok = await askConfirm(
			canDelete
				? {
						title: `¿Sacar «${image.title}» de la biblioteca?`,
						text: 'Deja de verse donde se usa.',
						confirmLabel: 'Sacar',
						tone: 'danger'
					}
				: {
						title: `¿Borrar «${image.title}»?`,
						text: 'No se usa en ningún lado. Deja de estar entre tus imágenes; si la volvés a subir, vuelve.',
						confirmLabel: 'Borrar',
						tone: 'danger'
					}
		);
		if (!ok) return;
		const res = await fetch(`/imagenes/${image.id}`, { method: 'DELETE' });
		if (!res.ok) {
			const out = await res.json().catch(() => ({}));
			searchError =
				out.error ||
				(canDelete
					? 'No se pudo sacar la imagen. Probá de nuevo.'
					: 'No se pudo borrar la imagen. Probá de nuevo.');
			// Si resultó que se usa, que lo diga la lista también.
			if (Array.isArray(out.usedIn) && out.usedIn.length)
				results = (results ?? []).map((r) =>
					r.id === image.id ? { ...r, usedIn: out.usedIn } : r
				);
			return;
		}
		results = (results ?? []).filter((r) => r.id !== image.id);
		contextResults = (contextResults ?? []).filter((r) => r.id !== image.id);
		if (value?.id === image.id) remove();
	}

	onDestroy(() => {
		clearTimeout(timer);
		if (localUrl) URL.revokeObjectURL(localUrl);
	});

	$: shown = value?.url || (removedLegacy ? '' : legacyUrl || '');
	$: fieldValue = imageFieldValue(value, touched);
	$: tabs = /** @type {Array<{ id: 'subir' | 'buscar' | 'contexto', label: string }>} */ ([
		{ id: 'subir', label: 'Subir' },
		{ id: 'buscar', label: 'Buscar' },
		...(target ? [{ id: 'contexto', label: contextLabel }] : [])
	]);
</script>

<fieldset class="card image-picker" id={sectionId}>
	<legend>{legend}</legend>
	<input type="hidden" {name} value={fieldValue} form={form || undefined} />
	<div class="current">
		{#if shown}
			<img src={shown} alt={value?.alt ?? ''} class="thumb" />
		{:else}
			<div class="thumb empty">Sin imagen</div>
		{/if}
		<div class="current-text">
			{#if value}
				<p class="title">{value.title}</p>
				{#if value.alt}<p class="hint">Texto alternativo: {value.alt}</p>{/if}
			{:else if shown}
				<p class="hint">
					Imagen guardada en el repo (de antes de la biblioteca). Podés dejarla o elegir otra.
				</p>
			{:else}
				<p class="hint">Todavía no tiene imagen.</p>
			{/if}
			{#if touched}<p class="hint changed">
					Cambio sin guardar: se aplica al tocar «Guardar».
				</p>{/if}
			{#if shown}
				<button type="button" class="kv-link" on:click={remove}>Quitar la imagen</button>
			{/if}
		</div>
	</div>

	<div class="tabs" role="tablist" aria-label="Elegir la imagen">
		{#each tabs as t}
			<button
				type="button"
				role="tab"
				id="{idPrefix}-tab-{t.id}"
				aria-controls="{idPrefix}-panel-{t.id}"
				aria-selected={tab === t.id}
				on:click={() => openTab(t.id)}>{t.label}</button
			>
		{/each}
	</div>

	{#if tab === 'subir'}
		<div
			class="panel"
			role="tabpanel"
			id="{idPrefix}-panel-subir"
			aria-labelledby="{idPrefix}-tab-subir"
		>
			<label class="file">
				<span class="file-button">{file ? 'Elegir otro archivo' : 'Elegir archivo'}</span>
				<input
					bind:this={fileInput}
					id={idPrefix}
					class="file-input"
					type="file"
					accept={PICKABLE_TYPES.join(',')}
					disabled={Boolean(busy)}
					on:change={onFile}
				/>
			</label>
			<small>
				JPG, PNG, WEBP, GIF o AVIF, hasta 10 MB. Se achica y se pasa a WEBP antes de subir. Queda en
				la biblioteca para usarla en otros lados.
			</small>
			{#if file}
				<div class="upload-form">
					{#if localUrl}<img src={localUrl} alt="" class="thumb small" />{/if}
					<div class="fields">
						<label>
							<span>¿Qué se ve en la imagen? <span class="req">*</span></span>
							<textarea
								rows="2"
								bind:value={alt}
								maxlength="1000"
								placeholder="Por ejemplo: flyer violeta con el nombre de la fiesta y la fecha"
							/>
						</label>
						<label>
							<span>Nombre para buscarla</span>
							<input type="text" bind:value={title} maxlength="200" />
						</label>
						<div class="row">
							<button type="button" class="button" disabled={Boolean(busy)} on:click={upload}>
								{busy === 'achicando'
									? 'Achicando…'
									: busy === 'subiendo'
										? 'Subiendo…'
										: 'Subir y usar esta imagen'}
							</button>
							<button type="button" class="kv-link" on:click={clearFile}>Cancelar</button>
						</div>
					</div>
				</div>
			{/if}
			{#if uploadError}<p class="error" role="alert">{uploadError}</p>{/if}
		</div>
	{:else if tab === 'buscar'}
		<div
			class="panel"
			role="tabpanel"
			id="{idPrefix}-panel-buscar"
			aria-labelledby="{idPrefix}-tab-buscar"
		>
			<label class="search">
				<span class="visually-hidden">Buscar en la biblioteca</span>
				<input
					type="search"
					bind:value={q}
					on:input={onSearchInput}
					placeholder="Buscá por nombre o por lo que se ve…"
				/>
			</label>
			{#if searchError}<p class="error">{searchError}</p>{/if}
			{#if results === null || searching}
				<p class="hint">Buscando…</p>
			{:else if results.length === 0}
				<p class="hint">
					{q.trim() ? 'No encontramos imágenes con eso.' : 'La biblioteca todavía está vacía.'}
				</p>
			{:else}
				{#if canDelete || canDeleteOwn}
					<!-- Sacar de la biblioteca: aparte, para no tenerlo debajo de cada imagen. -->
					<p class="manage">
						<button
							type="button"
							class="kv-link small"
							aria-pressed={managing}
							on:click={() => (managing = !managing)}
							>{managing
								? 'Listo'
								: canDelete
									? 'Sacar imágenes de la biblioteca…'
									: 'Borrar imágenes sin usar…'}</button
						>
					</p>
				{/if}
				<ul class="picker-grid">
					{#each results as image (image.id)}
						<li>
							<button
								type="button"
								class="pick"
								class:selected={value?.id === image.id}
								aria-pressed={value?.id === image.id}
								on:click={() => choose(image)}
							>
								<img src={image.url} alt="" loading="lazy" />
								<span>{image.title}</span>
								{#if image.usedIn?.length}
									<small class="used">En {usageText(image.usedIn)}</small>
								{/if}
							</button>
							{#if canDelete && managing}
								<button
									type="button"
									class="kv-btn small danger"
									aria-label="Sacar «{image.title}» de la biblioteca"
									on:click={() => deleteFromLibrary(image)}
									><Trash2 size={14} aria-hidden="true" /> Sacar</button
								>
							{:else if canDeleteOwn && managing}
								{#if image.usedIn?.length}
									<small class="used">Se usa: no se puede borrar. Primero sacala de ahí.</small>
								{:else}
									<button
										type="button"
										class="kv-btn small danger"
										aria-label="Borrar «{image.title}»"
										on:click={() => deleteFromLibrary(image)}
										><Trash2 size={14} aria-hidden="true" /> Borrar</button
									>
								{/if}
							{/if}
						</li>
					{/each}
				</ul>
			{/if}
		</div>
	{:else}
		<div
			class="panel"
			role="tabpanel"
			id="{idPrefix}-panel-contexto"
			aria-labelledby="{idPrefix}-tab-contexto"
		>
			{#if contextError}<p class="error">{contextError}</p>{/if}
			{#if contextResults === null}
				<p class="hint">Buscando…</p>
			{:else if contextResults.length === 0}
				<p class="hint">Todavía no hay imágenes acá. Subí una o buscala en la biblioteca.</p>
			{:else}
				<ul class="picker-grid">
					{#each contextResults as image (image.id)}
						<li>
							<button
								type="button"
								class="pick"
								class:selected={value?.id === image.id}
								aria-pressed={value?.id === image.id}
								on:click={() => choose(image)}
							>
								<img src={image.url} alt="" loading="lazy" />
								<span>{image.title}</span>
							</button>
						</li>
					{/each}
				</ul>
			{/if}
		</div>
	{/if}
</fieldset>

<style>
	.image-picker {
		display: flex;
		flex-direction: column;
		gap: 0.8em;
	}
	.current {
		display: flex;
		gap: 1em;
		align-items: flex-start;
		flex-wrap: wrap;
	}
	.current-text {
		display: flex;
		flex-direction: column;
		gap: 0.3em;
		flex: 1 1 14em;
		min-width: 0;
	}
	.current-text p {
		margin: 0;
		overflow-wrap: anywhere;
	}
	.title {
		font-weight: 700;
	}
	.changed {
		color: var(--accent-dark, var(--1-dark, #6b2a7a));
		opacity: 1;
	}
	.thumb {
		width: 8em;
		height: 8em;
		object-fit: cover;
		border-radius: 1em;
		background: var(--surface-2, #f3eef6);
	}
	.thumb.small {
		width: 5em;
		height: 5em;
	}
	.thumb.empty {
		display: grid;
		place-items: center;
		font-size: var(--step--1);
	}
	.tabs {
		display: flex;
		flex-wrap: wrap;
		gap: 0.3rem;
	}
	.tabs button {
		border: 1px solid var(--line, #d8cfe0);
		background: var(--surface, white);
		color: inherit;
		border-radius: 2em;
		padding: 0.4rem 1rem;
		font: inherit;
		font-weight: 700;
		cursor: pointer;
		min-height: 2.4rem;
	}
	.tabs button[aria-selected='true'] {
		background: var(--accent, var(--1, #8a3ea0));
		color: var(--accent-ink, white);
		border-color: var(--accent, var(--1, #8a3ea0));
	}
	.panel {
		display: flex;
		flex-direction: column;
		gap: 0.6em;
		min-width: 0;
	}
	.file {
		position: relative;
		display: inline-flex;
		cursor: pointer;
		align-self: flex-start;
	}
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
		border: 2px solid var(--accent, var(--1, #8a3ea0));
		border-radius: 2em;
		background: var(--surface, white);
		color: var(--accent-dark, var(--1-dark, #6b2a7a));
		font-weight: 700;
	}
	.file-input:focus-visible + .file-button,
	.file:focus-within .file-button {
		outline: 2px solid var(--link, var(--2, #2a5db0));
		outline-offset: 2px;
	}
	.upload-form {
		display: flex;
		gap: 0.8em;
		align-items: flex-start;
		flex-wrap: wrap;
	}
	.fields {
		display: flex;
		flex-direction: column;
		gap: 0.5em;
		flex: 1 1 16em;
		min-width: 0;
	}
	.fields label,
	.manage {
		margin: 0 0 var(--space-2xs);
		text-align: right;
	}
	.used {
		color: var(--muted);
		font-size: var(--text-xs);
		overflow-wrap: anywhere;
	}
	.search {
		display: flex;
		flex-direction: column;
		gap: 0.2em;
	}
	.fields textarea,
	.fields input,
	.search input {
		font: inherit;
		width: 100%;
		box-sizing: border-box;
	}
	.row {
		display: flex;
		gap: 0.8em;
		align-items: center;
		flex-wrap: wrap;
	}
	.picker-grid {
		list-style: none;
		padding: 0;
		margin: 0;
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(6.5rem, 1fr));
		gap: 0.6em;
	}
	.picker-grid li {
		display: flex;
		flex-direction: column;
		gap: 0.2em;
		min-width: 0;
	}
	.pick {
		display: flex;
		flex-direction: column;
		gap: 0.3em;
		padding: 0.3em;
		border: 2px solid transparent;
		border-radius: 0.8em;
		background: var(--surface, white);
		color: inherit;
		font: inherit;
		font-size: var(--step--1);
		text-align: start;
		cursor: pointer;
		min-width: 0;
	}
	.pick img {
		width: 100%;
		aspect-ratio: 1;
		object-fit: cover;
		border-radius: 0.6em;
		background: var(--surface-2, #f3eef6);
	}
	.pick span {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.pick:hover,
	.pick:focus-visible {
		border-color: var(--line, #d8cfe0);
	}
	.pick.selected {
		border-color: var(--accent, var(--1, #8a3ea0));
	}
	/* También fuera del panel (Mi rincón), donde no está admin.scss. */
	.button {
		background: var(--accent, var(--1, #8a3ea0));
		color: var(--accent-ink, white);
		border: 0;
		border-radius: var(--radius-pill);
		box-shadow: none;
		padding: 0.55em 1.1em;
		font: inherit;
		font-weight: 700;
		cursor: pointer;
		min-height: 2.5rem;
	}
	.button:disabled {
		opacity: 0.6;
		cursor: progress;
	}
	/* Acciones de texto: .kv-link (style.scss), acá solo el tamaño y la alineación. */
	.kv-link {
		align-self: flex-start;
	}
	.kv-link.small {
		font-size: var(--step--1);
	}
	.error {
		color: var(--error, var(--bad, #b00020));
		margin: 0;
	}
	.hint {
		margin: 0;
	}
	.req {
		color: var(--bad, #b00020);
	}
	.visually-hidden {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
		white-space: nowrap;
	}
</style>
