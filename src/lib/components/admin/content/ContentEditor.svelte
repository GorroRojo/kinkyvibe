<!--
	Editor of a material post or an amigues profile inside the panel: create, duplicate or edit.
	Reuses the event editor's pieces (TagPicker, OrganizerPicker, CodeMirror, the admin form look)
	and saves through `?/guardar` (see $lib/server/admin/contentRoutes.js): one commit with the
	post and, optionally, a new image in its media folder.
-->
<script>
	import CodeMirror from 'svelte-codemirror-editor';
	import { markdown } from '@codemirror/lang-markdown';
	import { onDestroy } from 'svelte';
	import { lineEndingOf } from '$lib/utils/lineEndings.js';
	import { checkImageFile } from '$lib/utils/imageUpload.js';
	import { browser } from '$app/environment';
	import { deserialize, enhance } from '$app/forms';
	import { page } from '$app/stores';
	import {
		CircleCheck,
		CircleAlert,
		ExternalLink,
		FileText,
		Image as ImageIcon,
		LoaderCircle,
		Save,
		ShieldAlert,
		Tags as TagsIcon,
		UserRound
	} from '@lucide/svelte';
	import '$lib/components/admin/admin.scss';
	import PageHeader from '$lib/components/admin/panel/PageHeader.svelte';
	import PublishStatus from '$lib/components/admin/PublishStatus.svelte';
	import UnsavedChanges from '$lib/components/admin/panel/UnsavedChanges.svelte';
	import { clearDraft, draftKey } from '$lib/admin/draft.js';
	import OrganizerPicker from '$lib/components/admin/OrganizerPicker.svelte';
	import TagPicker from '$lib/components/admin/TagPicker.svelte';
	import PostListItem from '$lib/components/PostListItem.svelte';
	import Tags from '$lib/components/Tags.svelte';
	import QuickTags from './QuickTags.svelte';
	import { buildTagOptions, canonicalTag, siteTags } from '$lib/utils/adminTags.js';
	import { buildOrganizerOptions } from '$lib/utils/organizers.js';
	import {
		buildContentMarkdown,
		contentProblems,
		duplicateContentForm,
		fieldsFor,
		freeContentSlug,
		hasAuthors,
		readContentForm,
		suggestContentSlug,
		validateContentSlug
	} from '$lib/utils/contentPosts.js';
	import { renderPreviewHtml, sanitizePreview } from '$lib/utils/markdownPreview.js';

	/**
	 * @type {{
	 *   category: 'material'|'amigues', mode: 'nuevo'|'editar', raw: string, sha: string,
	 *   slug: string, source: {slug: string, title: string} | null, fromTemplate: boolean,
	 *   taken: string[], imageUrl: string | null, today: string, maxImageBytes: number,
	 *   mock: boolean, tagUsage: Record<string, number>,
	 *   profiles: import('$lib/utils/organizers.js').Profile[], authorUsage: Record<string, number>
	 * }}
	 */
	export let data;
	/** @type {any} */
	export let form = null;

	const { category, mode } = data;
	const isNew = mode === 'nuevo';
	const one = category === 'material' ? 'material' : 'perfil';
	const tm = siteTags();

	/* ---------- the file ---------- */
	let baseRaw = data.raw;
	let sha = data.sha;
	let parseError = '';
	/** @type {import('$lib/utils/contentPosts.js').ContentForm} */
	let initial = { values: {}, tags: [], authors: [], body: '', featured: '' };
	try {
		initial = readContentForm(category, baseRaw);
	} catch (e) {
		parseError = e instanceof Error ? e.message : String(e);
	}
	let rawText = baseRaw;

	/** @type {import('$lib/utils/contentPosts.js').ContentForm} */
	let f = structuredClone(initial);
	if (isNew && data.source) f = duplicateContentForm(category, f, data.today);
	else if (isNew) {
		// From the template: its example values (pronouns, links, contact…) are only a guide.
		for (const fd of fieldsFor(category)) f.values[fd.key] = fd.type === 'checkbox' ? false : '';
		if ('published_date' in f.values) f.values.published_date = data.today;
		f.tags = [];
		f.authors = [];
		f.body = '';
	}

	// Para saber si un formulario nuevo ya tiene algo escrito.
	const startForm = JSON.stringify(f);

	const fields = fieldsFor(category);
	const mainFields = fields.filter((x) => !x.section);
	const contactFields = fields.filter((x) => x.section === 'contacto');
	const hasContact = contactFields.some((x) => initial.values[x.key]);

	/* ---------- slug ---------- */
	let slug = data.slug;
	let slugTouched = false;
	$: if (isNew && !slugTouched)
		slug = freeContentSlug(
			suggestContentSlug(String(f.values.title ?? ''), category) || '',
			category,
			data.taken
		);
	$: slugError = isNew ? validateContentSlug(slug, category, data.taken) : null;
	/** @type {{slug: string, error: string, unverified?: boolean} | null} */
	let slugCheck = null;
	let checkingSlug = false;
	/** @type {ReturnType<typeof setTimeout> | undefined} */
	let slugTimer;
	$: if (browser && isNew && slug && !slugError) scheduleSlugCheck(slug);
	/** @param {string} s */
	function scheduleSlugCheck(s) {
		clearTimeout(slugTimer);
		if (slugCheck?.slug === s) return;
		slugTimer = setTimeout(() => checkSlug(s), 700);
	}
	/** @param {string} s */
	async function checkSlug(s) {
		checkingSlug = true;
		try {
			const body = new FormData();
			body.set('slug', s);
			const response = await fetch('?/direccion', {
				method: 'POST',
				body,
				headers: { accept: 'application/json', 'x-sveltekit-action': 'true' }
			});
			/** @type {any} */
			const result = deserialize(await response.text());
			if (result.type === 'success' && result.data?.slugCheck?.slug === slug)
				slugCheck = result.data.slugCheck;
		} catch (e) {
			slugCheck = { slug: s, error: '', unverified: true };
		} finally {
			checkingSlug = false;
		}
	}
	onDestroy(() => clearTimeout(slugTimer));

	/* ---------- tags & authors ---------- */
	const tagOptions = buildTagOptions({ category, usage: data.tagUsage });
	const organizerOptions = buildOrganizerOptions(data.profiles, data.authorUsage);

	/* ---------- image ---------- */
	/** @type {HTMLInputElement} */
	let fileInput;
	let uploadURL = '';
	let uploadName = '';
	let uploadError = '';
	/** @param {Event} e */
	function onFileChange(e) {
		// @ts-ignore
		const file = e.currentTarget.files?.[0];
		uploadError = '';
		if (!file) return;
		uploadError = checkImageFile(file, data.maxImageBytes).error;
		if (uploadError) {
			fileInput.value = '';
			return;
		}
		if (uploadURL) URL.revokeObjectURL(uploadURL);
		uploadURL = URL.createObjectURL(file);
		uploadName = file.name;
	}
	function clearUpload() {
		if (fileInput) fileInput.value = '';
		if (uploadURL) URL.revokeObjectURL(uploadURL);
		uploadURL = '';
		uploadName = '';
	}
	onDestroy(() => uploadURL && URL.revokeObjectURL(uploadURL));
	$: currentImage = isNew && data.source ? null : data.imageUrl;

	/* ---------- result ---------- */
	$: buildOpts = {
		// A new post has no image of its own until one is uploaded (the server sets `featured`).
		featured: isNew ? null : undefined,
		touchUpdated: isNew ? undefined : data.today,
		forceKeys: isNew
			? [
					...(data.fromTemplate ? fields.map((x) => x.key) : ['title', 'published_date']),
					'tags',
					'authors'
				]
			: []
	};
	$: content = parseError ? rawText : safeBuild(f, buildOpts);
	/**
	 * @param {typeof f} form
	 * @param {any} opts
	 */
	function safeBuild(form, opts) {
		try {
			return buildContentMarkdown(category, baseRaw, initial, form, opts);
		} catch (e) {
			return '';
		}
	}
	$: unchangedContent = parseError || isNew ? '' : safeBuild(initial, buildOpts);
	$: changed =
		isNew || content !== (parseError ? baseRaw : unchangedContent) || Boolean(uploadName);
	$: problems = parseError
		? []
		: [
				...contentProblems(category, f),
				...(slugError ? [slugError] : []),
				...(slugCheck && slugCheck.slug === slug && slugCheck.error ? [slugCheck.error] : []),
				...(uploadError ? [uploadError] : []),
				...(category === 'amigues' && isNew && !uploadName
					? ['Subí una foto o un logo para el perfil.']
					: [])
			];
	let showProblems = false;

	/* ---------- preview ---------- */
	/** @type {'editar'|'vista'} */
	let pane = 'editar';
	let previewHtml = '';
	/** @type {ReturnType<typeof setTimeout> | undefined} */
	let previewTimer;
	$: if (browser) schedulePreview(f.body);
	/** @param {string} body */
	function schedulePreview(body) {
		clearTimeout(previewTimer);
		previewTimer = setTimeout(() => {
			try {
				previewHtml = sanitizePreview(renderPreviewHtml(body));
			} catch (e) {
				previewHtml = '';
			}
		}, 150);
	}
	onDestroy(() => clearTimeout(previewTimer));
	$: previewTags = f.tags.map((t) => canonicalTag(t, tm));
	$: previewPost = {
		path: `/${category}/${slug || 'nuevo'}`,
		meta: {
			title: f.values.title || 'Sin título',
			summary: f.values.summary || '',
			tags: previewTags,
			authors: f.authors,
			featured: uploadURL || currentImage || undefined,
			published_date: f.values.published_date || data.today,
			category
		}
	};

	/* ---------- saving ---------- */
	let saving = false;
	/** Guardó bien y el servidor redirige a la publicación creada. */
	let redirecting = false;
	/** @type {null | {at: number, commit: string, imagePath: string | null, publish: any}} */
	let saved = null;
	const justCreated = $page.url.searchParams.get('guardado');
	/** El PR con el que se publica lo recién creado (viene en la dirección tras redirigir). */
	const createdPr = (() => {
		const n = Number($page.url.searchParams.get('pr'));
		const state = $page.url.searchParams.get('estado');
		if (!Number.isInteger(n) || n <= 0) return null;
		return {
			number: n,
			url: `https://github.com/GorroRojo/kinkyvibe/pull/${n}`,
			state: /** @type {'auto'|'merged'|'open'} */ (
				state === 'merged' || state === 'open' ? state : 'auto'
			)
		};
	})();

	/** @type {import('@sveltejs/kit').SubmitFunction} */
	function submit({ cancel }) {
		showProblems = true;
		if (problems.length || !content || !changed) {
			cancel();
			return;
		}
		saving = true;
		return async ({ result, update }) => {
			redirecting = result.type === 'redirect';
			// Se creó la publicación: el borrador del formulario nuevo ya no hace falta.
			if (redirecting) {
				try {
					clearDraft(localStorage, unsavedKey);
				} catch {
					// Sin storage no hay borrador.
				}
			}
			saving = false;
			if (result.type === 'success' && result.data?.saved) {
				const s = result.data.saved;
				saved = { at: s.at, commit: s.commit, imagePath: s.imagePath, publish: s.publish };
				baseRaw = s.content;
				sha = s.sha;
				try {
					initial = readContentForm(category, baseRaw);
					f = { ...f, featured: initial.featured };
					parseError = '';
				} catch (e) {
					rawText = baseRaw;
				}
				clearUpload();
			}
			await update({ reset: false, invalidateAll: false });
		};
	}

	/* ---------- unsaved changes (local draft + warning before leaving) ---------- */
	/** Borrador de un formulario nuevo (o de una copia de otra publicación). */
	/** @param {string} from */
	const newKey = (from) => draftKey(category, from ? `nuevo-desde-${from}` : 'nuevo');
	const unsavedKey = isNew ? newKey(data.source?.slug ?? '') : draftKey(category, data.slug);
	$: dirty = isNew
		? JSON.stringify(f) !== startForm || Boolean(uploadName) || slugTouched
		: changed;
	$: draft = { f, slug, slugTouched, rawText };
	/** @param {any} d */
	function restoreDraft(d) {
		if (!d || typeof d !== 'object') return;
		if (d.f && typeof d.f === 'object') f = { ...f, ...d.f };
		if (typeof d.rawText === 'string') rawText = d.rawText;
		if (isNew && d.slugTouched && typeof d.slug === 'string') {
			slug = d.slug;
			slugTouched = true;
		}
	}

	$: pageTitle = isNew
		? data.source
			? `Duplicar «${data.source.title}»`
			: category === 'material'
				? 'Nuevo material'
				: 'Nuevo perfil de amigue'
		: `Editar «${initial.values.title || data.slug}»`;
