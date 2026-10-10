<script>
	import Notice from '$lib/components/ui/Notice.svelte';
	import SectionHeading from '$lib/components/admin/event-form/SectionHeading.svelte';
	import { Repeat } from '@lucide/svelte';
	import { checkMapLink, eventPlace } from '$lib/utils/eventPlace.js';
	import { publishWarnings } from '$lib/utils/eventMissing.js';
	import { eventHref } from '$lib/admin/nav.js';
	import { focusField, isProblem, scheduleField } from '$lib/admin/formProblems.js';
	import FormProblems from '$lib/components/admin/event-form/FormProblems.svelte';
	import { eventLinkProblem } from '$lib/utils/eventLink.js';
	import { enhance, applyAction, deserialize } from '$app/forms';
	import { tick } from 'svelte';
	import PostListItem from '$lib/components/PostListItem.svelte';
	import ImagePicker from '$lib/components/admin/ImagePicker.svelte';
	import ScheduleSection from '$lib/components/admin/event-form/ScheduleSection.svelte';
	import FilePreview from '$lib/components/admin/event-form/FilePreview.svelte';
	import TicketsEditor from '$lib/components/admin/TicketsEditor.svelte';
	import PublishStatus from '$lib/components/admin/PublishStatus.svelte';
	import SaveButton from '$lib/components/admin/event-form/SaveButton.svelte';
	import SaveStatus from '$lib/components/admin/event-form/SaveStatus.svelte';
	import { saveCopy, savedSummary } from '$lib/admin/saveCopy.js';
	import { announce } from '$lib/admin/announce.js';
	import EventForm from '$lib/components/admin/event-form/EventForm.svelte';
	import BodySection from '$lib/components/admin/event-form/BodySection.svelte';
	import DatosSection from '$lib/components/admin/event-form/DatosSection.svelte';
	import PlaceSection from '$lib/components/admin/event-form/PlaceSection.svelte';
	import TagsSection from '$lib/components/admin/event-form/TagsSection.svelte';
	import PersonasSection from '$lib/components/admin/event-form/PersonasSection.svelte';
	import { personasToMd, validatePersonaItems } from '$lib/utils/personasList.js';
	import {
		ADD_ROLE_ACTION,
		formPersonas,
		personaOptions,
		personaView,
		restorePeople
	} from '$lib/utils/personasPicker.js';
	import { draftKey } from '$lib/admin/draft.js';
	import { formSections } from '$lib/admin/eventForm.js';
	import { datosFieldId, datosFields, splitPlaceFields } from '$lib/admin/postFields.js';
	import {
		NO_VENUE,
		sameVenueChoice,
		venueChoice,
		venueChoiceFields,
		venueChoiceText
	} from '$lib/utils/venueChoice.js';
	import { scheduleProblems, scheduleSpan, scheduleSummary } from '$lib/admin/schedule.js';
	import DuplicateChooser from '$lib/components/admin/DuplicateChooser.svelte';
	import { applyNewEventPrefill } from '$lib/utils/calendario.js';
	import '$lib/components/admin/admin.scss';
	import '$lib/admin/panel-editor.scss';
	import { tagManager } from '$lib/utils/stores';
	import { joinEventTags, splitEventTags, validateEventTags } from '$lib/utils/adminTags.js';
	import { formatARS } from '$lib/utils/money.js';
	import {
		applyTicketsToMarkdown,
		describeTicketsForm,
		readTicketsForm,
		validateTicketsForm,
		goalFields
	} from '$lib/utils/ticketsEditor.js';
	import { parseDocument } from 'yaml';
	import {
		STATUS_OPTIONS,
		buildEventMarkdown,
		deriveSlug,
		describeSchedule,
		formFromSource,
		isValidDate,
		parseEventDate,
		prefillMonth,
		readEventFields,
		slugify,
		splitList,
		splitMarkdown,
		uniqueSlug,
		validateSlug
	} from '$lib/utils/eventDraft.js';

	/** @type {import('./$types').PageData} */
	export let data;
	/** @type {import('./$types').ActionData} */
	export let form;

	/** El evento se guarda en la base y se ve enseguida. */
	const copy = saveCopy(data.savesToDb);

	// «¿Es parte de una serie?» al duplicar un evento que no está en ninguna: crear una serie nueva con el nombre sugerido, agregarlo a una que existe o no.
	const seriesPrompt = data.seriesPrompt;
	/** @type {'' | 'crear' | 'agregar' | 'no'} */
	let seriesChoice = '';
	let seriesName = seriesPrompt?.suggested ?? '';
	let seriesExisting = '';
	let seriesMarkSource = true;

	const source = data.source;
	const sourceRaw = source?.raw ?? data.template;
	const sourceFields = readEventFields(splitMarkdown(sourceRaw).frontmatter);
	const originalSchedule = source ? describeSchedule(sourceFields.start, sourceFields.end) : '';

	let values = formFromSource(sourceRaw, { today: data.today, fromTemplate: !source });

	// Dates start empty so nobody publishes a copy with last month's date by accident.
	// The end date follows the start date, keeping the original event's length in days
	// (ScheduleSection). "21:00 to 01:00" on the same day is a common typo in old events: it means
	// the next day.
	let span = scheduleSpan(values, { fixSameDayTypo: true });
	values.startDate = '';
	values.endDate = '';
	// ...but the calendar opens on the month the copy most likely is: this month until the 15th,
	// next month from the 16th (Argentina time). The day is always picked by hand.
	let month = prefillMonth(data.today);
	// ...unless it comes from the agenda calendar (a day was clicked): then that day, and the
	// times if a range was picked in the week view (a copy keeps the original's times otherwise).
	({ values, span } = applyNewEventPrefill(values, span, data.prefill));
	if (data.prefill.date) month = data.prefill.date.slice(0, 7);
	const sourceStart = parseEventDate(sourceFields.start).date;
	const sourceWeekday =
		source && isValidDate(sourceStart)
			? new Date(sourceStart + 'T12:00:00Z').getUTCDay()
			: undefined;

	/* ---------- tags & organizers ---------- */
	const initialTags = splitEventTags(splitList(values.tags));
	let tagRules = {
		kinkyvibe: initialTags.kinkyvibe,
		language: initialTags.language,
		sign: initialTags.sign,
		place: initialTags.place,
		prices: initialTags.prices
	};
	let freeTags = initialTags.rest;
	$: values.tags = joinEventTags({ ...tagRules, rest: freeTags });
	$: tagErrors = validateEventTags(splitList(values.tags));
	/** @type {ScheduleSection | undefined} */
	let scheduleSection;
	/** «Datos»: los mismos campos que Editar, sin las fechas de publicación ni «No listado». */
	const shownFields = datosFields('nuevo');
	// El «Dónde» en texto libre va en «📍 Lugar», junto al lugar elegido.
	const { datos: datosShown, place: placeShown } = splitPlaceFields(shownFields);

	/* ---------- lugar: edge `lugar` del evento (no en el archivo), después de crear el evento ---------- */
	const venuePicker = data.venuePicker ?? null;
	/** Los lugares (más los que se crean desde el formulario). */
	let venues = venuePicker?.venues ?? [];
	// Al duplicar, el lugar del evento original.
	let venue = venuePicker ? { ...venuePicker.current } : { ...NO_VENUE };
	$: venueTouched = Boolean(venuePicker) && !sameVenueChoice(venue, NO_VENUE);

	/* ---------- tickets ---------- */
	// Se copian del evento original (un evento nuevo arranca sin venta). Sin ventas que cuidar:
	// es un evento nuevo.
	const sourceMeta = parseDocument(splitMarkdown(sourceRaw).frontmatter).toJS() ?? {};
	const initialTickets = readTicketsForm(sourceMeta);
	let tickets = readTicketsForm(sourceMeta);
	$: ticketsCheck = validateTicketsForm(tickets);

	/* ---------- personas: quienes organizan y el resto, en una sola lista ---------- */
	// Como en Editar: `data.personas` ({ roles, profiles }) llega con base; sin base,
	// es el «Organizan» de siempre y `personas:` (de un evento que se
	// duplica) queda como está. Se escribe en `authors:` y `personas:` ($lib/utils/personasList.js).
	/** @type {{ roles: string[], profiles: import('$lib/utils/personasPicker.js').DbProfile[] } | null} */
	const personasData = data.personas ?? null;
	let roles = personasData ? [...personasData.roles] : ['Organiza'];
	const dbProfiles = personasData?.profiles ?? [];
	let people = formPersonas(splitList(values.authors), sourceMeta.personas, 'calendario', {
		withPersonas: Boolean(personasData),
		options: personaOptions(data.profiles ?? [], dbProfiles, data.authorUsage ?? {})
	});
	$: peopleMd = personasToMd(people, 'calendario');
	$: values.authors = peopleMd.authors;
	$: values.personas = personasData ? peopleMd.personas : undefined;
	// Como lo demás de crear: todo lo que se ve tiene que estar bien para publicar.
	$: peopleErrors = validatePersonaItems(people, roles);
	const dbBySlug = new Map(dbProfiles.map((p) => [p.slug, p]));
	$: peopleText = people
		.map((p) => {
			const label = personaView(p, 'calendario', data.profiles ?? [], dbBySlug).label;
			return personasData ? `${label} (${p.role})` : label;
		})
		.join(', ');

	/* ---------- slug ---------- */
	const taken = new Set(data.takenSlugs);
	let slug = '';
	let slugEdited = false;
	$: proposedSlug = !isValidDate(values.startDate)
		? ''
		: source
			? deriveSlug(source.slug, values.startDate)
			: values.title.trim()
				? `${slugify(values.title)}-${values.startDate.slice(0, 7)}`
				: '';
	$: if (!slugEdited) slug = proposedSlug ? uniqueSlug(proposedSlug, taken) : '';
	$: slugProblem = slug ? validateSlug(slug, taken) : null;
	/** Result of the last server check: {slug, error, suggestion} */
	let serverSlug = { slug: '', error: '', suggestion: '' };
	$: serverSlugError = serverSlug.slug === slug ? serverSlug.error : '';

	/** @param {Event} e */
	function onSlugInput(e) {
		slugEdited = true;
		// @ts-ignore
		slug = e.currentTarget.value.toLowerCase().replace(/\s+/g, '-');
	}
	function resetSlug() {
		slugEdited = false;
	}
	/** @param {string} s */
	function useSuggestion(s) {
		slugEdited = true;
		slug = s;
	}

	/* ---------- image ---------- */
	// El selector de imágenes (docs/imagenes.md): una de la biblioteca (edge `portada`), la del
	// evento original (al duplicar) o ninguna.
	/** La imagen de la biblioteca del original, si tiene. */
	const sourceImage = source?.image ?? null;
	const hasSourceImage = Boolean(source && (sourceImage || sourceFields.featured));
	/** @type {'keep'|'library'|'none'} */
	let featuredMode = hasSourceImage ? 'keep' : 'none';
	/** @type {import('$lib/server/media/library.js').PublicImage | null} */
	let pickedImage = null;
	/** Para volver a armar el selector al elegir «Usar la imagen del evento original». */
	let pickerKey = 0;
	$: previewImage =
		featuredMode === 'library'
			? pickedImage?.url
			: featuredMode === 'keep'
				? (source?.featuredUrl ?? undefined)
				: undefined;
	/** @param {CustomEvent<{ image: any }>} e */
	function onPick(e) {
		featuredMode = e.detail.image ? 'library' : 'none';
	}
	function useSourceImage() {
		featuredMode = 'keep';
		pickedImage = null;
		pickerKey += 1;
	}

	/* ---------- validation & generated file ---------- */
	$: ({ error: scheduleError, text: scheduleText } = scheduleSummary(values));

	// «Dónde»: el link al mapa es opcional, pero si está tiene que ser https de un sitio de mapas.
	$: mapCheck = checkMapLink(values.location_map);
	$: mapError = mapCheck.ok ? '' : mapCheck.message;
	// «Link de inscripción»: web, mail (mailto:) o página del sitio; nunca javascript: (eventLink.js).
	$: linkProblem = values.link?.trim() ? eventLinkProblem(values.link.trim()) : null;
	$: linkError = linkProblem ? `Link de inscripción: ${linkProblem}.` : '';

	// Cada problema con su campo: el resumen linkea a cada uno y el primero recibe el foco.
	/** @type {import('$lib/admin/formProblems.js').Problem[]} */
	let problemItems = [];
	$: problemItems = /** @type {unknown[]} */ ([
		!values.title.trim() && { text: 'Falta el título.', field: 'ev-title' },
		...scheduleProblems(values).map((text) => ({ text, field: scheduleField(text) })),
		!slug &&
			isValidDate(values.startDate) && {
				text: 'Falta la dirección de la página.',
				field: 'ev-slug'
			},
		slugProblem && { text: slugProblem, field: 'ev-slug' },
		serverSlugError && { text: serverSlugError, field: 'ev-slug' },
		mapError && { text: mapError, field: 'ev-location-map' },
		linkError && { text: linkError, field: 'ev-link' },
		...tagErrors.map((text) => ({ text, field: 'ev-tags' })),
		...peopleErrors.map((text) => ({ text, field: 'ev-authors' })),
		...ticketsCheck.errors.map((e) => ({ text: `Entradas: ${e}`, field: 'ev-tickets' }))
	]).filter(isProblem);
	$: problems = problemItems.map((p) => p.text);

	$: generated = build(values, featuredMode, problems.length, tickets, venue.venueId != null);
	/**
	 * @param {typeof values} v
	 * @param {'keep'|'library'|'none'} mode con una imagen de la biblioteca, el archivo no lleva
	 *   `featured` (la imagen es el edge `portada`)
	 * @param {number} nProblems
	 * @param {typeof tickets} tk
	 * @param {boolean} hasVenue con un lugar elegido, la venta es presencial (escribe `puerta`)
	 */
	function build(v, mode, nProblems, tk, hasVenue) {
		if (nProblems) return { md: '', error: '' };
		try {
			const md = buildEventMarkdown(sourceRaw, {
				...v,
				featuredMode: mode === 'keep' && !sourceImage ? 'keep' : 'none'
			});
			return { md: applyTicketsToMarkdown(md, tk, initialTickets, { hasVenue }), error: '' };
		} catch (e) {
			return { md: '', error: e instanceof Error ? e.message : String(e) };
		}
	}

	$: previewPost = generated.md ? makePreviewPost(generated.md, previewImage) : null;
	/**
	 * @param {string} md
	 * @param {string|undefined} image
	 */
	function makePreviewPost(md, image) {
		const m = readEventFields(splitMarkdown(md).frontmatter);
		return {
			path: '/calendario/' + slug,
			meta: {
				...m,
				tags: m.tags.map((t) => $tagManager.get(t)?.id ?? t),
				end: m.end || m.start,
				featured: image,
				published_date: values.publishedDate,
				category: 'calendario'
			}
		};
	}

	// «Lugar» de la revisión, sin lugar de la lista: lo que va a mostrar la página («Online» solo
	// si el evento es online; sin nada, «—»).
	$: reviewPlace = eventPlace({
		location: values.location,
		location_name: values.location_name,
		tags: splitList(values.tags),
		modalidad: tickets.enabled ? tickets.modalidad : ''
	}).text;

	// «Revisar antes de publicar»: los avisos de «Qué falta» de la agenda (no bloquean).
	$: reviewWarnings = publishWarnings({
		image: featuredMode !== 'none',
		summary: values.summary ?? '',
		location: values.location ?? '',
		locationName: values.location_name ?? '',
		tags: splitList(values.tags),
		modalidad: tickets.enabled ? tickets.modalidad : '',
		authors: splitList(values.authors),
		link: values.link ?? '',
		tickets: tickets.enabled && tickets.types.length > 0,
		status: values.status,
		venue: venue.venueId != null
	});

	/* ---------- steps ---------- */
	/** @type {'editar'|'revisar'} */
	let step = 'editar';
	let showProblems = false;
	let checking = false;
	let checkError = '';
	let confirming = false;
	let submitting = false;
	/** Qué botón mandó el formulario: «Guardar como no listado» o «Sí, publicar». */
	let submittingMode = '';
	let publishError = '';

	async function goToPreview() {
		showProblems = true;
		checkError = '';
		if (problems.length || generated.error) {
			await tick();
			// Al primer campo que falta (con el foco); si no se encuentra, al resumen.
			if (!focusField(problemItems[0]?.field ?? ''))
				document
					.querySelector('.problems')
					?.scrollIntoView({ behavior: 'smooth', block: 'center' });
			return;
		}
		checking = true;
		try {
			const body = new FormData();
			body.set('slug', slug);
			const response = await fetch('?/verificar', {
				method: 'POST',
				body,
				headers: { accept: 'application/json', 'x-sveltekit-action': 'true' }
			});
			/** @type {any} */
			const result = deserialize(await response.text());
			if (result.type === 'success') {
				step = 'revisar';
				confirming = false;
				publishError = '';
				window.scrollTo({ top: 0 });
			} else if (result.type === 'failure') {
				if (result.data?.slugError)
					serverSlug = {
						slug,
						error: result.data.slugError,
						suggestion: result.data.suggestion ?? ''
					};
				checkError = result.data?.error ?? '';
				await tick();
				document.querySelector('.problems, .check-error')?.scrollIntoView({ block: 'center' });
			} else if (result.type === 'error') {
				checkError = result.error?.message ?? 'Algo salió mal.';
			} else {
				await applyAction(result);
			}
		} catch (e) {
			checkError = 'No pudimos conectarnos con el sitio. ¿Tenés internet?';
		} finally {
			checking = false;
		}
	}

	function backToEdit() {
		step = 'editar';
		confirming = false;
		window.scrollTo({ top: 0 });
	}

	/** @type {import('@sveltejs/kit').SubmitFunction} */
	function submitForm({ cancel, submitter }) {
		// Un solo envío a la vez.
		if (submitting || step !== 'revisar' || !submitter || !generated.md) {
			cancel();
			return;
		}
		submitting = true;
		submittingMode = submitter instanceof HTMLButtonElement ? submitter.value : '';
		publishError = '';
		return async ({ result }) => {
			submitting = false;
			submittingMode = '';
			confirming = false;
			if (result.type === 'success')
				announce(
					'¡Listo! ' + savedSummary({ savedToDb: result.data?.savedToDb, pr: result.data?.publish })
				);
			if (result.type === 'failure') {
				publishError = String(result.data?.error ?? 'No se pudo guardar.');
				if (result.data?.slugError) {
					serverSlug = {
						slug,
						error: String(result.data.slugError),
						suggestion: String(result.data.suggestion ?? '')
					};
					step = 'editar';
				}
			} else if (result.type === 'error') {
				publishError = result.error?.message ?? 'Algo salió mal.';
			} else {
				published = true;
				await applyAction(result);
			}
			window.scrollTo({ top: 0 });
		};
	}

	/* ---------- unsaved changes (local draft + warning before leaving) ---------- */
	// Como en Editar: la imagen elegida no entra en el borrador (es un archivo); el resto sí.
	$: draft = {
		values,
		tagRules,
		freeTags,
		people,
		tickets,
		slug: slugEdited ? slug : '',
		slugEdited,
		venue
	};
	$: draftJSON = JSON.stringify(draft);
	/** Lo que hay al abrir la página (después de que corren los `$:` de arriba). */
	let pristine = '';
	$: if (!pristine) pristine = draftJSON;
	/** Se guardó: navegar a la página del evento no tiene que preguntar nada. */
	let published = false;
	$: dirty = !form?.success && draftJSON !== pristine;
	/** @param {any} d */
	function restoreDraft(d) {
		if (!d || typeof d !== 'object') return;
		if (d.values) {
			values = { ...values, ...d.values };
			// Que la fecha de fin recuperada no se recalcule desde la de inicio.
			tick().then(() => scheduleSection?.resync());
			if (isValidDate(values.startDate)) month = values.startDate.slice(0, 7);
		}
		if (d.tagRules) tagRules = { ...tagRules, ...d.tagRules };
		if (Array.isArray(d.freeTags)) freeTags = d.freeTags;
		people = restorePeople(d, people, 'Organiza');
		if (d.tickets) tickets = { ...goalFields(undefined), ...d.tickets };
		if (venuePicker && d.venue && typeof d.venue === 'object')
			venue = venueChoice(d.venue.venueId, d.venue.privacy);
		if (d.slugEdited && typeof d.slug === 'string') {
			slugEdited = true;
			slug = d.slug;
		}
	}

	/** Enter in a text field must not submit the form. @param {KeyboardEvent} e */
	function preventEnterSubmit(e) {
		// @ts-ignore
		if (e.key === 'Enter' && e.target?.tagName === 'INPUT') e.preventDefault();
	}
