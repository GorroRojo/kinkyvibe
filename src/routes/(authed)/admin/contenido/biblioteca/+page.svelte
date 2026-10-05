<script>
	/**
	 * Contenido › Biblioteca (docs/imagenes.md): imágenes, documentos y videos de la biblioteca, con
	 * dónde se usa cada cosa. Buscar (por nombre o texto alternativo) con filtro por tipo, «Cargar
	 * más», subir (imágenes hasta 10 MB, achicadas en el navegador; documentos y videos hasta 25 MB)
	 * y sacar (borrado suave, con confirmación que dice dónde se usa y «Deshacer»).
	 */
	import { onDestroy } from 'svelte';
	import { goto } from '$app/navigation';
	import { deserialize } from '$app/forms';
	import {
		ExternalLink,
		FileText,
		Film,
		Images,
		Presentation,
		SearchX,
		Sheet,
		Trash2,
		Upload
	} from '@lucide/svelte';
	import {
		Button,
		Card,
		EmptyState,
		Field,
		Notice,
		PageHeader,
		Segmented,
		UndoToast,
		askConfirm
	} from '$lib/components/ui';
	import { DOCUMENT_ACCEPT, LIBRARY_KINDS, documentPickProblem } from '$lib/utils/libraryFiles.js';
	import { PICKABLE_TYPES, pickProblem, prepareImage } from '$lib/utils/imageResize.js';
	import {
		bibliotecaHref,
		deleteText,
		moreHref,
		sizeText,
		useHref
	} from '$lib/admin/biblioteca.js';

	/**
	 * @typedef {import('$lib/server/media/library.js').LibraryItem & { usedIn: string[],
	 *   uses: import('$lib/server/media/library.js').LibraryUse[] }} Item
	 */

	/** @type {{ q: string, kind: 'todo' | 'imagen' | 'documento' | 'video', items: Item[],
	 *   more: boolean, error: string }} */
	export let data;

	const KIND_OPTIONS = LIBRARY_KINDS.map((k) => ({ value: k.id, label: k.label }));
	const EMPTY_TEXT = /** @type {Record<string, string>} */ ({
		todo: 'Todavía no hay nada en la biblioteca.',
		imagen: 'No hay imágenes.',
		documento: 'No hay documentos.',
		video: 'No hay videos.'
	});

	/** @type {Item[]} */
	let items = [];
	let more = false;
	let q = '';
	/** @type {string} */
	let kind = 'todo';
	let listError = '';
	let loadingMore = false;

	// Cada navegación (buscar, filtrar) trae la lista de nuevo desde el servidor.
	$: reset(data);
	/** @param {typeof data} d */
	function reset(d) {
		items = d.items;
		more = d.more;
		// Lo que se está escribiendo no se pisa (por ejemplo, el espacio antes de otra palabra).
		if (d.q !== q.trim()) q = d.q;
		kind = d.kind;
		listError = d.error;
	}

	/* ---------- Buscar y filtrar ---------- */
	/** @type {ReturnType<typeof setTimeout> | undefined} */
	let timer;
	function search() {
		clearTimeout(timer);
		goto(bibliotecaHref(q, kind), { keepFocus: true, noScroll: true, replaceState: true });
	}
	// Escribir busca solo (un ratito después); cambiar el tipo, al momento.
	$: if (q.trim() !== data.q) {
		clearTimeout(timer);
		timer = setTimeout(search, 300);
	}
	$: if (kind !== data.kind) search();

	async function loadMore() {
		loadingMore = true;
		listError = '';
		try {
			const res = await fetch(moreHref(data.q, data.kind, items.length), {
				headers: { accept: 'application/json' }
			});
			if (!res.ok) throw new Error(String(res.status));
			const out = await res.json();
			const seen = new Set(items.map((i) => i.id));
			items = [...items, ...(out.images ?? []).filter((/** @type {Item} */ i) => !seen.has(i.id))];
			more = Boolean(out.more);
		} catch {
			listError = 'No pudimos traer más. Probá de nuevo.';
		} finally {
			loadingMore = false;
		}
	}

	/* ---------- Sacar y deshacer ---------- */
	/** @type {{ item: Item, index: number } | null} */
	let undo = null;
	let undoing = false;
	let undoError = '';

	/** @param {Item} item */
	async function remove(item) {
		const ok = await askConfirm({
			title: `¿Sacar «${item.title}» de la biblioteca?`,
			text: deleteText(item),
			confirmLabel: 'Sacar',
			tone: 'danger'
		});
		if (!ok) return;
		listError = '';
		try {
			const res = await fetch(`/imagenes/${item.id}`, { method: 'DELETE' });
			if (!res.ok && res.status !== 404) {
				const out = await res.json().catch(() => ({}));
				listError = out.error || 'No se pudo sacar. Probá de nuevo.';
				return;
			}
		} catch {
			listError = 'No se pudo sacar. Revisá tu conexión y probá de nuevo.';
			return;
		}
		const index = items.findIndex((i) => i.id === item.id);
		items = items.filter((i) => i.id !== item.id);
		undoError = '';
		undo = { item, index };
	}

	async function restore() {
		if (!undo || undoing) return;
		undoing = true;
		const { item, index } = undo;
		try {
			const body = new FormData();
			body.set('id', String(item.id));
			const res = await fetch('?/recuperar', {
				method: 'POST',
				body,
				headers: { 'x-sveltekit-action': 'true' }
			});
			const result = deserialize(await res.text());
			if (result.type !== 'success') {
				undoError =
					(result.type === 'failure' && /** @type {any} */ (result.data)?.error) ||
					'No se pudo deshacer. Probá de nuevo.';
				return;
			}
			const at = Math.min(Math.max(0, index), items.length);
			items = [...items.slice(0, at), item, ...items.slice(at)];
			undo = null;
		} catch {
			undoError = 'No se pudo deshacer. Revisá tu conexión y probá de nuevo.';
		} finally {
			undoing = false;
		}
	}

	/* ---------- Subir ---------- */
	const ACCEPT = [...PICKABLE_TYPES, DOCUMENT_ACCEPT].join(',');
	/** @type {HTMLInputElement | undefined} */
	let fileInput;
	/** @type {File | null} */
	let file = null;
	let isImage = false;
	let alt = '';
	let title = '';
	let uploadError = '';
	let uploadNotice = '';
	/** @type {'' | 'achicando' | 'subiendo'} */
	let busy = '';

	/** @param {Event} e */
	function onFile(e) {
		const picked = /** @type {HTMLInputElement} */ (e.currentTarget).files?.[0] ?? null;
		uploadError = '';
		uploadNotice = '';
		file = null;
		if (!picked) return;
		const image = picked.type.startsWith('image/');
		const problem = image ? pickProblem(picked) : documentPickProblem(picked);
		if (problem) {
			uploadError = problem;
			if (fileInput) fileInput.value = '';
			return;
		}
		file = picked;
		isImage = image;
		alt = '';
		title = picked.name.replace(/\.[^./]+$/, '');
	}

	function clearFile() {
		file = null;
		alt = '';
		title = '';
		if (fileInput) fileInput.value = '';
	}

	async function upload() {
		if (!file || busy) return;
		if (isImage && !alt.trim()) {
			uploadError = 'Escribí qué se ve en la imagen: lo leen quienes usan lector de pantalla.';
			return;
		}
		if (!isImage && !title.trim()) {
			uploadError = 'Escribí un nombre para el archivo: es lo que se ve en el enlace.';
			return;
		}
		uploadError = '';
		uploadNotice = '';
		const picked = file;
		try {
			const body = new FormData();
			if (isImage) {
				busy = 'achicando';
				const prepared = await prepareImage(picked);
				body.set('file', prepared.blob, prepared.name);
				body.set('name', title.trim() || prepared.name);
				body.set('alt', alt.trim());
				if (prepared.width) body.set('width', String(prepared.width));
				if (prepared.height) body.set('height', String(prepared.height));
			} else {
				body.set('file', picked, picked.name);
				body.set('name', title.trim());
			}
			busy = 'subiendo';
			const res = await fetch('/imagenes', { method: 'POST', body });
			const out = await res.json().catch(() => ({}));
			const saved = out.image ?? out.file;
			if (!res.ok || !saved) {
				uploadError =
					out.error ||
					(res.status === 413
						? 'El archivo es demasiado grande para subirlo.'
						: 'No se pudo subir. Probá de nuevo.');
				return;
			}
			uploadNotice =
				res.status === 201
					? `Listo: «${saved.title}» quedó en la biblioteca.`
					: `«${saved.title}» ya estaba en la biblioteca.`;
			if (file === picked) clearFile();
			// La lista vuelve a pedirse (lo nuevo aparece arriba, con su tipo y dónde se usa).
			await goto(bibliotecaHref(data.q, data.kind), {
				keepFocus: true,
				noScroll: true,
				invalidateAll: true,
				replaceState: true
			});
		} catch {
			uploadError = 'No se pudo subir. Revisá tu conexión y probá de nuevo.';
		} finally {
			busy = '';
		}
	}

	/** @param {Item} item */
	function iconOf(item) {
		if (item.kind === 'video') return Film;
		if (item.mime.endsWith('.spreadsheet')) return Sheet;
		if (item.mime.endsWith('.presentation')) return Presentation;
		return FileText;
	}

	onDestroy(() => clearTimeout(timer));