</script>

<div class="kv-admin content-editor">
	<PageHeader
		title={pageTitle}
		back={{ href: `/admin/${category}`, label: category === 'material' ? 'Material' : 'Amigues' }}
	>
		<svelte:fragment slot="actions">
			{#if !isNew}
				<a class="kv-btn ghost" href="/{category}/{data.slug}" target="_blank" rel="noreferrer"
					><ExternalLink size={16} aria-hidden="true" /> Ver en el sitio</a
				>
				{#if category === 'material'}
					<a
						class="kv-btn ghost"
						href="/admin/{category}/nuevo?desde={encodeURIComponent(data.slug)}">Duplicar</a
					>
				{/if}
			{/if}
		</svelte:fragment>
	</PageHeader>

	{#if data.mock}
		<p class="mock">
			Modo de prueba (<code>npm run dev:admin</code>): no se escribe nada en GitHub, los archivos se
			guardan en una carpeta temporal.
		</p>
	{/if}
	<UnsavedChanges
		draftKey={unsavedKey}
		base={isNew ? '' : sha}
		{dirty}
		snapshot={draft}
		restore={restoreDraft}
		saved={Boolean(saved)}
		saving={saving || redirecting}
	/>

	{#if justCreated && !saved}
		<p class="banner ok" role="status">
			<CircleCheck size={18} aria-hidden="true" />
			<span>
				{justCreated === 'duplicado' ? 'Copia creada' : 'Publicación creada'}.
				{#if createdPr}<PublishStatus pr={createdPr} />{:else}Se ve en el sitio (y en la lista)
					cuando termina el deploy, en unos minutos.{/if}
				Podés seguir editándola acá.
			</span>
		</p>
	{/if}

	{#if parseError}
		<p class="problems" role="alert">
			Las propiedades de este archivo tienen un error de formato ({parseError}), así que se edita
			como texto. Revisá las líneas entre los <code>---</code>.
		</p>
		<textarea class="raw" bind:value={rawText} rows="30" aria-label="Archivo completo"></textarea>
	{:else}
		<fieldset class="card">
			<legend><FileText size={18} aria-hidden="true" /> Datos</legend>
			<div class="grid">
				{#each mainFields as fd}
					{#if fd.type === 'checkbox'}
						<label class="check" class:wide={fd.wide}>
							<input type="checkbox" id="{fd.key}-input" bind:checked={f.values[fd.key]} />
							{fd.label}
						</label>
					{:else}
						<label class="field" class:wide={fd.wide}>
							<span
								>{fd.label}
								{#if fd.required}<span class="req">*</span>{/if}</span
							>
							{#if fd.type === 'textarea'}
								<textarea
									id="{fd.key}-input"
									bind:value={f.values[fd.key]}
									rows="3"
									placeholder={fd.placeholder}></textarea>
							{:else if fd.type === 'date'}
								<input type="date" id="{fd.key}-input" bind:value={f.values[fd.key]} />
							{:else if fd.type === 'url'}
								<input
									type="url"
									inputmode="url"
									id="{fd.key}-input"
									bind:value={f.values[fd.key]}
									placeholder={fd.placeholder}
								/>
							{:else}
								<input
									id="{fd.key}-input"
									bind:value={f.values[fd.key]}
									placeholder={fd.placeholder}
								/>
							{/if}
							{#if fd.help}<small>{fd.help}</small>{/if}
						</label>
					{/if}
				{/each}
				{#if isNew}
					<label class="field wide">
						<span>Dirección de la página <span class="req">*</span></span>
						<div class="slug">
							<span class="prefix">kinkyvibe.ar/{category}/</span>
							<input
								id="slug-input"
								bind:value={slug}
								on:input={() => (slugTouched = true)}
								autocomplete="off"
								spellcheck="false"
								aria-describedby="slug-help"
							/>
						</div>
						<small id="slug-help" class:bad={slugError || slugCheck?.error}>
							{#if slugError}{slugError}
							{:else if checkingSlug}<LoaderCircle size={14} class="spin" aria-hidden="true" /> Comprobando
								en GitHub…
							{:else if slugCheck?.slug === slug && slugCheck.error}{slugCheck.error}
							{:else if slugCheck?.slug === slug && !slugCheck.unverified}<CircleCheck
									size={14}
									aria-hidden="true"
								/> Libre.
							{:else}Se completa sola con el título; podés cambiarla. No se puede cambiar después.{/if}
						</small>
					</label>
				{/if}
			</div>

			{#if contactFields.length}
				<details class="contact" open={hasContact}>
					<summary><ShieldAlert size={16} aria-hidden="true" /> Datos de contacto públicos</summary>
					<p class="warn">
						Todo lo que pongas acá se ve en la página pública del perfil y queda en el historial
						público del repositorio. Completalo solo si la persona lo pidió.
					</p>
					<div class="grid">
						{#each contactFields as fd}
							<label class="field">
								<span>{fd.label}</span>
								{#if fd.type === 'date'}
									<input type="date" id="{fd.key}-input" bind:value={f.values[fd.key]} />
								{:else if fd.type === 'email'}
									<input type="email" id="{fd.key}-input" bind:value={f.values[fd.key]} />
								{:else if fd.type === 'tel'}
									<input type="tel" id="{fd.key}-input" bind:value={f.values[fd.key]} />
								{:else}
									<input id="{fd.key}-input" bind:value={f.values[fd.key]} />
								{/if}
							</label>
						{/each}
					</div>
				</details>
			{/if}
		</fieldset>

		{#if hasAuthors(category)}
			<fieldset class="card">
				<legend><UserRound size={18} aria-hidden="true" /> Autores</legend>
				<div class="field-label">
					<label for="authors-input" class="sr">Autores</label>
					<OrganizerPicker
						bind:authors={f.authors}
						profiles={data.profiles}
						options={organizerOptions}
						id="authors-input"
						describedby="authors-help"
					/>
					<small id="authors-help"
						>Elegí de amigues (se enlaza su perfil) o escribí un nombre y elegí «Agregar».</small
					>
				</div>
			</fieldset>
		{/if}

		<fieldset class="card">
			<legend><ImageIcon size={18} aria-hidden="true" /> Imagen</legend>
			<div class="image-row">
				{#if uploadURL || currentImage}
					<img src={uploadURL || currentImage} alt="Imagen de la publicación" class="thumb" />
				{:else}
					<div class="thumb empty">Sin imagen</div>
				{/if}
				<div class="image-actions">
					{#if uploadName}
						<p class="hint">Nueva imagen: {uploadName}</p>
					{:else if isNew && data.source && initial.featured}
						<p class="hint">La copia no usa la imagen del original: subí una.</p>
					{/if}
					<label class="file">
						<span
							>{uploadName
								? 'Elegir otra imagen'
								: currentImage
									? 'Cambiar la imagen'
									: 'Subir una imagen'}</span
						>
						<input
							bind:this={fileInput}
							type="file"
							name="image"
							form="content-form"
							id="content-image"
							accept="image/jpeg,image/png,image/webp"
							on:change={onFileChange}
						/>
					</label>
					<small>
						JPG, PNG o WEBP, hasta {data.maxImageBytes / 1024 / 1024} MB. Se guarda en
						<code>{category}/media/{slug || '…'}/</code>{isNew
							? ' como 1'
							: ' con el próximo número libre'}
						(las imágenes que ya usa el texto no se tocan).
					</small>
					{#if uploadName}<button type="button" class="link" on:click={clearUpload}
							>No cambiar la imagen</button
						>{/if}
					{#if uploadError}<p class="error">{uploadError}</p>{/if}
				</div>
			</div>
		</fieldset>

		<fieldset class="card">
			<legend><TagsIcon size={18} aria-hidden="true" /> Etiquetas</legend>
			<QuickTags {category} bind:tags={f.tags} idPrefix="content-quick" />
			<div class="field-label">
				<label for="tags-input">Todas las etiquetas: prácticas, temas…</label>
				<TagPicker
					bind:tags={f.tags}
					options={tagOptions}
					id="tags-input"
					placeholder="Buscá una etiqueta: BDSM, shibari, guía…"
					describedby="tags-help"
				/>
				<small id="tags-help"
					>Escribí para buscar (sin importar tildes). Preferí las que ya existen: son las que se
					usan para filtrar. Las etiquetas se ordenan y renombran en <a href="/admin/etiquetas"
						>Etiquetas</a
					>.</small
				>
			</div>
		</fieldset>

		<fieldset class="card body-card">
			<legend><FileText size={18} aria-hidden="true" /> Texto de la página</legend>
			<div class="panes-toggle" role="tablist" aria-label="Texto">
				<button
					type="button"
					role="tab"
					aria-selected={pane === 'editar'}
					on:click={() => (pane = 'editar')}>Editar</button
				>
				<button
					type="button"
					role="tab"
					aria-selected={pane === 'vista'}
					on:click={() => (pane = 'vista')}>Vista previa</button
				>
			</div>
			<div class="panes" data-pane={pane}>
				<div class="pane-edit">
					<p class="hint">
						Formato: <code>## Título</code>, <code>- lista</code>, <code>**negrita**</code>,
						<code>[[término]]</code> para la Kinkipedia.
					</p>
					<div class="editor">
						<CodeMirror lineWrapping tabSize={4} bind:value={f.body} lang={markdown()} />
					</div>
				</div>
				<div class="pane-preview" aria-label="Vista previa">
					<div class="public-preview">
						<article>
							<h1>{f.values.title || 'Sin título'}</h1>
							{#if f.authors.length}
								<address>{f.authors.join(', ')} · {f.values.published_date || data.today}</address>
							{/if}
							{#if previewTags.length}<div class="ptags"><Tags tags={previewTags} /></div>{/if}
							{#if f.values.summary}<div class="content"><p>{f.values.summary}</p></div>{/if}
							<div class="content">{@html previewHtml}</div>
						</article>
					</div>
					<small class="muted"
						>Vista aproximada: los componentes y las imágenes que importa el texto se ven al
						publicar.</small
					>
				</div>
			</div>
		</fieldset>

		<fieldset class="card">
			<legend>Así se ve en la lista</legend>
			<div class="card-preview" aria-hidden="true">
				{#key previewPost}<PostListItem post={previewPost} />{/key}
			</div>
		</fieldset>
	{/if}

	{#if showProblems && problems.length}
		<div class="problems" role="alert">
			<strong>Antes de guardar:</strong>
			<ul>
				{#each problems as p}<li>{p}</li>{/each}
			</ul>
		</div>
	{/if}
	{#if form?.error}<p class="error" role="alert">
			<CircleAlert size={16} aria-hidden="true" />
			{form.error}
		</p>{/if}
	{#if saved}
		<p class="banner ok" role="status">
			<CircleCheck size={18} aria-hidden="true" />
			<span>
				{new Date(saved.at).toLocaleTimeString('es-AR')} ·
				{#if saved.publish}<PublishStatus pr={saved.publish} />{:else}Guardado. El sitio se
					actualiza en unos minutos.{/if}
			</span>
		</p>
	{/if}

	<details class="file-view">
		<summary>Ver el archivo que se va a guardar</summary>
		<pre class="markdown">{content}</pre>
	</details>

	<form
		method="POST"
		action="?/guardar"
		class="bar"
		id="content-form"
		enctype="multipart/form-data"
		use:enhance={submit}
	>
		<textarea hidden name="content" value={content}></textarea>
		<input type="hidden" name="mode" value={mode} />
		<input type="hidden" name="slug" value={slug} />
		<input type="hidden" name="sha" value={sha} />
		<input type="hidden" name="eol" value={lineEndingOf(baseRaw)} />
		<input type="hidden" name="desde" value={data.source?.slug ?? ''} />
		<small class="later"
			>Los cambios tardan unos minutos (normalmente entre 2 y 5) en verse en el sitio.</small
		>
		<button
			type="submit"
			class="kv-btn"
			id="save"
			disabled={saving || !content || (!changed && !isNew)}
		>
			{#if saving}<LoaderCircle size={18} class="spin" aria-hidden="true" /> Guardando…
			{:else}<Save size={18} aria-hidden="true" /> {isNew ? `Crear ${one}` : 'Guardar'}{/if}
		</button>
	</form>
</div>

<style lang="scss">
	.content-editor {
		max-width: 76rem;
		padding: 0;
		font-size: 1rem;
		:global(fieldset.card) {
			background: var(--surface);
			box-shadow: var(--shadow);
			border-radius: 1rem;
		}
		:global(fieldset.card > legend) {
			display: flex;
			align-items: center;
			gap: 0.4em;
			font-size: 1.1rem;
		}
	}
	.sr {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
	}
	.wide {
		grid-column: 1 / -1;
	}
	.banner {
		display: flex;
		gap: 0.5rem;
		align-items: center;
		border-radius: 1rem;
		padding: 0.6rem 1rem;
		margin: 0 0 1rem;
		&.ok {
			background: var(--ok-bg);
			color: var(--ok);
		}
	}
	.slug {
		display: flex;
		align-items: stretch;
		border: 1px solid var(--field);
		border-radius: 0.8em;
		overflow: hidden;
		background: var(--surface);
		.prefix {
			padding: 0.5em 0.2em 0.5em 0.7em;
			color: var(--muted);
			white-space: nowrap;
			font-size: 0.9em;
			align-self: center;
		}
		input {
			flex: 1;
			min-width: 0;
			border: 0 !important;
			outline: none;
		}
		&:focus-within {
			outline: 2px solid var(--link);
			outline-offset: 2px;
		}
	}
	small.bad {
		color: var(--bad);
	}
	.contact {
		border: 1px dashed var(--line);
		border-radius: 1rem;
		padding: 0.5rem 0.9rem;
		summary {
			cursor: pointer;
			font-weight: 700;
			display: flex;
			gap: 0.4em;
			align-items: center;
		}
		.warn {
			background: var(--warn-bg);
			color: var(--warn);
			border-radius: 0.8rem;
			padding: 0.5rem 0.8rem;
			font-size: 0.9rem;
		}
	}
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
		&.empty {
			display: grid;
			place-items: center;
			background: var(--surface-2);
			color: var(--muted);
			font-size: 0.9rem;
		}
	}
	.image-actions {
		display: flex;
		flex-direction: column;
		gap: 0.4em;
		align-items: flex-start;
		flex: 1 1 14em;
		min-width: 0;
		input[type='file'] {
			max-width: 100%;
			font-size: 0.9rem;
		}
		code {
			overflow-wrap: anywhere;
		}
	}
	.panes-toggle {
		display: none;
		gap: 0.3rem;
		button {
			border: 1px solid var(--line);
			background: var(--surface);
			border-radius: 2em;
			padding: 0.4rem 1rem;
			font-weight: 700;
			cursor: pointer;
			min-height: 2.4rem;
		}
		button[aria-selected='true'] {
			background: var(--accent);
			color: var(--accent-ink);
			border-color: var(--accent);
		}
	}
	.panes {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
		gap: 1rem;
	}
	.editor {
		border-radius: 0.8em;
		border: 1px solid var(--line);
		overflow: hidden;
		:global(.cm-editor) {
			max-height: 44rem;
			min-height: 20rem;
			background: var(--surface);
			color: var(--text);
		}
		:global(.cm-gutters) {
			background: var(--surface-2);
			color: var(--muted);
			border-color: var(--line);
		}
	}
	.pane-preview {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
		min-width: 0;
	}
	/* The public site is light-only: its palette inside the previews, also in dark mode. */
	.public-preview,
	.card-preview {
		color-scheme: light;
		--1-light: hsl(319, 100%, 70%);
		--2-light: hsl(262, 100%, 75%);
		--3-light: hsl(165, 84%, 65%);
		--4-light: hsl(50, 100%, 70%);
		--1-dark: hsl(319, 100%, 40%);
		--2-dark: hsl(262, 90%, 50%);
		--3-dark: hsl(165, 84%, 30%);
		--4-dark: hsl(50, 100%, 40%);
		--surface: #fff;
		--text: #2f2a33;
		color: #2f2a33;
	}
	/* The public page's look (white card, site type). */
	.public-preview {
		background: #fff;
		color: #2f2a33;
		border-radius: 1rem;
		border: 1px solid var(--line);
		padding: 1rem 1.2rem 1.5rem;
		max-height: 48rem;
		overflow: auto;
		h1 {
			font-size: var(--step-3);
			text-align: center;
			margin: 0.2em 0;
			overflow-wrap: anywhere;
		}
		address {
			text-align: center;
			font-style: normal;
			opacity: 0.8;
		}
		.content {
			margin-top: 1em;
			:global(img) {
				max-width: 100%;
			}
		}
	}
	.card-preview {
		max-width: 26rem;
		pointer-events: none;
	}
	textarea.raw {
		font-family: monospace;
		font-size: 0.85rem;
		width: 100%;
	}
	.later {
		flex: 1 1 16em;
		color: var(--muted);
	}
	.file-view {
		margin: 1em 0;
		summary {
			cursor: pointer;
			color: var(--link);
		}
	}
	.markdown {
		background: #1e1e1e;
		color: #eee;
		border-radius: 1em;
		padding: 1em;
		font-size: 0.8rem;
		white-space: pre-wrap;
		overflow-wrap: anywhere;
		max-height: 30em;
		overflow: auto;
	}
	:global(.spin) {
		animation: spin 1s linear infinite;
	}
	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
	@media (max-width: 1000px) {
		.panes-toggle {
			display: flex;
		}
		.panes {
			grid-template-columns: minmax(0, 1fr);
		}
		.panes[data-pane='editar'] .pane-preview,
		.panes[data-pane='vista'] .pane-edit {
			display: none;
		}
	}
</style>
