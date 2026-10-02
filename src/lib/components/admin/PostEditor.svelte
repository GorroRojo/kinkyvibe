<script>
	import { applyAction, deserialize, enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { tick } from 'svelte';
	import ImageScopeChoice from '$lib/components/admin/ImageScopeChoice.svelte';
	import ImageSection from '$lib/components/admin/event-form/ImageSection.svelte';
	import FilePreview from '$lib/components/admin/event-form/FilePreview.svelte';
	import { PERSONAS_KEY } from '$lib/utils/personas.js';
	import { authorRoleOf, validatePersonaItems } from '$lib/utils/personasList.js';
	import {
		ADD_ROLE_ACTION,
		formPersonas,
		formPersonasChanges,
		personaOptions,
		restorePeople
	} from '$lib/utils/personasPicker.js';
	import TicketsEditor from '$lib/components/admin/TicketsEditor.svelte';
	import EventForm from '$lib/components/admin/event-form/EventForm.svelte';
	import BodySection from '$lib/components/admin/event-form/BodySection.svelte';
	import DatosSection from '$lib/components/admin/event-form/DatosSection.svelte';
	import PersonasSection from '$lib/components/admin/event-form/PersonasSection.svelte';
	import ScheduleSection from '$lib/components/admin/event-form/ScheduleSection.svelte';
	import TagsSection from '$lib/components/admin/event-form/TagsSection.svelte';
	import { draftKey } from '$lib/admin/draft.js';
	import { formSections } from '$lib/admin/eventForm.js';
	import { editEventImage, emptyUpload } from '$lib/admin/imageState.js';
	import {
		datosFieldId,
		datosFields,
		fromInput,
		postFields,
		toInput
	} from '$lib/admin/postFields.js';
	import {
		scheduleFromInputs,
		scheduleProblems,
		scheduleSpan,
		scheduleSummary,
		scheduleToInputs
	} from '$lib/admin/schedule.js';
	import { checkMapLink } from '$lib/utils/eventPlace.js';
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
		todayInArgentina
	} from '$lib/utils/eventDraft.js';
	import PublishStatus from '$lib/components/admin/PublishStatus.svelte';
	import SaveButton from '$lib/components/admin/event-form/SaveButton.svelte';
	import SaveStatus from '$lib/components/admin/event-form/SaveStatus.svelte';
	import { saveCopy, savedSummary } from '$lib/admin/saveCopy.js';
	import { parseDocument } from 'yaml';
	import { lineEndingOf } from '$lib/utils/lineEndings.js';

	/**
	 * Editor de publicaciones (datos + imagen + etiquetas + entradas + texto en markdown). Lo usan
	 * /edit/<categoría>/<slug> y, dentro del panel, la pestaña Editar de la ficha de un evento
	 * (`embedded`: sin el título ni el link de volver, que pone la ficha).
	 *
	 * Guarda con `use:enhance`: mientras guarda, «Guardar» queda apagado con «Guardando…»; al
	 * terminar bien, vuelve a leer la página (`invalidateAll`) y las páginas que lo usan lo arman
	 * de nuevo con el archivo guardado (`{#key data.post}`), como cuando la página se recargaba.
	 * Los textos dependen de si guardar va a la base (`data.savesToDb`, $lib/admin/saveCopy.js).
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
	/** Con el interruptor `contenido_db`, este post se guarda en la base (se ve enseguida). */
	const copy = saveCopy(data.savesToDb);

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
	// Todos los campos (para armar el archivo) y los que se muestran en «Datos»: Empieza y Termina
	// van en «¿Cuándo es?».
	const fields = postFields(category);
	const shownFields = datosFields('editar', category);
	/** El «Dónde» del archivo: con un lugar en «Sucede en», no se muestra en el sitio. */
	const MD_PLACE_KEYS = ['location', 'location_map', 'location_name'];
	/** @type {string | null} */
	const linkedVenue = category === 'calendario' ? (data.linkedVenue ?? null) : null;
	/** @type {Record<string, string>} */
	const fieldWarnings = linkedVenue
		? Object.fromEntries(
				MD_PLACE_KEYS.map((key) => [
					key,
					`Este evento tiene un lugar en «Sucede en» (${linkedVenue}): en el sitio se muestra ese lugar según su privacidad, no este dato. Se guarda igual.`
				])
			)
		: {};

	/** @type {Record<string, any>} */
	const initial = Object.fromEntries(fields.map((f) => [f.key, toInput(f, meta[f.key])]));
	// Existing behavior: saving marks the post as updated today. Set in the initializer, not
	// with a later `values.updated_date = …`: Svelte 5 (legacy mode) compiles that statement
	// with a reference to the `f` of the `bind:value={values[f.key]}` loop below and crashes.
	/** @type {Record<string, any>} */
	let values = { ...initial, updated_date: todayInArgentina() };

	/* ---------- fecha y hora (eventos): la misma sección que al crear ---------- */
	const today = todayInArgentina();
	// Día y hora por separado; vuelven a `start` / `end` con el mismo formato de `toInput`, así que
	// si no se tocan, no cambian en el archivo.
	let schedule = scheduleFromInputs(initial.start ?? '', initial.end ?? '');
	let span = scheduleSpan(schedule);
	let month = (schedule.startDate || today).slice(0, 7);
	/** @type {ScheduleSection | undefined} */
	let scheduleSection;
	$: allValues = isEvent ? { ...values, ...scheduleToInputs(schedule) } : values;
	$: scheduleInfo = scheduleSummary(schedule);

	// «Link al mapa»: como al crear, pero solo si se cambió (lo que el archivo ya tenía no bloquea).
	$: mapError =
		isEvent && values.location_map !== initial.location_map
			? (() => {
					const check = checkMapLink(values.location_map);
					return check.ok ? '' : check.message;
				})()
			: '';

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

	/* ---------- personas: quienes organizan o escriben y el resto, en una sola lista ---------- */
	// `data.personas` ({ roles, profiles }) llega solo con el interruptor personas_eventos. Apagado,
	// la sección es el «Organizan» / «Autores» de siempre (sin roles) y `personas:` no se toca. Se
	// guarda en `authors:` y `personas:` como siempre ($lib/utils/personasPicker.js); en la base,
	// como una sola lista.
	/** @type {{ roles: string[], profiles: import('$lib/utils/personasPicker.js').DbProfile[] } | null} */
	const personasData = hasAuthors ? (data.personas ?? null) : null;
	const authorRole = authorRoleOf(category);
	let roles = personasData ? [...personasData.roles] : [authorRole];
	const initialPeople =
		hasAuthors && !parseError
			? formPersonas(list(meta.authors), meta[PERSONAS_KEY], category, {
					withPersonas: Boolean(personasData),
					options: personaOptions(
						data.profiles ?? [],
						personasData?.profiles ?? [],
						data.authorUsage ?? {}
					)
				})
			: [];
	let people = initialPeople.map((it) => ({ ...it }));
	/**
	 * @param {typeof people} items
	 * @param {string[]} r
	 */
	const peopleErrors = (items, r) =>
		hasAuthors && !parseError ? validatePersonaItems(items, r) : [];
	// Como con las entradas: lo que el archivo ya tenía mal no bloquea guardar otros cambios.
	const initialPeopleErrors = peopleErrors(initialPeople, roles);
	$: newPeopleErrors = peopleErrors(people, roles).filter((e) => !initialPeopleErrors.includes(e));

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
	/** La imagen elegida (ImageSection la revisa y suelta su URL). */
	let upload = emptyUpload();
	/** @type {ImageSection | undefined} */
	let imageSection;
	/** @type {''|'todas'|'esta'} */
	let imageScope = '';
	/** @type {Array<{slug: string, title: string, start: string}> | null} */
	let affected = null;
	let affectedError = '';
	$: ({
		askScope,
		scope,
		sharedNewName,
		newFeatured,
		problem: scopeProblem
	} = editEventImage({
		image,
		upload,
		imageScope
	}));
	$: if (askScope && scope === 'todas' && affected === null && !affectedError) loadAffected();

	function clearUpload() {
		imageSection?.clear();
		imageScope = '';
	}

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
	$: problems = parseError
		? []
		: /** @type {string[]} */ (
				[
					...shownFields
						.filter((f) => f.required && !values[f.key])
						.map((f) => `Falta «${f.label}».`),
					...(isEvent ? scheduleProblems(schedule) : []),
					mapError,
					upload.error,
					scopeProblem,
					...tagErrors,
					...newTicketErrors.map((e) => `Entradas: ${e}`),
					...newPeopleErrors
				].filter(Boolean)
			);

	$: content = parseError ? rawText : build(allValues, tags, people, body, newFeatured, tickets);
	/**
	 * @param {Record<string, any>} v
	 * @param {string[]} t
	 * @param {typeof people} ps las personas (van a `authors:` y, con el interruptor, `personas:`)
	 * @param {string} b
	 * @param {string} [featured] new `featured` ('' = unchanged); the server sets the final one
	 * @param {typeof tickets} [tk] ticket sales form (events only)
	 */
	function build(v, t, ps, b, featured = '', tk = initialTickets) {
		/** @type {Record<string, any>} */
		const changes = {};
		for (const f of fields) {
			if (v[f.key] !== initial[f.key] || f.key === 'updated_date')
				changes[f.key] = fromInput(f, v[f.key]);
		}
		if (t.join('\n') !== initialTags.join('\n')) changes.tags = t;
		if (hasAuthors)
			Object.assign(
				changes,
				formPersonasChanges(initialPeople, ps, category, {
					withPersonas: Boolean(personasData),
					remove: REMOVE
				})
			);
		if (featured) changes.featured = /^\d+$/.test(featured) ? Number(featured) : featured;
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
				// (No `allValues`: los `$:` todavía no corrieron.)
				isEvent ? { ...values, ...scheduleToInputs(schedule) } : values,
				isEvent ? joinEventTags({ ...tagRules, rest: freeTags }) : freeTags,
				initialPeople,
				body
			);
	$: changed = content !== unchanged || Boolean(upload.ext);

	/* ---------- unsaved changes (local draft + warning before leaving) ---------- */
	// La imagen elegida no entra en el borrador (es un archivo): el resto sí.
	$: draft = { schedule, values, tagRules, freeTags, people, tickets, body, rawText };
	/** @param {any} d */
	function restoreDraft(d) {
		if (!d || typeof d !== 'object') return;
		if (d.values) values = { ...values, ...d.values };
		if (isEvent && d.schedule && typeof d.schedule === 'object') {
			schedule = { ...schedule, ...d.schedule };
			if (schedule.startDate) month = schedule.startDate.slice(0, 7);
			// Que el día de fin recuperado no se recalcule desde el de inicio.
			tick().then(() => scheduleSection?.resync());
		}
		if (d.tagRules) tagRules = { ...tagRules, ...d.tagRules };
		if (Array.isArray(d.freeTags)) freeTags = d.freeTags;
		people = restorePeople(d, people, authorRole);
		if (d.tickets) tickets = d.tickets;
		if (typeof d.body === 'string') body = d.body;
		if (typeof d.rawText === 'string') rawText = d.rawText;
	}

	/* ---------- guardar ---------- */
	let saving = false;
	/** La confirmación de la barra: hasta que se vuelve a cambiar algo. */
	$: savedMessage =
		form?.save && !changed && !saving
			? savedSummary({ savedToDb: form.savedToDb, pr: form.publish })
			: '';

	/** @type {import('@sveltejs/kit').SubmitFunction} */
	function submitSave({ cancel }) {
		// Un solo envío a la vez (y nada que guardar si está bloqueado).
		if (saving || !content || problems.length > 0 || !changed) {
			cancel();
			return;
		}
		saving = true;
		return async ({ result, update }) => {
			try {
				if (result.type === 'success') {
					// Primero el resultado (borra el borrador), después el archivo guardado.
					await applyAction(result);
					await invalidateAll();
				} else {
					await update({ reset: false });
				}
			} finally {
				saving = false;
			}
		};
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
			hasPersonas: hasAuthors,
			parseError: !!parseError
		})}
		draftKey={draftKey(category, postID)}
		base={sha}
		dirty={changed}
		snapshot={draft}
		restore={restoreDraft}
		saved={Boolean(form?.save)}
		{saving}
	>
		{#if parseError}
			<p class="problems" role="alert">
				Las propiedades de este archivo tienen un error de formato ({parseError}), así que se edita
				como texto. Revisá las líneas entre los <code>---</code>.
			</p>
			<textarea class="raw" bind:value={rawText} rows="30"></textarea>
		{:else}
			{#if isEvent}
				<ScheduleSection
					bind:this={scheduleSection}
					bind:values={schedule}
					bind:span
					bind:month
					{today}
					mode="editar"
					idPrefix="edit"
					scheduleText={scheduleInfo.text}
					scheduleError={scheduleInfo.error}
				/>
			{/if}

			<DatosSection
				fields={shownFields}
				idFor={datosFieldId('editar')}
				warnings={fieldWarnings}
				errors={mapError ? { location_map: mapError } : {}}
				bind:values
			/>

			{#if hasAuthors}
				<PersonasSection
					bind:items={people}
					bind:roles
					defaultRole={authorRole}
					{category}
					profiles={data.profiles}
					dbProfiles={personasData?.profiles ?? []}
					authorUsage={data.authorUsage}
					addRoleAction={personasData ? ADD_ROLE_ACTION : ''}
					errors={newPeopleErrors}
					idPrefix="edit-personas"
				/>
			{/if}

			{#if image}
				<ImageSection
					bind:this={imageSection}
					bind:upload
					src={upload.url || image.url}
					inputId="edit-image"
					form="edit-form"
					buttonText={upload.ext ? 'Elegir otra imagen' : 'Subir una imagen nueva'}
					maxImageBytes={data.maxImageBytes}
				>
					<svelte:fragment slot="before">
						{#if upload.ext}
							<p class="hint">Nueva imagen: {upload.name}</p>
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
					{#if !upload.ext}
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
					{#if upload.ext}
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
								<code>{image.folder}{image.nextNumber}.{upload.ext}</code>{#if image.shared}; la
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

			<BodySection bind:value={body} />
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
				<br />{#if form.savedToDb}Se ve enseguida en el sitio{#if form.publish}; la imagen nueva
						tarda unos minutos: <PublishStatus
							pr={form.publish}
						/>{:else}.{/if}{:else}<PublishStatus pr={form.publish} />{/if}
			</p>
		{/if}

		<FilePreview {content} savesToDb={data.savesToDb} />

		<small class="later" id="save-help"
			>{copy.editHelp}{#if copy.askGorrite}{' '}Si pasa más tiempo, avisale a
				<a href="https://t.me/Gorro_Rojo">@Gorro_Rojo</a>.{/if}</small
		>
		<form
			method="POST"
			action="?/save"
			class="bar sticky"
			id="edit-form"
			enctype="multipart/form-data"
			use:enhance={submitSave}
		>
			<textarea hidden name="content" value={content}></textarea>
			<input type="hidden" name="imageScope" value={askScope ? imageScope : ''} />
			<input type="hidden" name="sha" value={sha} />
			<input type="hidden" name="eol" value={lineEndingOf(data.post.raw)} />
			<input type="hidden" name="path" value={path} />
			{#if problems.length}<small class="blocked">Revisá «Antes de guardar», más arriba.</small
				>{/if}
			<SaveStatus {saving} message={savedMessage} />
			<SaveButton
				id="save"
				{saving}
				disabled={!content || problems.length > 0 || !changed}
				title={!changed && !saving ? 'No hay cambios' : undefined}>Guardar</SaveButton
			>
		</form>
	</EventForm>
</svelte:element>

<style lang="scss">
	/* Shared form look: $lib/components/admin/admin.scss (class kv-admin). */
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
