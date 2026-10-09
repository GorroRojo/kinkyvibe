<script>
	import { argDateLog } from '$lib/utils/dates.js';
	import { applyAction, enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { tick } from 'svelte';
	import ImagePicker from '$lib/components/admin/ImagePicker.svelte';
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
	import PlaceSection from '$lib/components/admin/event-form/PlaceSection.svelte';
	import ScheduleSection from '$lib/components/admin/event-form/ScheduleSection.svelte';
	import TagsSection from '$lib/components/admin/event-form/TagsSection.svelte';
	import Notice from '$lib/components/ui/Notice.svelte';
	import { ONLINE_MISMATCH_TEXT, onlineTagMismatch } from '$lib/utils/onlineTagMismatch.js';
	import { draftKey } from '$lib/admin/draft.js';
	import { formSections } from '$lib/admin/eventForm.js';
	import {
		datosFieldId,
		datosFields,
		fromInput,
		postFields,
		splitPlaceFields,
		toInput
	} from '$lib/admin/postFields.js';
	import {
		NO_VENUE,
		sameVenueChoice,
		venueChoice,
		venueChoiceFields
	} from '$lib/utils/venueChoice.js';
	import {
		scheduleFromInputs,
		scheduleProblems,
		scheduleSpan,
		scheduleSummary,
		scheduleToInputs
	} from '$lib/admin/schedule.js';
	import { checkMapLink } from '$lib/utils/eventPlace.js';
	import { eventLinkProblem } from '$lib/utils/eventLink.js';
	import {
		applyTicketsToMarkdown,
		goalFields,
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
	/** Los eventos y el material se guardan en la base (se ven enseguida). */
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
	// En los eventos, el «Dónde» en texto libre va en «📍 Lugar», junto al lugar elegido.
	const { datos: datosShown, place: placeShown } = splitPlaceFields(shownFields, category);

	/* ---------- lugar (eventos): edge `lugar` del evento en la base, no en el archivo ---------- */
	/** @type {{ venues: any[], current: import('$lib/utils/venueChoice.js').VenueChoice } | null} */
	const venuePicker = category === 'calendario' ? (data.venuePicker ?? null) : null;
	const savedVenue = venuePicker?.current ?? NO_VENUE;
	let venue = { ...savedVenue };
	$: venueChanged = Boolean(venuePicker) && !sameVenueChoice(venue, savedVenue);

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

	// «Link de inscripción»: web, mail (mailto:) o página del sitio; nunca javascript: ni otros
	// esquemas (eventLink.js). Como el mapa, solo si se cambió.
	$: linkError = (() => {
		if (!isEvent || values.link === initial.link) return '';
		const link = String(values.link ?? '').trim();
		const problem = link ? eventLinkProblem(link) : null;
		return problem ? `Link de inscripción: ${problem}.` : '';
	})();

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
	// Etiqueta «Online» y además un lugar (elegido o en texto libre): solo avisa, no bloquea
	// guardar ($lib/utils/onlineTagMismatch.js).
	$: onlineMismatch =
		isEvent &&
		onlineTagMismatch(
			{ tags, location: values.location, location_name: values.location_name },
			{ hasVenue: venue.venueId != null }
		);

	const hasAuthors = category !== 'amigues';

	/* ---------- personas: quienes organizan o escriben y el resto, en una sola lista ---------- */
	// `data.personas` ({ roles, profiles }) llega con base. Sin base,
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
	// Los errores de entradas se muestran al salir de un campo o al tocar Guardar, no apenas se
	// prende la venta (TicketsEditor).
	let ticketsTouched = false;
	$: hiddenTicketErrors = ticketsTouched ? [] : newTicketErrors;

	/* ---------- image (events only) ---------- */
	// El selector de imágenes (docs/imagenes.md): la imagen elegida va como edge `portada` en el
	// mismo guardado; al elegir o sacar una, se saca también la vieja del repo (`featured`).
	const image = data.image;
	/** @type {import('$lib/server/media/library.js').PublicImage | null} */
	let pickedImage = data.image?.current ?? null;
	let imageTouched = false;

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
					linkError,
					...tagErrors,
					...(ticketsTouched ? newTicketErrors : []).map((e) => `Entradas: ${e}`),
					...newPeopleErrors
				].filter(Boolean)
			);

	$: content = parseError ? rawText : build(allValues, tags, people, body, imageTouched, tickets);
	/**
	 * @param {Record<string, any>} v
	 * @param {string[]} t
	 * @param {typeof people} ps las personas (van a `authors:` y, con el interruptor, `personas:`)
	 * @param {string} b
	 * @param {boolean} [dropFeatured] se eligió o se sacó una imagen en el selector: la vieja del
	 *   repo (`featured`) se saca (la imagen pasa a ser el edge `portada`)
	 * @param {typeof tickets} [tk] ticket sales form (events only)
	 */
	function build(v, t, ps, b, dropFeatured = false, tk = initialTickets) {
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
		if (dropFeatured) changes.featured = REMOVE;
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
	// Cambiar solo el «Lugar» también se guarda, por el mismo camino que cualquier cambio: el
	// archivo va con la fecha de «Actualizado» de hoy (decisión de gorrite), y nada más.
	$: changed = content !== unchanged || imageTouched || venueChanged;

	/* ---------- unsaved changes (local draft + warning before leaving) ---------- */
	// La imagen elegida no entra en el borrador: el resto sí.
	$: draft = { schedule, values, tagRules, freeTags, people, tickets, body, rawText, venue };
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
		if (d.tickets) tickets = { ...goalFields(undefined), ...d.tickets };
		if (typeof d.body === 'string') body = d.body;
		if (typeof d.rawText === 'string') rawText = d.rawText;
		if (venuePicker && d.venue && typeof d.venue === 'object')
			venue = venueChoice(d.venue.venueId, d.venue.privacy);
	}

	/* ---------- guardar ---------- */
	let saving = false;
	/** La confirmación de la barra: hasta que se vuelve a cambiar algo. */
	$: savedMessage =
		form?.save && !changed && !saving
			? savedSummary({ savedToDb: form.savedToDb, pr: form.publish })
			: '';

	/** Lleva a «Antes de guardar» (puede estar arriba o abajo de la barra fija). */
	function focusProblems() {
		const box = document.getElementById('save-problems');
		box?.scrollIntoView({ behavior: 'smooth', block: 'center' });
	}

	/** @type {import('@sveltejs/kit').SubmitFunction} */
	function submitSave({ cancel }) {
		// Un solo envío a la vez (y nada que guardar si está bloqueado).
		if (saving || !content || problems.length > 0 || !changed) {
			cancel();
			return;
		}
		if (hiddenTicketErrors.length) {
			// Guardar con errores de entradas todavía sin mostrar: se muestran y no se guarda.
			ticketsTouched = true;
			cancel();
			tick().then(() => focusProblems());
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
			hasPartes: Boolean($$slots.extra) && category === 'calendario',
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
				fields={datosShown}
				idFor={datosFieldId('editar')}
				errors={linkError ? { link: linkError } : {}}
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

			{#if isEvent}
				<PlaceSection
					picker={venuePicker}
					bind:choice={venue}
					fields={placeShown}
					idFor={datosFieldId('editar')}
					errors={mapError ? { location_map: mapError } : {}}
					bind:values
					idPrefix="edit"
				/>
			{/if}

			{#if image}
				<ImagePicker
					bind:value={pickedImage}
					legacyUrl={image.legacyUrl}
					target={image.target}
					contextLabel="De este evento"
					idPrefix="edit-image"
					form="edit-form"
					canDelete
					on:change={() => (imageTouched = true)}
				/>
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
			>
				<svelte:fragment slot="before">
					{#if onlineMismatch}
						<div class="online-mismatch" id="edit-online-mismatch">
							<Notice tone="warn">⚠️ {ONLINE_MISMATCH_TEXT}</Notice>
						</div>
					{/if}
				</svelte:fragment>
			</TagsSection>

			{#if isEvent}
				<TicketsEditor
					bind:state={tickets}
					{tags}
					location={values.location}
					sales={data.sales}
					salesUnavailable={data.salesUnavailable}
					transferReady={data.transferReady ?? null}
					errors={ticketsCheck.errors}
					bind:touched={ticketsTouched}
					warnings={ticketsCheck.warnings}
					idPrefix="edit"
				/>
			{/if}

			<BodySection bind:value={body} />

			<!-- Algo que se guarda por su cuenta (Partes de un taller), en la misma columna. -->
			<slot name="extra" />
		{/if}

		{#if problems.length}
			<div class="problems" role="alert" id="save-problems">
				<strong>Antes de guardar:</strong>
				<ul>
					{#each problems as p}<li>{p}</li>{/each}
				</ul>
			</div>
		{/if}
		{#if form?.error}
			<p class="error" role="alert">{form.error}</p>
		{/if}
		{#each form?.warnings ?? [] as warning}
			<p class="warning" role="alert">⚠️ {warning}</p>
		{/each}
		{#if form?.save}
			<p class="note" role="status">
				✅ {form.save}
				{argDateLog(new Date())}
				<br />{#if form.savedToDb}Se ve enseguida en el sitio.{:else}<PublishStatus
						pr={form.publish}
					/>{/if}
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
			<input type="hidden" name="sha" value={sha} />
			<input type="hidden" name="eol" value={lineEndingOf(data.post.raw)} />
			<input type="hidden" name="path" value={path} />
			{#each Object.entries(venueChoiceFields(venue, venueChanged)) as [name, value] (name)}
				<input type="hidden" {name} {value} />
			{/each}
			{#if problems.length}<small class="blocked"
					><button type="button" class="link" on:click={focusProblems}
						>Revisá «Antes de guardar»</button
					></small
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
	textarea.raw {
		font-family: monospace;
		font-size: var(--step--1);
	}
	.online-mismatch {
		margin-block: var(--space-xs);
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
