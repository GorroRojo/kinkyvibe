<script>
	import CodeMirror from 'svelte-codemirror-editor';
	import { markdown } from '@codemirror/lang-markdown';
	import { deserialize } from '$app/forms';
	import { onDestroy } from 'svelte';
	import ImageScopeChoice from '$lib/components/admin/ImageScopeChoice.svelte';
	import ImageSection from '$lib/components/admin/event-form/ImageSection.svelte';
	import FilePreview from '$lib/components/admin/event-form/FilePreview.svelte';
	import PersonasEditor from '$lib/components/admin/PersonasEditor.svelte';
	import { PERSONAS_KEY, validatePersonas } from '$lib/utils/personas.js';
	import TicketsEditor from '$lib/components/admin/TicketsEditor.svelte';
	import EventForm from '$lib/components/admin/event-form/EventForm.svelte';
	import FieldGrid from '$lib/components/admin/event-form/FieldGrid.svelte';
	import OrganizersField from '$lib/components/admin/event-form/OrganizersField.svelte';
	import TagsSection from '$lib/components/admin/event-form/TagsSection.svelte';
	import { draftKey } from '$lib/admin/draft.js';
	import { formSections } from '$lib/admin/eventForm.js';
	import { fromInput, postFields, toInput } from '$lib/admin/postFields.js';
	import { checkImageFile } from '$lib/utils/imageUpload.js';
	import {
		applyTicketsToMarkdown,
		readTicketsForm,
		validateTicketsForm
	} from '$lib/utils/ticketsEditor.js';
	import '$lib/components/admin/admin.scss';
	import { joinEventTags, splitEventTags, validateEventTags } from '$lib/utils/adminTags.js';
	import {
		REMOVE,
		applyFrontmatterChanges,
		joinMarkdown,
		splitMarkdown,
		todayInArgentina,
		validateSchedule
	} from '$lib/utils/eventDraft.js';
	import PublishStatus from '$lib/components/admin/PublishStatus.svelte';
	import { replacementAssetName, uploadScope } from '$lib/utils/sharedImage.js';
	import { parseDocument } from 'yaml';
	import { lineEndingOf } from '$lib/utils/lineEndings.js';

	/**
	 * Editor de publicaciones (datos + imagen + etiquetas + entradas + texto en markdown). Lo usan
	 * /edit/<categoría>/<slug> y, dentro del panel, la pestaña Editar de la ficha de un evento
	 * (`embedded`: sin el título ni el link de volver, que pone la ficha).
	 */
	/** @type {any} */
	export let data;
	/** @type {any} */
	export let form;
	/** @type {string} */
	export let category;
	/** @type {string} */
	export let postID;
	/** Dentro del panel (la ficha del evento pone el título y las pestañas). */
	export let embedded = false;

	const sha = data.post.sha ?? '';
	const path = data.post.path ?? '';

	/* ---------- the file ---------- */
	/** @type {string} */
	let frontmatter = '';
	let body = '';
	let parseError = '';
	/** @type {Record<string, any>} */
	let meta = {};
	try {
		({ frontmatter, body } = splitMarkdown(data.post.raw));
		const doc = parseDocument(frontmatter);
		if (doc.errors.length) throw new Error(doc.errors[0].message);
		meta = doc.toJS() ?? {};
	} catch (e) {
		parseError = e instanceof Error ? e.message : String(e);
	}
	// With properties that can't be read, the whole file is edited as text.
	let rawText = data.post.raw;

	/** @typedef {import('$lib/admin/postFields.js').Field} Field */
	const fields = postFields(category);

	/** @type {Record<string, any>} */
	const initial = Object.fromEntries(fields.map((f) => [f.key, toInput(f, meta[f.key])]));
	// Existing behavior: saving marks the post as updated today. Set in the initializer, not
	// with a later `values.updated_date = …`: Svelte 5 (legacy mode) compiles that statement
	// with a reference to the `f` of the `bind:value={values[f.key]}` loop below and crashes.
	/** @type {Record<string, any>} */
	let values = { ...initial, updated_date: todayInArgentina() };

	/* ---------- tags & authors ---------- */
	/** @param {any} v @returns {string[]} */
	const list = (v) => (Array.isArray(v) ? v.map(String) : v ? [String(v)] : []);
	const initialTags = list(meta.tags);
	const isEvent = category === 'calendario';
	const split = splitEventTags(initialTags);
	let tagRules = {
		kinkyvibe: split.kinkyvibe,
		language: split.language,
		sign: split.sign,
		place: split.place,
		prices: split.prices
	};
	let freeTags = isEvent ? split.rest : initialTags;
	$: tags = isEvent ? joinEventTags({ ...tagRules, rest: freeTags }) : freeTags;
	$: tagErrors = isEvent ? validateEventTags(tags) : [];

	const hasAuthors = category !== 'amigues';
	const initialAuthors = list(meta.authors);
	let authors = [...initialAuthors];
	const authorsLabel = isEvent ? 'Organizan' : 'Autores';

	/* ---------- personas con rol (interruptor personas_eventos) ---------- */
	// `data.personas` ({ roles, profiles }) llega solo con el interruptor prendido; apagado, el
	// editor no muestra ni toca `personas:`.
	/** @type {{ roles: string[], profiles: { slug: string, title: string, kind: 'persona' | 'proyecto' }[] } | null} */
	const personasData = category !== 'amigues' ? (data.personas ?? null) : null;
	/** @type {{ perfil: string, rol: string }[]} */
	const initialPersonas = (Array.isArray(meta[PERSONAS_KEY]) ? meta[PERSONAS_KEY] : [])
		.filter((/** @type {any} */ e) => e && typeof e === 'object')
		.map((/** @type {any} */ e) => ({ perfil: String(e.perfil ?? ''), rol: String(e.rol ?? '') }));
	let personas = initialPersonas.map((e) => ({ ...e }));
	/** @param {{ perfil: string, rol: string }[]} list */
	const personasErrors = (list) => {
		if (!personasData || parseError) return [];
		const r = validatePersonas(list, personasData.roles);
		return r.ok ? [] : r.errors;
	};
	// Como con las entradas: lo que el archivo ya tenía mal no bloquea guardar otros cambios.
	const initialPersonasErrors = personasErrors(initialPersonas);
	$: newPersonasErrors = personasErrors(personas).filter((e) => !initialPersonasErrors.includes(e));

	/* ---------- tickets (events only) ---------- */
	const initialTickets = readTicketsForm(meta);
	let tickets = readTicketsForm(meta);
	$: ticketsCheck =
		isEvent && !parseError
			? validateTicketsForm(tickets, { sales: data.sales ?? undefined })
			: { errors: [], warnings: [] };
	// Lo que el archivo ya tenía mal (por ejemplo, cargado a mano) se muestra pero no bloquea
	// guardar otros cambios; el servidor hace lo mismo.
	const initialTicketErrors =
		isEvent && !parseError
			? validateTicketsForm(initialTickets, { sales: data.sales ?? undefined }).errors
			: [];
	$: newTicketErrors = ticketsCheck.errors.filter((e) => !initialTicketErrors.includes(e));

	/* ---------- image (events only) ---------- */
	const image = data.image;
	/** @type {HTMLInputElement} */
	let fileInput;
	let uploadURL = '';
	let uploadName = '';
	/** @type {'jpg'|'png'|'webp'|''} */
	let uploadExt = '';
	let uploadError = '';
	/** @type {''|'todas'|'esta'} */
	let imageScope = '';
	/** @type {Array<{slug: string, title: string, start: string}> | null} */
	let affected = null;
	let affectedError = '';
	$: askScope = Boolean(image?.shared && uploadExt);
	$: scope = uploadScope(image?.featured ?? '', askScope ? imageScope : '');
	$: sharedNewName = askScope ? replacementAssetName(image?.featured ?? '', uploadExt) : '';
	/** `featured` after saving with the new image ('' = unchanged) */
	$: newFeatured = !uploadExt
		? ''
		: scope === 'todas'
			? sharedNewName
			: String(image?.nextNumber ?? 1);
	$: if (askScope && scope === 'todas' && affected === null && !affectedError) loadAffected();

	/** @param {Event} e */
	function onFileChange(e) {
		// @ts-ignore
		const file = e.currentTarget.files?.[0];
		uploadError = '';
		if (!file) return;
		const check = checkImageFile(file, data.maxImageBytes);
		if (check.error) {
			uploadError = check.error;
			fileInput.value = '';
			return;
		}
		if (uploadURL) URL.revokeObjectURL(uploadURL);
		uploadURL = URL.createObjectURL(file);
		uploadName = file.name;
		uploadExt = check.ext;
	}
	function clearUpload() {
		if (fileInput) fileInput.value = '';
		if (uploadURL) URL.revokeObjectURL(uploadURL);
		uploadURL = '';
		uploadName = '';
		uploadExt = '';
		imageScope = '';
	}
	onDestroy(() => uploadURL && URL.revokeObjectURL(uploadURL));

	async function loadAffected() {
		try {
			const body = new FormData();
			body.set('asset', image?.featured ?? '');
			const response = await fetch('?/afectados', {
				method: 'POST',
				body,
				headers: { accept: 'application/json', 'x-sveltekit-action': 'true' }
			});
			/** @type {any} */
			const result = deserialize(await response.text());
			if (result.type === 'success') affected = result.data?.affected ?? [];
			else
				affectedError = result.data?.error ?? 'No pudimos listar los eventos que usan esta imagen.';
		} catch (e) {
			affectedError = 'No pudimos listar los eventos que usan esta imagen.';
		}
	}

	/* ---------- result ---------- */
	/** @type {Field} */
	const datetime = { key: '', label: '', type: 'datetime' };
	$: scheduleError =
		isEvent && values.start && values.end
			? validateSchedule(fromInput(datetime, values.start), fromInput(datetime, values.end))
			: null;
	$: problems = parseError
		? []
		: /** @type {string[]} */ (
				[
					...fields.filter((f) => f.required && !values[f.key]).map((f) => `Falta «${f.label}».`),
					scheduleError,
					uploadError,
					askScope &&
						!imageScope &&
						'Elegí si la imagen nueva es para todas las ediciones del evento o solo para esta.',
					...tagErrors,
					...newTicketErrors.map((e) => `Entradas: ${e}`),
					...newPersonasErrors
				].filter(Boolean)
			);

	$: content = parseError
		? rawText
		: build(values, tags, authors, body, newFeatured, tickets, personas);
	/**
	 * @param {Record<string, any>} v
	 * @param {string[]} t
	 * @param {string[]} a
	 * @param {string} b
	 * @param {string} [featured] new `featured` ('' = unchanged); the server sets the final one
	 * @param {typeof tickets} [tk] ticket sales form (events only)
	 * @param {typeof personas} [ps] personas con rol (solo con el interruptor prendido)
	 */
	function build(v, t, a, b, featured = '', tk = initialTickets, ps = initialPersonas) {
		/** @type {Record<string, any>} */
		const changes = {};
		for (const f of fields) {
			if (v[f.key] !== initial[f.key] || f.key === 'updated_date')
				changes[f.key] = fromInput(f, v[f.key]);
		}
		if (t.join('\n') !== initialTags.join('\n')) changes.tags = t;
		if (hasAuthors && a.join('\n') !== initialAuthors.join('\n')) changes.authors = a;
		if (featured) changes.featured = /^\d+$/.test(featured) ? Number(featured) : featured;
		if (personasData && JSON.stringify(ps) !== JSON.stringify(initialPersonas)) {
			changes[PERSONAS_KEY] = ps.length ? ps.map(({ perfil, rol }) => ({ perfil, rol })) : REMOVE;
		}
		try {
			const md = joinMarkdown(applyFrontmatterChanges(frontmatter, changes), b);
			return isEvent ? applyTicketsToMarkdown(md, tk, initialTickets) : md;
		} catch (e) {
			return '';
		}
	}
	// What saving right now would write (only the updated date changes): "Guardar" needs more.
	const unchanged = parseError
		? data.post.raw
		: build(
				values,
				isEvent ? joinEventTags({ ...tagRules, rest: freeTags }) : freeTags,
				authors,
				body
			);
	$: changed = content !== unchanged || Boolean(uploadExt);

	/* ---------- unsaved changes (local draft + warning before leaving) ---------- */
	// La imagen elegida no entra en el borrador (es un archivo): el resto sí.
	$: draft = { values, tagRules, freeTags, authors, tickets, personas, body, rawText };
	/** @param {any} d */
	function restoreDraft(d) {
		if (!d || typeof d !== 'object') return;
		if (d.values) values = { ...values, ...d.values };
		if (d.tagRules) tagRules = { ...tagRules, ...d.tagRules };
		if (Array.isArray(d.freeTags)) freeTags = d.freeTags;
		if (Array.isArray(d.authors)) authors = d.authors;
		if (d.tickets) tickets = d.tickets;
		if (personasData && Array.isArray(d.personas)) personas = d.personas;
		if (typeof d.body === 'string') body = d.body;
		if (typeof d.rawText === 'string') rawText = d.rawText;
	}
