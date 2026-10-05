<script>
	/**
	 * «📎 Biblioteca: enlazar un archivo» (editor de material; docs/imagenes.md): subir un documento
	 * o un video a la biblioteca, o buscar uno (con filtro por tipo), y poner su enlace en el texto.
	 * Los documentos y los videos se muestran con un ícono y su nombre; las imágenes, con su
	 * miniatura. Solo les admins (el editor de material es del panel).
	 *
	 * No elige nada para un campo: el enlace (`[Nombre](/media/file/<hash>.pdf)`) se suma al final
	 * del texto, y el texto es lo que se guarda.
	 *
	 * Props:
	 * - `idPrefix`.
	 * - Evento `insert` con `{ markdown, item }`: el enlace para sumar al texto.
	 */
	import { createEventDispatcher, onDestroy } from 'svelte';
	import { FileText, Film, Image as ImageIcon, Sheet, Presentation } from '@lucide/svelte';
	import {
		DOCUMENT_ACCEPT,
		LIBRARY_KINDS,
		MAX_FILE_BYTES,
		documentPickProblem,
		libraryHref,
		libraryLink
	} from '$lib/utils/libraryFiles.js';

	export let idPrefix = 'biblio';

	const dispatch = createEventDispatcher();

	/* ---------- Subir ---------- */
	/** @type {HTMLInputElement | undefined} */
	let fileInput;
	/** @type {File | null} */
	let file = null;
	let title = '';
	let uploadError = '';
	let busy = false;
	let notice = '';

	/** @param {Event} e */
	function onFile(e) {
		const picked = /** @type {HTMLInputElement} */ (e.currentTarget).files?.[0] ?? null;
		uploadError = '';
		notice = '';
		if (!picked) return;
		const problem = documentPickProblem(picked);
		if (problem) {
			uploadError = problem;
			if (fileInput) fileInput.value = '';
			file = null;
			return;
		}
		file = picked;
		title = picked.name.replace(/\.[^./]+$/, '');
	}

	async function upload() {
		if (!file || busy) return;
		if (!title.trim()) {
			uploadError = 'Escribí un nombre para el archivo: es lo que se ve en el enlace.';
			return;
		}
		uploadError = '';
		busy = true;
		const picked = file;
		try {
			const body = new FormData();
			body.set('file', picked, picked.name);
			body.set('name', title.trim());
			const res = await fetch('/imagenes', { method: 'POST', body });
			const out = await res.json().catch(() => ({}));
			if (!res.ok || !out.file) {
				uploadError =
					out.error ||
					(res.status === 413
						? 'El archivo es demasiado grande para subirlo.'
						: 'No se pudo subir el archivo. Probá de nuevo.');
				return;
			}
			insert(out.file);
			if (file === picked) {
				file = null;
				title = '';
				if (fileInput) fileInput.value = '';
			}
			results = null;
		} catch {
			uploadError = 'No se pudo subir el archivo. Revisá tu conexión y probá de nuevo.';
		} finally {
			busy = false;
		}
	}

	/* ---------- Buscar ---------- */
	let q = '';
	/** @type {'todo' | 'imagen' | 'documento' | 'video'} */
	let kind = 'todo';
	/** @type {import('$lib/server/media/library.js').LibraryItem[] | null} */
	let results = null;
	let searching = false;
	let searchError = '';
	/** @type {ReturnType<typeof setTimeout> | undefined} */
	let timer;

	async function search() {
		searching = true;
		searchError = '';
		const asked = `${kind}|${q}`;
		try {
			const res = await fetch(libraryHref(q, kind), { headers: { accept: 'application/json' } });
			if (!res.ok) throw new Error(String(res.status));
			const out = await res.json();
			if (asked === `${kind}|${q}`) results = out.images ?? [];
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

	/** @param {import('$lib/server/media/library.js').LibraryItem} item */
	function insert(item) {
		const markdown = libraryLink(item);
		dispatch('insert', { markdown, item });
		notice = `Listo: el enlace a «${item.title}» quedó al final del texto.`;
	}

	/** @param {import('$lib/server/media/library.js').LibraryItem} item */
	function iconOf(item) {
		if (item.kind === 'video') return Film;
		if (item.kind === 'imagen') return ImageIcon;
		if (item.mime.endsWith('.spreadsheet')) return Sheet;
		if (item.mime.endsWith('.presentation')) return Presentation;
		return FileText;
	}

	/** @param {number} n */
	const mb = (n) => `${(n / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;

	let open = false;
	/** @param {Event} e */
	function onToggle(e) {
		open = /** @type {HTMLDetailsElement} */ (e.currentTarget).open;
		if (open && results === null) search();
	}

	onDestroy(() => clearTimeout(timer));
</script>

<details class="card library-link" on:toggle={onToggle}>
	<summary>📎 Enlazar un archivo de la biblioteca</summary>
	<p class="hint">
		Para PDF, videos y documentos (guías, fanzines…): subilo o buscalo y el enlace se suma al final
		del texto. Después lo podés mover a donde quieras.
	</p>
	{#if notice}<p class="ok" role="status">{notice}</p>{/if}

	<div class="block">
		<h3>Subir</h3>
		<div class="row">
			<label class="file">
				<input
					bind:this={fileInput}
					class="file-input"
					type="file"
					accept={DOCUMENT_ACCEPT}
					on:change={onFile}
				/>
				<span class="file-button">{file ? 'Elegir otro archivo' : 'Elegir archivo'}</span>
			</label>
			<span class="hint"
				>PDF, MP4, WebM, ODT, ODS u ODP; hasta {MAX_FILE_BYTES / 1024 / 1024} MB.</span
			>
		</div>
		{#if file}
			<label class="field">
				<span>Nombre <span class="req">*</span></span>
				<input type="text" bind:value={title} maxlength="200" id="{idPrefix}-nombre" />
			</label>
			<button type="button" class="kv-btn" disabled={busy} on:click={upload}
				>{busy ? 'Subiendo…' : 'Subir y enlazar'}</button
			>
		{/if}
		{#if uploadError}<p class="error" role="alert">{uploadError}</p>{/if}
	</div>

	<div class="block">
		<h3>Buscar</h3>
		<div class="row">
			<label class="search">
				<span class="visually-hidden">Buscar en la biblioteca</span>
				<input
					type="search"
					bind:value={q}
					on:input={onSearchInput}
					placeholder="Buscá por nombre…"
				/>
			</label>
			<label class="kind">
				<span class="visually-hidden">Tipo</span>
				<select bind:value={kind} on:change={search}>
					{#each LIBRARY_KINDS as k}
						<option value={k.id}>{k.label}</option>
					{/each}
				</select>
			</label>
		</div>
		{#if searchError}<p class="error">{searchError}</p>{/if}
		{#if results === null || searching}
			<p class="hint">Buscando…</p>
		{:else if results.length === 0}
			<p class="hint">
				{q.trim() || kind !== 'todo'
					? 'No encontramos nada con eso.'
					: 'La biblioteca todavía está vacía.'}
			</p>
		{:else}
			<ul class="items">
				{#each results as item (`${item.kind}-${item.id}`)}
					<li>
						{#if item.kind === 'imagen'}
							<img src={item.url} alt="" loading="lazy" class="icon thumb" />
						{:else}
							<span class="icon" aria-hidden="true"
								><svelte:component this={iconOf(item)} size={22} /></span
							>
						{/if}
						<span class="name">
							<span>{item.title}</span>
							<small>{item.typeLabel} · {mb(item.size)}</small>
						</span>
						<button
							type="button"
							class="kv-btn small"
							aria-label="Enlazar «{item.title}» en el texto"
							on:click={() => insert(item)}>Enlazar</button
						>
					</li>
				{/each}
			</ul>
		{/if}
	</div>
</details>

<style>
	.library-link {
		display: flex;
		flex-direction: column;
		gap: 0.6em;
	}
	summary {
		cursor: pointer;
		font-weight: 700;
	}
	.block {
		display: flex;
		flex-direction: column;
		gap: 0.5em;
		margin-top: 0.6em;
	}
	h3 {
		margin: 0;
		font-size: var(--step-0, 1rem);
	}
	.row {
		display: flex;
		gap: 0.6em;
		align-items: center;
		flex-wrap: wrap;
	}
	.hint {
		margin: 0;
		color: var(--muted);
	}
	.ok {
		margin: 0;
		font-weight: 700;
	}
	.error {
		margin: 0;
		color: var(--danger, #b00020);
	}
	.req {
		color: var(--danger, #b00020);
	}
	.file {
		position: relative;
		display: inline-flex;
		cursor: pointer;
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
	.field {
		display: flex;
		flex-direction: column;
		gap: 0.2em;
	}
	.field input,
	.search input,
	.kind select {
		font: inherit;
		box-sizing: border-box;
		min-height: 2.4rem;
	}
	.search {
		flex: 1 1 14em;
		min-width: 0;
	}
	.search input {
		width: 100%;
	}
	.items {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.4em;
	}
	.items li {
		display: flex;
		align-items: center;
		gap: 0.6em;
		padding: 0.4em;
		border: 1px solid var(--line, #d8cfe0);
		border-radius: var(--radius-m, 0.6em);
		background: var(--surface, white);
	}
	.icon {
		flex: none;
		width: 2.6em;
		height: 2.6em;
		display: grid;
		place-items: center;
		border-radius: 0.5em;
		background: var(--surface-2, #f3eef6);
	}
	.thumb {
		object-fit: cover;
	}
	.name {
		flex: 1 1 auto;
		min-width: 0;
		display: flex;
		flex-direction: column;
		overflow-wrap: anywhere;
	}
	.name small {
		color: var(--muted);
	}
</style>
