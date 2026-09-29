<script>
	import { enhance, applyAction, deserialize } from '$app/forms';
	import { onDestroy, tick } from 'svelte';
	import PostListItem from '$lib/components/PostListItem.svelte';
	import DayPicker from '$lib/components/admin/DayPicker.svelte';
	import EventTagRules from '$lib/components/admin/EventTagRules.svelte';
	import OrganizerPicker from '$lib/components/admin/OrganizerPicker.svelte';
	import TagPicker from '$lib/components/admin/TagPicker.svelte';
	import '$lib/components/admin/admin.scss';
	import { tagManager } from '$lib/utils/stores';
	import {
		buildTagOptions,
		excludedFromPicker,
		joinEventTags,
		splitEventTags,
		validateEventTags
	} from '$lib/utils/adminTags.js';
	import { buildOrganizerOptions } from '$lib/utils/organizers.js';
	import {
		STATUS_OPTIONS,
		addDays,
		buildEventMarkdown,
		daysBetween,
		deriveSlug,
		describeSchedule,
		formFromSource,
		formatEventDate,
		isNumericFeatured,
		isValidDate,
		isValidTime,
		parseEventDate,
		prefillMonth,
		readEventFields,
		slugify,
		splitList,
		splitMarkdown,
		uniqueSlug,
		validateSchedule,
		validateSlug
	} from '$lib/utils/eventDraft.js';

	/** @type {import('./$types').PageData} */
	export let data;
	/** @type {import('./$types').ActionData} */
	export let form;

	const source = data.source;
	const sourceRaw = source?.raw ?? data.template;
	const sourceFields = readEventFields(splitMarkdown(sourceRaw).frontmatter);
	const originalSchedule = source ? describeSchedule(sourceFields.start, sourceFields.end) : '';

	let values = formFromSource(sourceRaw, { today: data.today, fromTemplate: !source });

	// Dates start empty so nobody publishes a copy with last month's date by accident.
	// The end date follows the start date, keeping the original event's length in days.
	let span = 0;
	if (values.startDate && values.endDate) {
		span = Math.max(0, daysBetween(values.startDate, values.endDate));
		// "21:00 to 01:00" on the same day is a common typo in old events: it means the next day.
		if (span === 0 && values.endTime < values.startTime) span = 1;
	}
	values.startDate = '';
	values.endDate = '';
	// ...but the calendar opens on the month the copy most likely is: this month until the 15th,
	// next month from the 16th (Argentina time). The day is always picked by hand.
	let month = prefillMonth(data.today);
	const sourceStart = parseEventDate(sourceFields.start).date;
	const sourceWeekday =
		source && isValidDate(sourceStart) ? new Date(sourceStart + 'T12:00:00Z').getUTCDay() : undefined;

	/* ---------- tags & organizers ---------- */
	const tagOptions = buildTagOptions({ category: 'calendario', usage: data.tagUsage });
	const reservedTags = new Set([...excludedFromPicker('calendario'), 'online', 'virtual']);
	const initialTags = splitEventTags(splitList(values.tags));
	let tagRules = {
		kinkyvibe: initialTags.kinkyvibe,
		language: initialTags.language,
		sign: initialTags.sign,
		place: initialTags.place,
		prices: initialTags.prices
	};
	let freeTags = initialTags.rest;
	let authors = splitList(values.authors);
	const organizerOptions = buildOrganizerOptions(data.profiles, data.authorUsage);
	$: values.tags = joinEventTags({ ...tagRules, rest: freeTags });
	$: values.authors = authors;
	$: tagErrors = validateEventTags(splitList(values.tags));

	function onStartDateChange() {
		if (isValidDate(values.startDate)) values.endDate = addDays(values.startDate, span);
	}
	function onEndDateChange() {
		if (isValidDate(values.startDate) && isValidDate(values.endDate))
			span = Math.max(0, daysBetween(values.startDate, values.endDate));
	}
	// Run after the bindings have updated `values` (event handler order is not guaranteed).
	let lastStartKey = '';
	let lastEnd = '';
	$: if (`${values.startDate}|${values.hasEnd}` !== lastStartKey) {
		lastStartKey = `${values.startDate}|${values.hasEnd}`;
		onStartDateChange();
		lastEnd = values.endDate;
	}
	$: if (values.endDate !== lastEnd) {
		lastEnd = values.endDate;
		onEndDateChange();
	}
	function endsNextDay() {
		values.endDate = addDays(values.startDate, 1);
		span = 1;
	}

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
	const hasSourceImage = Boolean(sourceFields.featured && source);
	// A non-numeric `featured` names a file in src/lib/assets shared by several posts.
	const sourceImageIsShared = hasSourceImage && !isNumericFeatured(sourceFields.featured);
	/** @type {'keep'|'upload'|'none'} */
	let featuredMode = hasSourceImage ? 'keep' : 'none';
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
		if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
			uploadError = 'La imagen tiene que ser JPG, PNG o WEBP.';
		} else if (file.size > data.maxImageBytes) {
			uploadError = `La imagen pesa ${(file.size / 1024 / 1024).toFixed(1)} MB. El máximo es ${
				data.maxImageBytes / 1024 / 1024
			} MB.`;
		}
		if (uploadError) {
			fileInput.value = '';
			return;
		}
		if (uploadURL) URL.revokeObjectURL(uploadURL);
		uploadURL = URL.createObjectURL(file);
		uploadName = file.name;
		featuredMode = 'upload';
	}
	/** @param {'keep'|'none'} mode */
	function setImage(mode) {
		featuredMode = mode;
		if (fileInput) fileInput.value = '';
		uploadError = '';
	}
	onDestroy(() => uploadURL && URL.revokeObjectURL(uploadURL));
	$: previewImage =
		featuredMode === 'upload' ? uploadURL : featuredMode === 'keep' ? source?.featuredUrl : undefined;

	/* ---------- validation & generated file ---------- */
	$: startValue =
		isValidDate(values.startDate) && isValidTime(values.startTime)
			? formatEventDate(values.startDate, values.startTime)
			: '';
	$: endValue =
		values.hasEnd && isValidDate(values.endDate) && isValidTime(values.endTime)
			? formatEventDate(values.endDate, values.endTime)
			: '';
	$: scheduleError = startValue && (endValue || !values.hasEnd) ? validateSchedule(startValue, endValue) : null;
	$: scheduleText = startValue ? describeSchedule(startValue, endValue) : '';

	$: problems = /** @type {string[]} */ (
		[
			!values.title.trim() && 'Falta el título.',
			!isValidDate(values.startDate) && 'Falta la fecha de inicio.',
			!isValidTime(values.startTime) && 'Falta la hora de inicio.',
			values.hasEnd && isValidDate(values.startDate) && !isValidDate(values.endDate) && 'Falta la fecha de fin.',
			values.hasEnd && !isValidTime(values.endTime) && 'Falta la hora de fin.',
			scheduleError,
			!slug && isValidDate(values.startDate) && 'Falta la dirección de la página.',
			slugProblem,
			serverSlugError,
			uploadError,
			...tagErrors
		].filter(Boolean)
	);

	$: generated = build(values, featuredMode, problems.length);
	/**
	 * @param {typeof values} v
	 * @param {'keep'|'upload'|'none'} mode
	 * @param {number} nProblems
	 */
	function build(v, mode, nProblems) {
		if (nProblems) return { md: '', error: '' };
		try {
			return { md: buildEventMarkdown(sourceRaw, { ...v, featuredMode: mode }), error: '' };
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

	/* ---------- steps ---------- */
	/** @type {'editar'|'revisar'} */
	let step = 'editar';
	let showProblems = false;
	let checking = false;
	let checkError = '';
	let confirming = false;
	let submitting = false;
	let publishError = '';

	async function goToPreview() {
		showProblems = true;
		checkError = '';
		if (problems.length || generated.error) {
			await tick();
			document.querySelector('.problems')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
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
					serverSlug = { slug, error: result.data.slugError, suggestion: result.data.suggestion ?? '' };
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
		if (step !== 'revisar' || !submitter || !generated.md) {
			cancel();
			return;
		}
		submitting = true;
		publishError = '';
		return async ({ result }) => {
			submitting = false;
			confirming = false;
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
				await applyAction(result);
			}
			window.scrollTo({ top: 0 });
		};
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
	<p class="back"><a href="/admin/eventos">← Volver a la lista de eventos</a></p>

	{#if data.mock}
		<p class="mock">
			🧪 Modo de prueba (<code>npm run dev:admin</code>): no se escribe nada en GitHub, los archivos se guardan en una
			carpeta temporal.
		</p>
	{/if}

	{#if form?.success}
		<section class="done" aria-live="polite">
			<h1>¡Listo! 🎉</h1>
			<p>
				{#if form.mode === 'borrador'}
					El evento se guardó como <strong>no listado</strong>: no aparece en el calendario, pero se
					puede ver con el link.
				{:else}
					El evento se <strong>publicó</strong>.
				{/if}
			</p>
			<p>
				Va a estar en
				<a href={form.eventUrl} target="_blank" rel="noreferrer"><strong>kinkyvibe.ar{form.eventUrl}</strong></a>
			</p>
			<p class="note">
				⏳ El sitio tarda unos minutos (normalmente entre 2 y 5) en actualizarse. Si el link da error
				al principio, esperá un poco y recargá. Si pasan más de 10 minutos, avisale a
				<a href="https://t.me/Gorro_Rojo">@Gorro_Rojo</a>.
			</p>
			{#each form.warnings ?? [] as warning}
				<p class="warning">⚠️ {warning}</p>
			{/each}
			<p class="small">
				Cambio guardado en GitHub: <a href={form.commitUrl} target="_blank" rel="noreferrer">ver el commit</a>
				· Archivos: {#each form.files ?? [] as f, i}<code>{f}</code>{i < (form.files?.length ?? 0) - 1 ? ', ' : ''}{/each}
			</p>
			<p class="buttons">
				<a class="button" href="/admin/eventos">Cargar otro evento</a>
				<a class="button secondary" href="/admin/eventos/nuevo?desde={form.slug}" data-sveltekit-reload
					>Duplicar este mismo</a
				>
			</p>
		</section>
	{:else}
		<h1>
			{#if source}Duplicar «{source.title}»{:else}Nuevo evento{/if}
		</h1>
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

			<!-- ======================= STEP 1 ======================= -->
			<div class="step" hidden={step !== 'editar'}>
				{#if source}
					<p class="hint">
						Copiamos todos los datos de <a href="/calendario/{source.slug}" target="_blank" rel="noreferrer"
							>{source.title}</a
						>. Cambiá la fecha y revisá lo demás.
					</p>
				{/if}

				<fieldset class="card">
					<legend>📅 ¿Cuándo es?</legend>
					{#if originalSchedule}
						<p class="hint">El evento original fue el {originalSchedule}.</p>
					{/if}
					<div class="field-label">
						<span id="ev-start-date-label">Día que empieza <span class="req">*</span></span>
						<DayPicker
							bind:value={values.startDate}
							bind:month
							today={data.today}
							hintWeekday={sourceWeekday}
							describedby="ev-start-date-help"
						/>
						<small id="ev-start-date-help">
							Elegí el día: arranca vacío a propósito para que nadie publique la fecha vieja.
							{#if sourceWeekday !== undefined}Resaltamos el mismo día de la semana que el original.{/if}
						</small>
						{#if values.startDate && values.startDate < data.today}
							<p class="warning">⚠️ Esa fecha ya pasó.</p>
						{/if}
					</div>
					<div class="grid">
						<label class="field">
							<span>Hora que empieza <span class="req">*</span></span>
							<input type="time" id="ev-start-time" bind:value={values.startTime} required />
						</label>
						{#if values.hasEnd}
							<label class="field">
								<span>Día que termina <span class="req">*</span></span>
								<input
									type="date"
									id="ev-end-date"
									bind:value={values.endDate}
									min={values.startDate}
									required
								/>
							</label>
							<label class="field">
								<span>Hora que termina <span class="req">*</span></span>
								<input type="time" id="ev-end-time" bind:value={values.endTime} required />
							</label>
						{/if}
					</div>
					<label class="check">
						<input type="checkbox" id="ev-has-end" bind:checked={values.hasEnd} />
						Tiene hora de finalización
					</label>
					{#if scheduleText && !scheduleError}
						<p class="schedule">🗓️ <span>{scheduleText}</span></p>
					{/if}
					{#if scheduleError}
						<p class="error">
							{scheduleError}
							{#if values.startDate === values.endDate}
								<button type="button" class="link" on:click={endsNextDay}>¿Termina al día siguiente?</button>
							{/if}
						</p>
					{/if}
				</fieldset>

				<fieldset class="card">
					<legend>🔗 Dirección de la página</legend>
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
						<button type="button" class="link" on:click={resetSlug}>Usar la dirección sugerida</button>
					{/if}
					{#if slugProblem || serverSlugError}
						<p class="error">
							{slugProblem || serverSlugError}
							{#if serverSlugError && serverSlug.suggestion}
								<button type="button" class="link" on:click={() => useSuggestion(serverSlug.suggestion)}
									>Usar «{serverSlug.suggestion}»</button
								>
							{/if}
						</p>
					{:else}
						<p class="hint">Se completa sola con la fecha. Solo minúsculas, números y guiones.</p>
					{/if}
				</fieldset>

				<fieldset class="card">
					<legend>📝 Datos del evento</legend>
					<label class="field">
						<span>Título <span class="req">*</span></span>
						<input id="ev-title" bind:value={values.title} placeholder="Ej: Picantearla (62ª Edición)" />
					</label>
					<label class="field">
						<span>Resumen corto</span>
						<textarea
							id="ev-summary"
							bind:value={values.summary}
							rows="3"
							placeholder="Aparece en la lista de eventos y cuando se comparte el link"
						></textarea>
					</label>
					<label class="field">
						<span>Estado</span>
						<select id="ev-status" bind:value={values.status}>
							{#each STATUS_OPTIONS as option}
								<option value={option.value}>{option.label} — {option.help}</option>
							{/each}
						</select>
					</label>
					<div class="grid">
						<label class="field">
							<span>Dirección</span>
							<input id="ev-location" bind:value={values.location} placeholder="Calle 123, Ciudad" />
							<small>Dejalo vacío si es online.</small>
						</label>
						<label class="field">
							<span>Nombre del lugar</span>
							<input id="ev-location-name" bind:value={values.location_name} placeholder="Ej: El Surco" />
						</label>
						<label class="field">
							<span>Link de inscripción / entradas</span>
							<input
								id="ev-link"
								type="url"
								bind:value={values.link}
								placeholder="https://forms.gle/..."
								inputmode="url"
							/>
							<small>Solo se muestra cuando el estado es «Abierto».</small>
						</label>
						<label class="field">
							<span>Texto del botón</span>
							<input id="ev-link-text" bind:value={values.link_text} placeholder="Inscribirme" />
						</label>
					</div>
					<div class="field-label">
						<label for="ev-authors">Organizan</label>
						<OrganizerPicker
							bind:authors
							profiles={data.profiles}
							options={organizerOptions}
							id="ev-authors"
							describedby="ev-authors-help"
						/>
						<small id="ev-authors-help"
							>Elegí de amigues (se enlaza su perfil) o escribí un nombre y elegí «Agregar». Pueden ser
							varias personas o grupos.</small
						>
					</div>
				</fieldset>

				<fieldset class="card">
					<legend>🏷️ Etiquetas</legend>
					<EventTagRules bind:state={tagRules} errors={showProblems ? tagErrors : []} />
					<div class="field-label">
						<label for="ev-tags">Otras etiquetas: tipo de evento, prácticas, temas…</label>
						<TagPicker
							bind:tags={freeTags}
							options={tagOptions}
							reserved={reservedTags}
							reservedHint="se elige con los botones de arriba (idioma, lugar, precio o KinkyVibe)."
							id="ev-tags"
							describedby="ev-tags-help"
						/>
						<small id="ev-tags-help"
							>Escribí para buscar (sin importar tildes). Si no existe, podés crearla, pero preferí las
							que ya existen: son las que se usan para filtrar.</small
						>
					</div>
				</fieldset>

				<fieldset class="card">
					<legend>🖼️ Imagen</legend>
					<div class="image-row">
						{#if previewImage}
							<img src={previewImage} alt="Imagen del evento" class="thumb" />
						{:else}
							<div class="thumb empty">Sin imagen</div>
						{/if}
						<div class="image-actions">
							{#if featuredMode === 'keep' && sourceImageIsShared}
								<p class="hint">
									Se usa la misma imagen que el evento original. Es una imagen compartida del sitio
									(<code>src/lib/assets/{sourceFields.featured}</code>): no se copia ni se modifica.
								</p>
							{:else if featuredMode === 'keep'}
								<p class="hint">
									Se usa la misma imagen que el evento original: se copia a la carpeta de este evento. El
									evento original no cambia.
								</p>
							{:else if featuredMode === 'upload'}
								<p class="hint">Nueva imagen: {uploadName}</p>
							{/if}
							<label class="file">
								<span>{featuredMode === 'upload' ? 'Elegir otra imagen' : 'Subir una imagen nueva'}</span>
								<input
									bind:this={fileInput}
									type="file"
									name="image"
									id="ev-image"
									accept="image/jpeg,image/png,image/webp"
									on:change={onFileChange}
								/>
							</label>
							<small>JPG, PNG o WEBP, hasta {data.maxImageBytes / 1024 / 1024} MB. Mejor si es cuadrada.</small>
							<p class="note" id="ev-image-where">
								📁 La imagen se guarda solo para este evento{#if slug}
									(en <code>calendario/media/{slug}/</code>){/if}; el evento original no cambia.
							</p>
							{#if featuredMode !== 'none'}
								<button type="button" class="link" on:click={() => setImage('none')}>Quitar imagen</button>
							{/if}
							{#if hasSourceImage && featuredMode !== 'keep'}
								<button type="button" class="link" on:click={() => setImage('keep')}
									>Usar la imagen del evento original</button
								>
							{/if}
							{#if uploadError}<p class="error">{uploadError}</p>{/if}
						</div>
					</div>
				</fieldset>

				<fieldset class="card">
					<legend>📄 Texto largo de la página</legend>
					<p class="hint">
						Opcional. Se muestra al entrar al evento. Formato: <code>## Título</code>, <code>- lista</code>,
						<code>**negrita**</code>.
					</p>
					<textarea id="ev-body" class="body" bind:value={values.body} rows="12"></textarea>
				</fieldset>

				{#if showProblems && (problems.length || generated.error)}
					<div class="problems" role="alert">
						<strong>Falta completar:</strong>
						<ul>
							{#each problems as p}<li>{p}</li>{/each}
							{#if generated.error}<li>{generated.error}</li>{/if}
						</ul>
					</div>
				{/if}
				{#if checkError}<p class="error check-error">{checkError}</p>{/if}

				<div class="bar">
					<button type="button" class="button" id="to-preview" on:click={goToPreview} disabled={checking}>
						{checking ? 'Revisando…' : 'Revisar antes de publicar →'}
					</button>
				</div>
			</div>

			<!-- ======================= STEP 2 ======================= -->
			<div class="step" hidden={step !== 'revisar'}>
				{#if publishError}<p class="error" role="alert">{publishError}</p>{/if}
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
					<dd>{[values.location_name, values.location].filter(Boolean).join(' — ') || 'Online'}</dd>
					<dt>Organizan</dt>
					<dd>{authors.join(', ') || '—'}</dd>
					<dt>Etiquetas</dt>
					<dd>{splitList(values.tags).join(', ')}</dd>
					<dt>Imagen</dt>
					<dd>
						{featuredMode === 'upload'
							? `Nueva: ${uploadName} (solo para este evento)`
							: featuredMode === 'keep' && sourceImageIsShared
							? 'La misma del evento original (imagen compartida del sitio)'
							: featuredMode === 'keep'
							? 'La misma del evento original (copiada a este evento)'
							: 'Sin imagen'}
					</dd>
				</dl>
				<details>
					<summary>Ver el archivo que se va a guardar</summary>
					<pre class="markdown">{generated.md}</pre>
				</details>

				<div class="bar publish">
					<button type="button" class="button secondary" on:click={backToEdit} disabled={submitting}
						>← Volver a editar</button
					>
					<button
						type="submit"
						name="mode"
						value="borrador"
						class="button secondary"
						id="save-draft"
						disabled={submitting}
						title="Se guarda pero no aparece en el calendario; se puede ver con el link"
						>Guardar como no listado</button
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
							¿Publicar <strong>{values.title}</strong> en el calendario? Se va a ver en el sitio en unos
							minutos.
						</p>
						<div class="bar">
							<button type="button" class="button secondary" on:click={() => (confirming = false)} disabled={submitting}
								>Cancelar</button
							>
							<button
								type="submit"
								name="mode"
								value="publicar"
								class="button primary"
								id="confirm-publish"
								disabled={submitting}>{submitting ? 'Publicando…' : 'Sí, publicar'}</button
							>
						</div>
					</div>
				{/if}
				{#if submitting}<p class="hint" aria-live="polite">Guardando en GitHub…</p>{/if}
			</div>
		</form>
	{/if}
</main>

<style lang="scss">
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
	textarea.body {
		font-family: monospace;
		font-size: var(--step--1);
	}
	.schedule {
		margin: 0;
		background: var(--3-light);
		border-radius: 0.8em;
		padding: 0.4em 0.8em;
		span {
			display: inline-block;
			&::first-letter {
				text-transform: uppercase;
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
			background: #f3eef6;
			font-size: var(--step--1);
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
			font-size: var(--step--1);
		}
		code {
			overflow-wrap: anywhere;
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
		background: white;
		border-radius: 1em;
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
	details {
		margin-top: 1em;
		summary {
			cursor: pointer;
			color: var(--2-dark);
		}
	}
	.markdown {
		background: #1e1e1e;
		color: #eee;
		border-radius: 1em;
		padding: 1em;
		font-size: var(--step--2);
		white-space: pre-wrap;
		overflow-wrap: anywhere;
		max-height: 30em;
		overflow: auto;
	}
	.confirm {
		margin-top: 1em;
		background: #fff7fb;
		outline: 2px solid var(--1-light);
		border-radius: 1em;
		padding: 0.8em 1em;
		p {
			margin: 0;
		}
	}
	.done {
		background: white;
		border-radius: 1.2em;
		padding: 1em 1.2em;
		box-shadow: 0 0.1em 0.3em rgba(0, 0, 0, 0.1);
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