</script>

<svelte:head>
	<title>{source ? 'Duplicar evento' : 'Nuevo evento'} · KV Admin</title>
</svelte:head>

<main class="nuevo kv-admin">
	<p class="back"><a href="/admin/eventos">← Eventos</a></p>

	{#if data.mock}
		<p class="mock">
			🧪 Modo de prueba (<code>npm run dev:admin</code>): no se escribe nada en GitHub, los archivos
			se guardan en una carpeta temporal.
		</p>
	{/if}

	<EventForm
		sections={form?.success || step !== 'editar' ? [] : formSections({ mode: 'nuevo' })}
		draftKey={draftKey('nuevo', source?.slug ?? 'plantilla')}
		{dirty}
		snapshot={draft}
		restore={restoreDraft}
		saved={Boolean(form?.success)}
		saving={submitting || published}
	>
		{#if form?.success}
			<section class="done" aria-live="polite">
				<h1>¡Listo! 🎉</h1>
				<p>
					{#if form.mode === 'borrador'}
						El evento se guardó como <strong>no listado</strong>: no aparece en el calendario, pero
						se puede ver con el link.
					{:else if form.publish && form.publish.state !== 'merged' && !form.savedToDb}
						El evento se guardó y se <strong>publica</strong> solo cuando pasen las pruebas.
					{:else}
						El evento se <strong>publicó</strong>.
					{/if}
				</p>
				<p>
					{form.savedToDb
						? 'Ya está en'
						: form.publish
							? 'Cuando se publique va a estar en'
							: 'Va a estar en'}
					<a href={form.eventUrl} target="_blank" rel="noreferrer"
						><strong>kinkyvibe.ar{form.eventUrl}</strong></a
					>
				</p>
				{#if form.savedToDb}
					<p class="note" id="done-db">
						✅ Ya se ve en el sitio.{#if form.publish}{' '}La imagen copiada del original tarda unos
							minutos: <PublishStatus pr={form.publish} />{/if}
					</p>
				{:else}
					<p class="note">
						⏳ {#if form.publish}<PublishStatus pr={form.publish} />{:else}El sitio tarda unos
							minutos (normalmente entre 2 y 5) en actualizarse.{/if} Si el link da error al principio,
						esperá un poco y recargá. Si pasan más de 15 minutos, avisale a
						<a href="https://t.me/Gorro_Rojo">@Gorro_Rojo</a>.
					</p>
				{/if}
				{#if form.venueSaved}
					<p class="note" id="done-venue">📍 El lugar quedó elegido para el evento.</p>
				{/if}
				{#each form.warnings ?? [] as warning}
					<Notice tone="warn">{warning}</Notice>
				{/each}
				{#if form.savedToDb}
					<p class="small">
						Guardado en la base, con historial{#if form.publish}{' '}· La imagen va en el
							<a href={form.publish.url} target="_blank" rel="noreferrer"
								>PR #{form.publish.number}</a
							>{/if}.
					</p>
				{:else}<p class="small">
						{#if form.publish}Guardado en el <a
								href={form.publish.url}
								target="_blank"
								rel="noreferrer">PR #{form.publish.number}</a
							>{:else}Cambio guardado en GitHub: <a
								href={form.commitUrl}
								target="_blank"
								rel="noreferrer">ver el commit</a
							>{/if}
						· Archivos: {#each form.files ?? [] as f, i}<code>{f}</code>{i <
							(form.files?.length ?? 0) - 1
								? ', '
								: ''}{/each}
					</p>{/if}
				{#if form.savedToDb && form.slug}
					<p class="buttons" id="done-next">
						<a class="button" href={eventHref(form.slug)}>Abrir el evento</a>
						<a class="button secondary" href={eventHref(form.slug, 'editar')}>Seguir editando</a>
					</p>
				{/if}
				<p class="buttons">
					<a
						class="button"
						class:secondary={form.savedToDb && form.slug}
						href="/admin/eventos/nuevo"
						data-sveltekit-reload>Cargar otro evento</a
					>
					<a
						class="button secondary"
						href="/admin/eventos/nuevo?desde={form.slug}"
						data-sveltekit-reload>Duplicar este mismo</a
					>
				</p>
			</section>
		{:else}
			<h1>
				{#if source}Duplicar «{source.title}»{:else}Nuevo evento{/if}
			</h1>
			{#if !source}
				<DuplicateChooser compact candidates={data.duplicables ?? []} prefill={data.prefill} />
			{/if}
			<ol class="steps" aria-label="Pasos">
				<li class:current={step === 'editar'}>1. Completar datos</li>
				<li class:current={step === 'revisar'}>2. Revisar y publicar</li>
			</ol>

			<form
				method="POST"
				action="?/publicar"
				enctype="multipart/form-data"
				novalidate
				use:enhance={submitForm}
				on:keydown={preventEnterSubmit}
			>
				<input type="hidden" name="slug" value={slug} />
				<input type="hidden" name="source" value={source?.slug ?? ''} />
				<input type="hidden" name="featuredMode" value={featuredMode} />
				<textarea hidden name="content" value={generated.md}></textarea>
				{#each Object.entries(venueChoiceFields(venue, venueTouched)) as [name, value] (name)}
					<input type="hidden" {name} {value} />
				{/each}

				<!-- ======================= STEP 1 ======================= -->
				<div class="step" hidden={step !== 'editar'}>
					{#if source}
						<p class="hint">
							Copiamos todos los datos de <a
								href="/calendario/{source.slug}"
								target="_blank"
								rel="noreferrer">{source.title}</a
							>. Cambiá la fecha y revisá lo demás.
						</p>
					{/if}

					{#if seriesPrompt}
						<input type="hidden" name="seriesChoice" value={seriesChoice} />
						<fieldset class="card series-prompt">
							<legend class="with-icon"
								><Repeat size="1em" aria-hidden="true" /> ¿Es parte de una serie?</legend
							>
							<p class="hint">
								El evento original no está en ninguna serie. Si se repite, ponelo en una: así se
								numeran las ediciones y la gente puede pedir aviso.
							</p>
							<div class="choices">
								<label class="check">
									<input type="radio" bind:group={seriesChoice} value="crear" />
									Crear «{seriesName.trim() || 'serie nueva'}»
								</label>
								{#if seriesChoice === 'crear'}
									<label class="field sub">
										<span>Nombre de la serie</span>
										<input name="seriesName" bind:value={seriesName} maxlength="60" />
									</label>
								{/if}
								{#if seriesPrompt.existing.length}
									<label class="check">
										<input type="radio" bind:group={seriesChoice} value="agregar" />
										Agregar a una existente
									</label>
									{#if seriesChoice === 'agregar'}
										<label class="field sub">
											<span>Serie</span>
											<select name="seriesExisting" bind:value={seriesExisting}>
												<option value="" disabled>Elegí una</option>
												{#each seriesPrompt.existing as id (id)}<option value={id}>{id}</option
													>{/each}
											</select>
										</label>
									{/if}
								{/if}
								<label class="check">
									<input type="radio" bind:group={seriesChoice} value="no" />
									No
								</label>
							</div>
							{#if seriesChoice === 'crear' || seriesChoice === 'agregar'}
								<label class="check">
									<input type="checkbox" name="seriesMarkSource" bind:checked={seriesMarkSource} />
									También marcar el evento original
								</label>
								<p class="hint">La etiqueta de la serie se agrega al publicar.</p>
							{/if}
						</fieldset>
					{/if}

					<ScheduleSection
						bind:this={scheduleSection}
						bind:values
						bind:span
						bind:month
						today={data.today}
						hintWeekday={sourceWeekday}
						{originalSchedule}
						{scheduleText}
						{scheduleError}
						fromAgenda={Boolean(data.prefill.date)}
					/>

					<DatosSection
						fields={datosShown}
						idFor={datosFieldId('nuevo')}
						errors={linkError ? { link: linkError } : {}}
						bind:values
					/>

					<PersonasSection
						bind:items={people}
						bind:roles
						defaultRole="Organiza"
						category="calendario"
						profiles={data.profiles}
						{dbProfiles}
						authorUsage={data.authorUsage}
						addRoleAction={personasData ? ADD_ROLE_ACTION : ''}
						id="ev-authors"
						helpId="ev-authors-help"
						idPrefix="ev-personas"
						errors={peopleErrors}
					/>

					<PlaceSection
						picker={venuePicker}
						bind:venues
						bind:choice={venue}
						fields={placeShown}
						idFor={datosFieldId('nuevo')}
						errors={mapError ? { location_map: mapError } : {}}
						bind:values
						idPrefix="ev"
					/>

					<fieldset class="card" id="sec-direccion">
						<SectionHeading section="direccion" />
						<label class="field">
							<span>Así va a quedar el link del evento</span>
							<div class="slug">
								<span class="prefix">kinkyvibe.ar/calendario/</span>
								<input
									id="ev-slug"
									value={slug}
									on:input={onSlugInput}
									placeholder={isValidDate(values.startDate) ? '' : 'Elegí la fecha primero'}
									autocomplete="off"
									autocapitalize="off"
									spellcheck="false"
								/>
							</div>
						</label>
						{#if slugEdited && proposedSlug}
							<button type="button" class="link" on:click={resetSlug}
								>Usar la dirección sugerida</button
							>
						{/if}
						{#if slugProblem || serverSlugError}
							<p class="error">
								{slugProblem || serverSlugError}
								{#if serverSlugError && serverSlug.suggestion}
									<button
										type="button"
										class="link"
										on:click={() => useSuggestion(serverSlug.suggestion)}
										>Usar «{serverSlug.suggestion}»</button
									>
								{/if}
							</p>
						{:else}
							<p class="hint">Se completa sola con la fecha. Solo minúsculas, números y guiones.</p>
						{/if}
					</fieldset>

					<TagsSection
						usage={data.tagUsage}
						bind:tagRules
						bind:freeTags
						errors={showProblems ? tagErrors : []}
						inputId="ev-tags"
						helpId="ev-tags-help"
					/>

					<TicketsEditor
						bind:state={tickets}
						tags={splitList(values.tags)}
						location={values.location}
						locationName={values.location_name}
						hasVenue={venue.venueId != null}
						transferReady={data.transferReady}
						errors={ticketsCheck.errors}
						showErrors={showProblems}
						warnings={ticketsCheck.warnings}
						idPrefix="ev"
					/>

					{#key pickerKey}
						<ImagePicker
							bind:value={pickedImage}
							legacyUrl={featuredMode === 'keep' ? source?.featuredUrl : null}
							target={source ? `evento:${source.slug}` : null}
							contextLabel="Del evento original"
							idPrefix="ev-image"
							canDelete
							on:change={onPick}
						/>
					{/key}
					{#if hasSourceImage && featuredMode !== 'keep'}
						<button type="button" class="link" on:click={useSourceImage}
							>Usar la imagen del evento original</button
						>
					{/if}

					<BodySection bind:value={values.body} id="ev-body">
						<svelte:fragment slot="hint"
							>Opcional. Se muestra al entrar al evento. Formato: <code>## Título</code>,
							<code>- lista</code>, <code>**negrita**</code>.</svelte:fragment
						>
					</BodySection>

					{#if showProblems && (problems.length || generated.error)}
						<!-- Cada problema lleva a su campo (los campos con problema llevan aria-invalid). -->
						<FormProblems
							problems={generated.error
								? [...problemItems, { text: generated.error, field: '' }]
								: problemItems}
						/>
					{/if}
					{#if checkError}<p class="error check-error">{checkError}</p>{/if}

					<div class="bar sticky">
						<SaveButton
							type="button"
							id="to-preview"
							on:click={goToPreview}
							saving={checking}
							savingLabel="Revisando…">Revisar antes de publicar →</SaveButton
						>
					</div>
				</div>

				<!-- ======================= STEP 2 ======================= -->
				<div class="step" hidden={step !== 'revisar'}>
					{#if publishError}<p class="error" role="alert">{publishError}</p>{/if}
					{#if reviewWarnings.length}
						<div class="review-warnings">
							<Notice tone="warn" compact id="review-warnings">
								<strong>Antes de publicar, fijate:</strong>
								<ul>
									{#each reviewWarnings as w (w.id + w.label)}
										<li><strong>{w.label}:</strong> {w.detail}</li>
									{/each}
								</ul>
								<p class="small">Son avisos: podés publicar igual o volver a editar.</p>
							</Notice>
						</div>
					{/if}
					<p class="hint">Así se va a ver en la lista de eventos:</p>
					{#if previewPost}
						<div class="card-preview" aria-hidden="true">
							{#key previewPost}
								<PostListItem post={previewPost} />
							{/key}
						</div>
					{/if}
					<dl class="summary-list">
						<dt>Cuándo</dt>
						<dd class="cap">{scheduleText}</dd>
						<dt>Link</dt>
						<dd><code>kinkyvibe.ar/calendario/{slug}</code></dd>
						<dt>Estado</dt>
						<dd>{STATUS_OPTIONS.find((o) => o.value === values.status)?.label ?? values.status}</dd>
						<dt>Lugar</dt>
						<dd id="review-place">
							{#if venueChoiceText(venue, venues)}
								{venueChoiceText(venue, venues)}
							{:else}
								{reviewPlace || '—'}
								{#if values.location_map && !mapError}· con link al mapa{/if}
							{/if}
						</dd>
						<dt>{personasData ? 'Personas' : 'Organizan'}</dt>
						<dd>{peopleText || '—'}</dd>
						<dt>Etiquetas</dt>
						<dd>{splitList(values.tags).join(', ')}</dd>
						{#if seriesPrompt && (seriesChoice === 'crear' || seriesChoice === 'agregar')}
							<dt>Serie</dt>
							<dd id="review-series">
								{seriesChoice === 'crear' ? 'Nueva: ' : ''}«{seriesChoice === 'crear'
									? seriesName.trim()
									: seriesExisting}»{seriesMarkSource ? ' (también el evento original)' : ''}
							</dd>
						{/if}
						<dt>Entradas</dt>
						<dd id="review-tickets">{describeTicketsForm(tickets, formatARS)}</dd>
						<dt>Imagen</dt>
						<dd id="review-image">
							{#if featuredMode === 'library'}
								De la biblioteca: {pickedImage?.title ?? ''}
							{:else if featuredMode === 'keep'}
								La misma del evento original
							{:else}
								Sin imagen
							{/if}
						</dd>
					</dl>
					<FilePreview content={generated.md} savesToDb={data.savesToDb} />

					<div class="bar publish">
						<button
							type="button"
							class="button secondary"
							on:click={backToEdit}
							disabled={submitting}>← Volver a editar</button
						>
						<SaveButton
							name="mode"
							value="borrador"
							variant="button secondary"
							id="save-draft"
							saving={submitting && submittingMode === 'borrador'}
							disabled={submitting}
							title="Se crea pero no aparece en el calendario; se puede ver con el link"
							>Crear como no listado</SaveButton
						>
						{#if !confirming}
							<button
								type="button"
								class="button primary"
								id="publish"
								on:click={() => (confirming = true)}
								disabled={submitting}>Publicar</button
							>
						{/if}
					</div>
					{#if confirming}
						<div class="confirm" role="alertdialog" aria-labelledby="confirm-text">
							<p id="confirm-text">
								¿Publicar <strong>{values.title}</strong> en el calendario? {copy.confirmPublish}
							</p>
							<div class="bar">
								<button
									type="button"
									class="button secondary"
									on:click={() => (confirming = false)}
									disabled={submitting}>Cancelar</button
								>
								<SaveButton
									name="mode"
									value="publicar"
									variant="button primary"
									id="confirm-publish"
									saving={submitting && submittingMode !== 'borrador'}
									disabled={submitting}
									savingLabel="Publicando…">Sí, publicar</SaveButton
								>
							</div>
						</div>
					{/if}
					<!-- Anuncia «Guardando…» a los lectores de pantalla (la confirmación, submitForm). -->
					<SaveStatus saving={submitting} savingText={copy.saving} />
					{#if submitting}<p class="hint">{copy.saving}</p>{/if}
				</div>
			</form>
		{/if}
	</EventForm>
</main>

<style lang="scss">
	.review-warnings {
		margin-bottom: var(--space-s);
		:global(ul) {
			margin: var(--space-3xs) 0;
			padding-left: 1.2em;
		}
		:global(p) {
			margin: 0;
		}
	}
	/* ícono de Lucide en el título, como los de las secciones (SectionHeading) */
	.series-prompt > .with-icon {
		display: flex;
		align-items: center;
		gap: var(--space-3xs);
	}
	.series-prompt > .with-icon > :global(svg) {
		flex: none;
		color: var(--muted);
	}
	.series-prompt .choices {
		display: grid;
		gap: 0.4rem;
		margin-bottom: 0.6rem;
	}
	.series-prompt .sub {
		margin-left: 1.8rem;
	}
	/* Shared form look: $lib/components/admin/admin.scss (class kv-admin). Page-specific below. */
	.steps {
		display: flex;
		gap: 1em;
		padding: 0;
		list-style: none;
		font-size: var(--step--1);
		li {
			opacity: 0.5;
			&.current {
				opacity: 1;
				font-weight: bold;
				color: var(--1-dark);
			}
		}
	}
	.slug {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 0.2em;
		.prefix {
			font-size: var(--step--1);
			opacity: 0.7;
		}
		input {
			flex: 1 1 12em;
			font-family: monospace;
		}
	}
	.card-preview {
		pointer-events: none;
		container-type: inline-size;
		position: relative;
		margin: 0.5em 0 1.5em;
		:global(.post) {
			position: relative;
		}
	}
	.summary-list {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: 0.3em 1em;
		background: var(--surface, white);
		border-radius: var(--radius-m);
		padding: 0.8em 1em;
		dt {
			font-weight: bold;
		}
		dd {
			margin: 0;
			overflow-wrap: anywhere;
		}
		.cap::first-letter {
			text-transform: uppercase;
		}
	}
	.confirm {
		margin-top: 1em;
		background: var(--surface-2, #fff7fb);
		outline: 2px solid var(--1-light);
		border-radius: var(--radius-m);
		padding: 0.8em 1em;
		p {
			margin: 0;
		}
	}
	.done {
		background: var(--surface, white);
		border-radius: var(--radius-l);
		padding: 1em 1.2em;
		box-shadow: var(--shadow-1);
		overflow-wrap: anywhere;
		.small {
			font-size: var(--step--1);
		}
		.buttons {
			display: flex;
			flex-wrap: wrap;
			gap: 0.7em;
		}
	}
</style>
