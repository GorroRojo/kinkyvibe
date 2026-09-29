<script>
	import { enhance, applyAction, deserialize } from '$app/forms';
	import { onDestroy, tick } from 'svelte';
	import PostListItem from '$lib/components/PostListItem.svelte';
	import { tagManager } from '$lib/utils/stores';
	import {
		STATUS_OPTIONS,
		addDays,
		buildEventMarkdown,
		daysBetween,
		deriveSlug,
		describeSchedule,
		formFromSource,
		formatEventDate,
		isValidDate,
		isValidTime,
		readEventFields,
		slugify,
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
			uploadError
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

<main class="nuevo">
	<p class="back"><a href="/admin/eventos">← Volver a la lista de eventos</a></p>

	{#if data.mock}
		<p class="mock">
			🧪 Modo de prueba (ADMIN_DEV_MOCK): no se escribe nada en GitHub, los archivos se guardan en una
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
			<textarea hidden name="content" value={generated.md} />

			<!-- ======================= STEP 1 ======================= -->
			<div class="step" hidden={step !== 'editar'}>
				{#if source}
					<p class="hint">
						Copiamos todos los datos de <a href="/calendario/{source.slug}" target="_blank" rel="noreferrer"
							>{source.title}</a
						>. Cambiá la fecha y revisá lo demás.
					</p>
				{/if}

				<fieldset>
					<legend>📅 ¿Cuándo es?</legend>
					{#if originalSchedule}
						<p class="hint">El evento original fue el {originalSchedule}.</p>
					{/if}
					<div class="grid">
						<label>
							<span>Día que empieza <span class="req">*</span></span>
							<input
								type="date"
								id="ev-start-date"
								bind:value={values.startDate}
								required
							/>
						</label>
						<label>
							<span>Hora que empieza <span class="req">*</span></span>
							<input type="time" id="ev-start-time" bind:value={values.startTime} required />
						</label>
						{#if values.hasEnd}
							<label>
								<span>Día que termina <span class="req">*</span></span>
								<input
									type="date"
									id="ev-end-date"
									bind:value={values.endDate}
									min={values.startDate}
									required
								/>
							</label>
							<label>
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

				<fieldset>
					<legend>🔗 Dirección de la página</legend>
					<label>
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

				<fieldset>
					<legend>📝 Datos del evento</legend>
					<label>
						<span>Título <span class="req">*</span></span>
						<input id="ev-title" bind:value={values.title} placeholder="Ej: Picantearla (62ª Edición)" />
					</label>
					<label>
						<span>Resumen corto</span>
						<textarea
							id="ev-summary"
							bind:value={values.summary}
							rows="3"
							placeholder="Aparece en la lista de eventos y cuando se comparte el link"
						/>
					</label>
					<label>
						<span>Estado</span>
						<select id="ev-status" bind:value={values.status}>
							{#each STATUS_OPTIONS as option}
								<option value={option.value}>{option.label} — {option.help}</option>
							{/each}
						</select>
					</label>
					<div class="grid">
						<label>
							<span>Dirección</span>
							<input id="ev-location" bind:value={values.location} placeholder="Calle 123, Ciudad" />
							<small>Dejalo vacío si es online.</small>
						</label>
						<label>
							<span>Nombre del lugar</span>
							<input id="ev-location-name" bind:value={values.location_name} placeholder="Ej: El Surco" />
						</label>
						<label>
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
						<label>
							<span>Texto del botón</span>
							<input id="ev-link-text" bind:value={values.link_text} placeholder="Inscribirme" />
						</label>
					</div>
					<label>
						<span>Etiquetas</span>
						<input id="ev-tags" bind:value={values.tags} placeholder="español, KinkyVibe, pago, AMBA, taller" />
						<small>Separadas por comas. Ej: pago / gratis / a la gorra, y la zona (AMBA, Córdoba, online…).</small>
					</label>
					<label>
						<span>Organizan</span>
						<input id="ev-authors" bind:value={values.authors} placeholder="KinkyVibe, DemonWeb" />
						<small>Separades por comas, como aparecen en amigues.</small>
					</label>
				</fieldset>

				<fieldset>
					<legend>🖼️ Imagen</legend>
					<div class="image-row">
						{#if previewImage}
							<img src={previewImage} alt="Imagen del evento" class="thumb" />
						{:else}
							<div class="thumb empty">Sin imagen</div>
						{/if}
						<div class="image-actions">
							{#if featuredMode === 'keep'}
								<p class="hint">Se usa la misma imagen que el evento original.</p>
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

				<fieldset>
					<legend>📄 Texto largo de la página</legend>
					<p class="hint">
						Opcional. Se muestra al entrar al evento. Formato: <code>## Título</code>, <code>- lista</code>,
						<code>**negrita**</code>.
					</p>
					<textarea id="ev-body" class="body" bind:value={values.body} rows="12" />
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
					<dt>Imagen</dt>
					<dd>
						{featuredMode === 'upload'
							? 'Nueva: ' + uploadName
							: featuredMode === 'keep'
							? 'La misma del evento original'
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
	.nuevo {
		max-width: 44rem;
		margin-inline: auto;
		padding: 0 16px 5em;
		font-size: var(--step-0);
	}
	h1 {
		font-size: var(--step-2);
		margin: 0.3em 0;
		overflow-wrap: anywhere;
	}
	.back {
		margin: 0.5em 0 0;
		font-size: var(--step--1);
	}
	.mock {
		background: var(--4-light);
		border-radius: 1em;
		padding: 0.5em 1em;
		font-size: var(--step--1);
	}
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
	fieldset {
		border: 0;
		background: white;
		border-radius: 1.2em;
		box-shadow: 0 0.1em 0.3em rgba(0, 0, 0, 0.1);
		padding: 0.8em 1em 1em;
		margin: 0 0 1em;
		display: flex;
		flex-direction: column;
		gap: 0.7em;
		min-width: 0;
	}
	legend {
		float: left;
		font-weight: bold;
		font-size: var(--step-0-5);
		padding: 0;
		margin-bottom: 0.2em;
	}
	legend + * {
		clear: both;
	}
	label {
		display: flex;
		flex-direction: column;
		gap: 0.25em;
		min-width: 0;
		> span {
			color: var(--1-dark);
		}
	}
	label.check {
		flex-direction: row;
		align-items: center;
		gap: 0.5em;
	}
	.grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.7em;
	}
	input:not([type='checkbox']):not([type='file']),
	select,
	textarea {
		font: inherit;
		font-size: var(--step-0);
		padding: 0.45em 0.8em;
		border-radius: 0.8em;
		border: 0;
		outline: 1px solid var(--1-light);
		background: white;
		min-width: 0;
		width: 100%;
		box-sizing: border-box;
		&:focus {
			outline-width: 3px;
		}
	}
	input[type='checkbox'] {
		accent-color: var(--1);
		width: 1.2em;
		height: 1.2em;
	}
	textarea {
		resize: vertical;
	}
	textarea.body {
		font-family: monospace;
		font-size: var(--step--1);
	}
	small,
	.hint {
		font-size: var(--step--1);
		opacity: 0.75;
		margin: 0;
	}
	.req {
		color: red;
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
	.error {
		color: #b00020;
		margin: 0;
		font-size: var(--step--1);
	}
	.warning {
		background: var(--4-light);
		border-radius: 0.8em;
		padding: 0.4em 0.8em;
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
		input[type='file'] {
			max-width: 100%;
			font-size: var(--step--1);
		}
	}
	.button {
		display: inline-block;
		background: var(--1);
		color: white;
		border: 0;
		border-radius: 1em;
		padding: 0.6em 1.1em;
		font-size: var(--step-0);
		text-decoration: none;
		cursor: pointer;
		&.secondary {
			background: white;
			color: var(--1-dark);
			outline: 2px solid var(--1-light);
			outline-offset: -2px;
		}
		&:disabled {
			opacity: 0.6;
			cursor: wait;
		}
	}
	button.link {
		background: none;
		border: 0;
		padding: 0;
		color: var(--2-dark);
		text-decoration: underline;
		cursor: pointer;
		font-size: var(--step--1);
		text-align: left;
	}
	.bar {
		display: flex;
		flex-wrap: wrap;
		gap: 0.7em;
		justify-content: flex-end;
		margin-top: 1em;
	}
	.problems {
		background: #fff0f3;
		border-radius: 1em;
		padding: 0.6em 1em;
		color: #b00020;
		ul {
			margin: 0.3em 0 0;
			padding-left: 1.2em;
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
		.note {
			background: var(--3-light);
			border-radius: 0.8em;
			padding: 0.5em 0.8em;
		}
		.small {
			font-size: var(--step--1);
		}
		.buttons {
			display: flex;
			flex-wrap: wrap;
			gap: 0.7em;
		}
	}
	@media (max-width: 540px) {
		.grid {
			grid-template-columns: 1fr;
		}
		.bar {
			justify-content: stretch;
			.button {
				flex: 1 1 100%;
			}
		}
	}
</style>