</script>

<PageHeader
	title="Biblioteca"
	subtitle="Las imágenes, los documentos y los videos que se subieron al sitio, con dónde se usa cada cosa."
/>

<Card title="Subir a la biblioteca">
	<div class="upload">
		<label class="kv-btn ghost pick">
			<Upload size={16} aria-hidden="true" /> Elegir archivo
			<input
				bind:this={fileInput}
				class="visually-hidden"
				type="file"
				accept={ACCEPT}
				on:change={onFile}
			/>
		</label>
		<p class="hint">
			Imágenes (JPG, PNG, WEBP, GIF o AVIF) de hasta 10 MB; documentos (PDF, ODT, ODS, ODP) y videos
			(MP4, WebM) de hasta 25 MB.
		</p>
	</div>
	{#if file}
		<div class="upload-form">
			<p class="picked">{file.name} · {sizeText(file.size)}</p>
			{#if isImage}
				<Field
					label="Texto alternativo (qué se ve)"
					bind:value={alt}
					help="Lo leen quienes usan lector de pantalla."
				/>
				<Field label="Nombre (para buscarla)" bind:value={title} />
			{:else}
				<Field label="Nombre" bind:value={title} help="Es lo que se ve en el enlace." />
			{/if}
			<div class="row">
				<Button icon={Upload} on:click={upload} disabled={Boolean(busy)} busy={Boolean(busy)}
					>{busy === 'achicando'
						? 'Achicando…'
						: busy === 'subiendo'
							? 'Subiendo…'
							: 'Subir'}</Button
				>
				<Button variant="link" on:click={clearFile} disabled={Boolean(busy)}>Cancelar</Button>
			</div>
		</div>
	{/if}
	{#if uploadError}<Notice tone="error">{uploadError}</Notice>{/if}
	{#if uploadNotice}<Notice>{uploadNotice}</Notice>{/if}
</Card>

<form class="filters" role="search" on:submit|preventDefault={search}>
	<div class="search">
		<Field type="search" label="Buscar" placeholder="Nombre o texto alternativo" bind:value={q} />
	</div>
	<Segmented label="Tipo" options={KIND_OPTIONS} bind:value={kind} />
</form>

{#if listError}<Notice tone="error">{listError}</Notice>{/if}

{#if undo}
	<UndoToast
		floating
		message={undoError || `Sacaste «${undo.item.title}» de la biblioteca.`}
		error={Boolean(undoError)}
		busy={undoing}
		on:undo={restore}
		on:close={() => (undo = null)}
	/>
{/if}

{#if items.length}
	<ul class="grid" aria-label="Lo que hay en la biblioteca">
		{#each items as item (item.id)}
			<li class="item">
				<a class="thumb" href={item.url} target="_blank" rel="noreferrer" tabindex="-1">
					{#if item.kind === 'imagen'}
						<img src={item.url} alt="" loading="lazy" decoding="async" />
					{:else}
						<span class="type-icon" aria-hidden="true"
							><svelte:component this={iconOf(item)} size={40} strokeWidth={1.5} /></span
						>
					{/if}
				</a>
				<div class="info">
					<b class="title">{item.title}</b>
					{#if item.kind === 'imagen' && item.alt}
						<span class="alt">{item.alt}</span>
					{:else if item.kind !== 'imagen' && item.originalName}
						<span class="alt">{item.originalName}</span>
					{/if}
					<span class="meta">{item.typeLabel} · {sizeText(item.size)}</span>
					{#if item.uses.length}
						<span class="uses"
							>Se usa en:
							{#each item.uses as use, i}{#if i},
								{/if}{#if useHref(use)}<a href={useHref(use)}>{item.usedIn[i]}</a>{:else}{item
										.usedIn[i]}{/if}{/each}</span
						>
					{:else}
						<span class="uses unused">No se usa en ningún lado.</span>
					{/if}
				</div>
				<div class="actions">
					<a
						class="kv-btn ghost small"
						href={item.url}
						target="_blank"
						rel="noreferrer"
						aria-label="Abrir «{item.title}» (se abre en otra pestaña)"
						><ExternalLink size={16} aria-hidden="true" /> Abrir</a
					>
					<Button variant="danger" size="small" icon={Trash2} on:click={() => remove(item)}
						>Sacar<span class="visually-hidden"> «{item.title}» de la biblioteca</span></Button
					>
				</div>
			</li>
		{/each}
	</ul>
	{#if more}
		<div class="more">
			<Button variant="secondary" on:click={loadMore} disabled={loadingMore} busy={loadingMore}
				>{loadingMore ? 'Cargando…' : 'Cargar más'}</Button
			>
		</div>
	{/if}
{:else if !listError}
	{#if data.q}
		<EmptyState
			icon={SearchX}
			title="No encontramos nada"
			text="Probá con otra palabra o con otro tipo."
		/>
	{:else}
		<EmptyState
			icon={Images}
			title={EMPTY_TEXT[data.kind] ?? EMPTY_TEXT.todo}
			text="Lo que subas acá o desde los editores aparece en esta lista."
		/>
	{/if}
{/if}

<style>
	.upload {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-xs);
	}
	.pick {
		cursor: pointer;
	}
	.pick:focus-within {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}
	.hint {
		margin: 0;
		color: var(--muted);
		font-size: var(--text-sm);
		flex: 1 1 16rem;
	}
	.upload-form {
		display: grid;
		gap: var(--space-xs);
		margin-top: var(--space-xs);
		max-width: 34rem;
	}
	.picked {
		margin: 0;
		font-weight: 600;
		overflow-wrap: anywhere;
	}
	.row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-xs);
	}
	.filters {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-end;
		gap: var(--space-xs);
		margin: var(--space-s) 0;
	}
	.search {
		flex: 1 1 16rem;
	}
	/* En el celu, los cuatro tipos a todo el ancho, en una fila y sin cortarse: cada botón se
	   achica (menos relleno) en vez de deslizarse o pasar abajo. */
	@media (max-width: 40rem) {
		.filters :global(.kv-segmented) {
			display: flex;
			flex-wrap: nowrap;
			width: 100%;
		}
		.filters :global(.kv-segmented button) {
			flex: 1 1 auto;
			min-width: 0;
			padding-inline: 0.4em;
			white-space: nowrap;
		}
	}
	.grid {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(min(100%, 17rem), 1fr));
		gap: var(--space-xs);
	}
	.item {
		display: flex;
		flex-direction: column;
		background: var(--surface);
		border: 1px solid var(--line);
		border-radius: var(--card-round);
		overflow: hidden;
	}
	.thumb {
		display: grid;
		place-items: center;
		aspect-ratio: 16 / 10;
		background: var(--surface-2);
		color: var(--accent-dark);
	}
	.thumb img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
	.info {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
		padding: var(--space-2xs) var(--space-xs);
		flex: 1;
		min-width: 0;
	}
	.title {
		overflow-wrap: anywhere;
	}
	.alt,
	.meta,
	.uses {
		font-size: var(--text-sm);
		overflow-wrap: anywhere;
	}
	.alt,
	.meta,
	.unused {
		color: var(--muted);
	}
	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2xs);
		padding: 0 var(--space-xs) var(--space-xs);
	}
	.more {
		display: flex;
		justify-content: center;
		margin-top: var(--space-s);
	}
	/* En el celu, filas: la miniatura chica a la izquierda (así entran más en la pantalla). */
	@media (max-width: 40rem) {
		.item {
			display: grid;
			grid-template-columns: 5.5rem minmax(0, 1fr);
			grid-template-rows: auto auto;
		}
		.thumb {
			grid-row: 1 / span 2;
			aspect-ratio: 1;
			align-self: start;
			margin: var(--space-xs) 0 var(--space-xs) var(--space-xs);
			border-radius: calc(var(--card-round) / 2);
			overflow: hidden;
		}
		.thumb :global(svg) {
			width: 28px;
			height: 28px;
		}
		.info {
			padding-top: var(--space-xs);
		}
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
