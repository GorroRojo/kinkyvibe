<!--
	Editor of a material post or an amigues profile inside the panel: create, duplicate or edit.
	Uses the same frame and sections as the event form (EventForm: section index, one sticky
	«Guardar», local draft; DatosSection, ImageSection, TagsSection, BodySection, FilePreview in
	$lib/components/admin/event-form/) and saves through `?/guardar` (see
	$lib/server/admin/contentRoutes.js): one commit with the post and, optionally, a new image in
	its media folder.
-->
<script>
	import { onDestroy } from 'svelte';
	import { lineEndingOf } from '$lib/utils/lineEndings.js';
	import { browser } from '$app/environment';
	import { deserialize, enhance } from '$app/forms';
	import { page } from '$app/stores';
	import {
		CircleCheck,
		CircleAlert,
		ExternalLink,
		LoaderCircle,
		Save,
		ShieldAlert
	} from '@lucide/svelte';
	import '$lib/components/admin/admin.scss';
	import PageHeader from '$lib/components/admin/panel/PageHeader.svelte';
	import PublishStatus from '$lib/components/admin/PublishStatus.svelte';
	import EventForm from '$lib/components/admin/event-form/EventForm.svelte';
	import BodySection from '$lib/components/admin/event-form/BodySection.svelte';
	import DatosSection from '$lib/components/admin/event-form/DatosSection.svelte';
	import FieldGrid from '$lib/components/admin/event-form/FieldGrid.svelte';
	import FilePreview from '$lib/components/admin/event-form/FilePreview.svelte';
	import ImageSection from '$lib/components/admin/event-form/ImageSection.svelte';
	import TagsSection from '$lib/components/admin/event-form/TagsSection.svelte';
	import { clearDraft, draftKey } from '$lib/admin/draft.js';
	import { contentDraftLabels, formSections } from '$lib/admin/eventForm.js';
	import { emptyUpload } from '$lib/admin/imageState.js';
	import { contentAdminHref, contentAdminLabel } from '$lib/admin/nav.js';
	import PostListItem from '$lib/components/PostListItem.svelte';
	import Tags from '$lib/components/Tags.svelte';
	import QuickTags from './QuickTags.svelte';
	import { canonicalTag, siteTags } from '$lib/utils/adminTags.js';
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
	const listHref = contentAdminHref(category);
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

	/* ---------- image ---------- */
	/** La imagen elegida (ImageSection la revisa y suelta su URL). */
	let upload = emptyUpload();
	/** @type {ImageSection | undefined} */
	let imageSection;
	function clearUpload() {
		imageSection?.clear();
	}
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
		isNew || content !== (parseError ? baseRaw : unchangedContent) || Boolean(upload.name);
	$: problems = parseError
		? []
		: [
				...contentProblems(category, f),
				...(slugError ? [slugError] : []),
				...(slugCheck && slugCheck.slug === slug && slugCheck.error ? [slugCheck.error] : []),
				...(upload.error ? [upload.error] : []),
				...(category === 'amigues' && isNew && !upload.name
					? ['Subí una foto o un logo para el perfil.']
					: [])
			];
	let showProblems = false;

	/* ---------- preview ---------- */
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
			featured: upload.url || currentImage || undefined,
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
		? JSON.stringify(f) !== startForm || Boolean(upload.name) || slugTouched
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
	<PageHeader title={pageTitle} back={{ href: listHref, label: contentAdminLabel(category) }}>
		<svelte:fragment slot="actions">
			{#if !isNew}
				<a class="kv-btn ghost" href="/{category}/{data.slug}" target="_blank" rel="noreferrer"
					><ExternalLink size={16} aria-hidden="true" /> Ver en el sitio</a
				>
				{#if category === 'material'}
					<a class="kv-btn ghost" href="{listHref}/nuevo?desde={encodeURIComponent(data.slug)}"
						>Duplicar</a
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

	<EventForm
		sections={formSections({ mode: 'contenido', parseError: !!parseError })}
		draftKey={unsavedKey}
		base={isNew ? '' : sha}
		{dirty}
		snapshot={draft}
		restore={restoreDraft}
		describe={contentDraftLabels}
		saved={Boolean(saved)}
		saving={saving || redirecting}
	>
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
			<DatosSection
				fields={mainFields}
				bind:values={f.values}
				hasAuthors={hasAuthors(category)}
				bind:authors={f.authors}
				profiles={data.profiles}
				authorUsage={data.authorUsage}
				authorsLabel="Autores"
			>
				<svelte:fragment slot="grid">
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
				</svelte:fragment>
				{#if contactFields.length}
					<details class="contact" open={hasContact}>
						<summary
							><ShieldAlert size={16} aria-hidden="true" /> Datos de contacto públicos</summary
						>
						<p class="warn">
							Todo lo que pongas acá se ve en la página pública del perfil y queda en el historial
							público del repositorio. Completalo solo si la persona lo pidió.
						</p>
						<FieldGrid fields={contactFields} bind:values={f.values} />
					</details>
				{/if}
			</DatosSection>

			<ImageSection
				bind:this={imageSection}
				bind:upload
				src={upload.url || currentImage}
				alt="Imagen de la publicación"
				inputId="content-image"
				form="content-form"
				buttonText={upload.name
					? 'Elegir otra imagen'
					: currentImage
						? 'Cambiar la imagen'
						: 'Subir una imagen'}
				maxImageBytes={data.maxImageBytes}
			>
				<svelte:fragment slot="before">
					{#if upload.name}
						<p class="hint">Nueva imagen: {upload.name}</p>
					{:else if isNew && data.source && initial.featured}
						<p class="hint">La copia no usa la imagen del original: subí una.</p>
					{/if}
				</svelte:fragment>
				<svelte:fragment slot="formats">
					JPG, PNG o WEBP, hasta {data.maxImageBytes / 1024 / 1024} MB. Se guarda en
					<code>{category}/media/{slug || '…'}/</code>{isNew
						? ' como 1'
						: ' con el próximo número libre'}
					(las imágenes que ya usa el texto no se tocan).
				</svelte:fragment>
				{#if upload.name}<button type="button" class="link" on:click={clearUpload}
						>No cambiar la imagen</button
					>{/if}
			</ImageSection>

			<TagsSection
				{category}
				usage={data.tagUsage}
				bind:freeTags={f.tags}
				label="Todas las etiquetas: prácticas, temas…"
				placeholder="Buscá una etiqueta: BDSM, shibari, guía…"
			>
				<QuickTags slot="before" {category} bind:tags={f.tags} idPrefix="content-quick" />
				<svelte:fragment slot="help"
					>Escribí para buscar (sin importar tildes). Preferí las que ya existen: son las que se
					usan para filtrar. Las etiquetas se ordenan y renombran en <a href="/admin/etiquetas"
						>Etiquetas</a
					>.</svelte:fragment
				>
			</TagsSection>

			<BodySection bind:value={f.body}>
				<svelte:fragment slot="hint"
					>Formato: <code>## Título</code>, <code>- lista</code>, <code>**negrita**</code>,
					<code>[[término]]</code> para la Kinkipedia.</svelte:fragment
				>
				<svelte:fragment slot="preview">
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
				</svelte:fragment>
			</BodySection>

			<fieldset class="card" id="sec-lista">
				<legend>👀 Así se ve en la lista</legend>
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

		<FilePreview {content} />

		<form
			method="POST"
			action="?/guardar"
			class="bar sticky"
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
	</EventForm>
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
	:global(.spin) {
		animation: spin 1s linear infinite;
	}
	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
</style>