</script>

<svelte:head>
	<title>Editar · {meta.title ?? postID} · {embedded ? 'Panel' : 'KV Admin'}</title>
</svelte:head>

<svelte:element this={embedded ? 'div' : 'main'} class="edit kv-admin" class:embedded>
	{#if !embedded}
		<p class="back">
			<a href={'/' + category + '/' + postID}>← Volver a la publicación</a>
		</p>
	{/if}

	{#if data.mock}
		<p class="mock">
			🧪 Modo de prueba (<code>npm run dev:admin</code>): no se escribe nada en GitHub, los archivos
			se guardan en una carpeta temporal.
		</p>
	{/if}

	{#if !embedded}<h1>Editar «{meta.title ?? postID}»</h1>{/if}

	<EventForm
		sections={formSections({
			mode: 'editar',
			category,
			hasImage: Boolean(image),
			hasPersonas: Boolean(personasData),
			parseError: !!parseError
		})}
		draftKey={draftKey(category, postID)}
		base={sha}
		dirty={changed}
		snapshot={draft}
		restore={restoreDraft}
		saved={Boolean(form?.save)}
		saveForm="edit-form"
	>
		{#if parseError}
			<p class="problems" role="alert">
				Las propiedades de este archivo tienen un error de formato ({parseError}), así que se edita
				como texto. Revisá las líneas entre los <code>---</code>.
			</p>
			<textarea class="raw" bind:value={rawText} rows="30"></textarea>
		{:else}
			<fieldset class="card" id="sec-datos">
				<legend>📝 Datos</legend>
				<FieldGrid {fields} bind:values />
				{#if hasAuthors}
					<OrganizersField
						bind:authors
						profiles={data.profiles}
						authorUsage={data.authorUsage}
						label={authorsLabel}
						>Elegí de amigues (se enlaza su perfil) o escribí un nombre y elegí «Agregar».</OrganizersField
					>
				{/if}
			</fieldset>

			{#if personasData}
				<fieldset class="card" id="sec-personas">
					<legend>👥 Personas</legend>
					<p class="hint">
						Quiénes participan y con qué rol. En la página se muestran con link a su perfil (solo
						los perfiles públicos).
					</p>
					<PersonasEditor
						bind:personas
						roles={personasData.roles}
						profiles={personasData.profiles}
						errors={newPersonasErrors}
						idPrefix="edit-personas"
					/>
				</fieldset>
			{/if}

			{#if image}
				<ImageSection
					src={uploadURL || image.url}
					inputId="edit-image"
					form="edit-form"
					buttonText={uploadExt ? 'Elegir otra imagen' : 'Subir una imagen nueva'}
					maxImageBytes={data.maxImageBytes}
					error={uploadError}
					bind:input={fileInput}
					on:change={onFileChange}
				>
					<svelte:fragment slot="before">
						{#if uploadExt}
							<p class="hint">Nueva imagen: {uploadName}</p>
						{:else if image.shared}
							<p class="hint">
								Usa una imagen compartida con otras ediciones: <code>{image.featured}</code>.
							</p>
						{:else if image.featured}
							<p class="hint">Usa una imagen propia (<code>{image.folder}</code>).</p>
						{/if}
						{#if askScope}
							<ImageScopeChoice
								bind:scope={imageScope}
								assetName={image.featured}
								newName={sharedNewName}
								ownFolder={image.folder}
								idPrefix="edit"
								invalid={problems.length > 0}
							/>
						{/if}
					</svelte:fragment>
					{#if !uploadExt}
						<p class="note" id="edit-image-where">
							{#if image.shared}
								📁 Si subís una imagen nueva, te vamos a preguntar si es para todas las ediciones de
								este evento o solo para esta.
							{:else}
								📁 Una imagen nueva se guarda solo para este evento (en <code>{image.folder}</code
								>).
							{/if}
						</p>
					{/if}
					{#if uploadExt}
						<p class="note" id="edit-image-case">
							{#if scope === 'todas'}
								🖼️ <strong>Todas las ediciones:</strong> se reemplaza la imagen compartida
								<code>{image.featured}</code>{#if sharedNewName !== image.featured}
									{' '}(pasa a llamarse <code>{sharedNewName}</code>; se borra la vieja y se
									actualizan los eventos que la usaban){/if}.
							{:else if askScope && !imageScope}
								Elegí arriba si es para todas las ediciones o solo para esta.
							{:else}
								📁 <strong>Solo este evento:</strong> se guarda como
								<code>{image.folder}{image.nextNumber}.{uploadExt}</code>{#if image.shared}; la
									imagen compartida y los otros eventos no cambian{/if}.
							{/if}
						</p>
						{#if scope === 'todas'}
							<div class="affected" id="edit-affected">
								{#if affected}
									<p>
										<strong
											>{affected.length === 1
												? 'Este evento usa'
												: `Estos ${affected.length} eventos usan`} la imagen compartida y van a mostrar
											la nueva{sharedNewName !== image.featured
												? ' (se actualiza su archivo)'
												: ''}:</strong
										>
									</p>
									<ul>
										{#each affected as ev}
											<li>
												{#if ev.slug === postID}
													<strong>{ev.title || ev.slug}</strong> (este)
												{:else}
													<a href="/calendario/{ev.slug}" target="_blank" rel="noreferrer"
														>{ev.title || ev.slug}</a
													>
												{/if}
												<small>{ev.start.slice(0, 10)}</small>
											</li>
										{/each}
									</ul>
								{:else if affectedError}
									<p>{affectedError}</p>
								{:else}
									<p>Buscando los eventos que usan esta imagen…</p>
								{/if}
							</div>
						{/if}
						<button type="button" class="link" on:click={clearUpload}>No cambiar la imagen</button>
					{/if}
				</ImageSection>
			{/if}

			<TagsSection
				{category}
				usage={data.tagUsage}
				bind:tagRules
				bind:freeTags
				errors={tagErrors}
				idPrefix="edit"
				placeholder={isEvent
					? 'Buscá una etiqueta: taller, shibari, cine…'
					: 'Buscá una etiqueta: BDSM, shibari, guía…'}
			/>

			{#if isEvent}
				<TicketsEditor
					bind:state={tickets}
					{tags}
					location={values.location}
					sales={data.sales}
					salesUnavailable={data.salesUnavailable}
					errors={ticketsCheck.errors}
					warnings={ticketsCheck.warnings}
					idPrefix="edit"
				/>
			{/if}

			<fieldset class="card" id="sec-texto">
				<legend>📄 Texto de la página</legend>
				<p class="hint">
					Formato: <code>## Título</code>, <code>- lista</code>, <code>**negrita**</code>.
				</p>
				<div class="editor">
					<CodeMirror lineWrapping tabSize={4} bind:value={body} lang={markdown()} />
				</div>
			</fieldset>
		{/if}

		{#if problems.length}
			<div class="problems" role="alert">
				<strong>Antes de guardar:</strong>
				<ul>
					{#each problems as p}<li>{p}</li>{/each}
				</ul>
			</div>
		{/if}
		{#if form?.error}
			<p class="error" role="alert">{form.error}</p>
		{/if}
		{#if form?.save}
			<p class="note" role="status">
				✅ {form.save}
				{new Date().toLocaleString('es-AR')}
				{#if form.imageScope === 'todas'}
					· La imagen nueva reemplazó a la compartida para todas las ediciones{#if form.affected?.length}
						{' '}({form.affected.length}
						{form.affected.length === 1 ? 'evento más' : 'eventos más'}){/if}.
				{:else if form.imageScope === 'esta'}
					· La imagen nueva se guardó solo para este evento.
				{/if}
				<br /><PublishStatus pr={form.publish} />
			</p>
		{/if}

		<FilePreview {content} />

		<small class="later"
			>Al guardar, el cambio pasa por las pruebas automáticas y se publica solo: tarda unos minutos
			(normalmente menos de 15) en verse. Si pasa más tiempo, avisale a
			<a href="https://t.me/Gorro_Rojo">@Gorro_Rojo</a>.</small
		>
		<form
			method="POST"
			action="?/save"
			class="bar sticky"
			id="edit-form"
			enctype="multipart/form-data"
		>
			<textarea hidden name="content" value={content}></textarea>
			<input type="hidden" name="imageScope" value={askScope ? imageScope : ''} />
			<input type="hidden" name="sha" value={sha} />
			<input type="hidden" name="eol" value={lineEndingOf(data.post.raw)} />
			<input type="hidden" name="path" value={path} />
			{#if problems.length}<small class="blocked">Revisá «Antes de guardar», más arriba.</small
				>{/if}
			<button
				type="submit"
				class="button"
				id="save"
				disabled={!content || problems.length > 0 || !changed}
				title={!changed ? 'No hay cambios' : undefined}>Guardar</button
			>
		</form>
	</EventForm>
</svelte:element>

<style lang="scss">
	/* Shared form look: $lib/components/admin/admin.scss (class kv-admin). */
	.editor {
		border-radius: 0.8em;
		outline: 1px solid var(--1-light);
		overflow: hidden;
		/* Con fallback para /edit (fuera del panel); en el panel valen los tokens (claro y oscuro). */
		:global(.cm-editor) {
			max-height: 40rem;
			background: var(--surface, white);
			color: var(--text, #333);
		}
	}
	.affected {
		background: var(--warn-bg, #fff8e1);
		color: var(--text, inherit);
		border-radius: 1em;
		padding: 0.6em 1em;
		align-self: stretch;
		p {
			margin: 0 0 0.3em;
		}
		ul {
			margin: 0;
			padding-left: 1.2em;
			max-height: 16em;
			overflow: auto;
		}
		small {
			opacity: 0.7;
			margin-left: 0.3em;
		}
	}
	textarea.raw {
		font-family: monospace;
		font-size: var(--step--1);
	}
	.later {
		display: block;
		margin-top: 1em;
	}
	.blocked {
		flex: 1 1 12em;
		color: var(--bad, #b00020);
	}
</style>
