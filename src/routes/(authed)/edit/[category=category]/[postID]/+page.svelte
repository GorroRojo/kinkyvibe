<script>
	import CodeMirror from 'svelte-codemirror-editor';
	import { markdown } from '@codemirror/lang-markdown';
	import { page } from '$app/stores';
	import EventTagRules from '$lib/components/admin/EventTagRules.svelte';
	import OrganizerPicker from '$lib/components/admin/OrganizerPicker.svelte';
	import TagPicker from '$lib/components/admin/TagPicker.svelte';
	import '$lib/components/admin/admin.scss';
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
		applyFrontmatterChanges,
		formatEventDate,
		formatPostDate,
		isValidDate,
		isValidTime,
		joinMarkdown,
		parseEventDate,
		splitMarkdown,
		todayInArgentina,
		validateSchedule
	} from '$lib/utils/eventDraft.js';
	import { parseDocument } from 'yaml';

	/** @type {import('./$types').PageData} */
	export let data;
	/** @type {import('./$types').ActionData} */
	export let form;

	const category = $page.params.category;
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

	/**
	 * @typedef {object} Field
	 * @prop {string} key
	 * @prop {string} label
	 * @prop {'text'|'textarea'|'url'|'email'|'tel'|'date'|'datetime'|'checkbox'|'select'} type
	 * @prop {string} [placeholder]
	 * @prop {string} [help]
	 * @prop {boolean} [required]
	 * @prop {boolean} [wide]
	 * @prop {Array<{value: string, label: string}>} [options]
	 */

	/** @type {Field[]} */
	const common = [
		{ key: 'title', label: 'Título', type: 'text', required: true, wide: true },
		{
			key: 'summary',
			label: 'Resumen corto',
			type: 'textarea',
			wide: true,
			placeholder: 'Aparece en las listas y cuando se comparte el link'
		},
		{ key: 'published_date', label: 'Publicado', type: 'date', required: true },
		{
			key: 'updated_date',
			label: 'Actualizado',
			type: 'date',
			help: 'Se pone la fecha de hoy al guardar.'
		}
	];
	/** @type {Record<string, Field[]>} */
	const byCategory = {
		calendario: [
			{
				key: 'status',
				label: 'Estado',
				type: 'select',
				wide: true,
				options: STATUS_OPTIONS.map((o) => ({ value: o.value, label: `${o.label} — ${o.help}` }))
			},
			{ key: 'start', label: 'Empieza', type: 'datetime', required: true },
			{ key: 'end', label: 'Termina', type: 'datetime' },
			{
				key: 'location',
				label: 'Dirección',
				type: 'text',
				placeholder: 'Calle 123, Ciudad',
				help: 'Dejalo vacío si es online.'
			},
			{
				key: 'location_name',
				label: 'Nombre del lugar',
				type: 'text',
				placeholder: 'Ej: El Surco'
			},
			{
				key: 'link',
				label: 'Link de inscripción / entradas',
				type: 'url',
				placeholder: 'https://forms.gle/...',
				help: 'Solo se muestra cuando el estado es «Abierto».'
			},
			{ key: 'link_text', label: 'Texto del botón', type: 'text', placeholder: 'Inscribirme' }
		],
		amigues: [
			{
				key: 'pronoun',
				label: 'Pronombres',
				type: 'text',
				placeholder: 'https://pronombr.es/elle&el'
			},
			{ key: 'gender_identity', label: 'Género', type: 'text' },
			{ key: 'job_title', label: 'Qué hace', type: 'text', placeholder: 'Ej: Educador BDSM' },
			{ key: 'link', label: 'Link', type: 'url', placeholder: 'https://instagram.com/...' },
			{ key: 'email', label: 'Mail', type: 'email' },
			{ key: 'tel', label: 'Teléfono', type: 'tel', placeholder: '+54 11 1234 5678' },
			{ key: 'location', label: 'Dirección', type: 'text', placeholder: 'Calle 123, Ciudad' },
			{ key: 'bday', label: 'Cumpleaños', type: 'date' }
		],
		material: [
			{ key: 'link', label: 'Link', type: 'url', placeholder: 'https://...' },
			{ key: 'link_text', label: 'Texto del link', type: 'text', placeholder: 'Ir al sitio' },
			{ key: 'redirect', label: 'Redireccionar directo al link', type: 'checkbox', wide: true },
			{ key: 'access_date', label: 'Última fecha de acceso', type: 'date' },
			{ key: 'original_published_date', label: 'Fecha de publicación original', type: 'date' }
		],
		wiki: []
	};
	/** @type {Field[]} */
	const tail = [
		{
			key: 'force_unlisted',
			label: 'No listado (no aparece en las listas, se ve con el link)',
			type: 'checkbox',
			wide: true
		}
	];
	const fields = [...common, ...(byCategory[category] ?? []), ...tail];

	/** @param {Field} f @param {any} v */
	function toInput(f, v) {
		if (f.type === 'checkbox') return v === true;
		if (v === undefined || v === null) return '';
		if (f.type === 'date') return String(v).slice(0, 10);
		if (f.type === 'datetime') {
			const { date, time } = parseEventDate(v);
			return date ? `${date}T${time || '00:00'}` : '';
		}
		return String(v);
	}
	/** @param {Field} f @param {any} v @returns {any} value for applyFrontmatterChanges */
	function fromInput(f, v) {
		if (f.type === 'checkbox') return v ? true : null;
		if (v === '' || v === undefined || v === null) return null;
		if (f.type === 'date') return isValidDate(v) ? formatPostDate(v) : v;
		if (f.type === 'datetime') {
			const [date, time] = String(v).split('T');
			return isValidDate(date) && isValidTime(time) ? formatEventDate(date, time) : v;
		}
		if (f.type === 'textarea')
			return String(v)
				.replace(/\s*\n\s*/g, ' ')
				.trim();
		return String(v).trim();
	}

	/** @type {Record<string, any>} */
	const initial = Object.fromEntries(fields.map((f) => [f.key, toInput(f, meta[f.key])]));
	let values = { ...initial };
	// Existing behavior: saving marks the post as updated today.
	values.updated_date = todayInArgentina();

	/* ---------- tags & authors ---------- */
	/** @param {any} v @returns {string[]} */
	const list = (v) => (Array.isArray(v) ? v.map(String) : v ? [String(v)] : []);
	const initialTags = list(meta.tags);
	const isEvent = category === 'calendario';
	const tagOptions = buildTagOptions({ category, usage: data.tagUsage });
	const reservedTags = isEvent
		? new Set([...excludedFromPicker('calendario'), 'online', 'virtual'])
		: new Set();
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
	const organizerOptions = buildOrganizerOptions(data.profiles, data.authorUsage);
	const authorsLabel = isEvent ? 'Organizan' : 'Autores';

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
					...tagErrors
				].filter(Boolean)
		  );

	$: content = parseError ? rawText : build(values, tags, authors, body);
	/**
	 * @param {Record<string, any>} v
	 * @param {string[]} t
	 * @param {string[]} a
	 * @param {string} b
	 */
	function build(v, t, a, b) {
		/** @type {Record<string, any>} */
		const changes = {};
		for (const f of fields) {
			if (v[f.key] !== initial[f.key] || f.key === 'updated_date')
				changes[f.key] = fromInput(f, v[f.key]);
		}
		if (t.join('\n') !== initialTags.join('\n')) changes.tags = t;
		if (hasAuthors && a.join('\n') !== initialAuthors.join('\n')) changes.authors = a;
		try {
			return joinMarkdown(applyFrontmatterChanges(frontmatter, changes), b);
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
	$: changed = content !== unchanged;
</script>

<svelte:head>
	<title>Editar · {meta.title ?? $page.params.postID} · KV Admin</title>
</svelte:head>

<main class="edit kv-admin">
	<p class="back">
		<a href={'/' + category + '/' + $page.params.postID}>← Volver a la publicación</a>
	</p>

	{#if data.mock}
		<p class="mock">
			🧪 Modo de prueba (<code>npm run dev:admin</code>): no se escribe nada en GitHub, los archivos
			se guardan en una carpeta temporal.
		</p>
	{/if}

	<h1>Editar «{meta.title ?? $page.params.postID}»</h1>

	{#if parseError}
		<p class="problems" role="alert">
			Las propiedades de este archivo tienen un error de formato ({parseError}), así que se edita
			como texto. Revisá las líneas entre los <code>---</code>.
		</p>
		<textarea class="raw" bind:value={rawText} rows="30"></textarea>
	{:else}
		<fieldset class="card">
			<legend>📝 Datos</legend>
			<div class="grid">
				{#each fields as f}
					{#if f.type === 'checkbox'}
						<label class="check" class:wide={f.wide}>
							<input type="checkbox" id="{f.key}-input" bind:checked={values[f.key]} />
							{f.label}
						</label>
					{:else}
						<label class="field" class:wide={f.wide}>
							<span
								>{f.label}
								{#if f.required}<span class="req">*</span>{/if}</span
							>
							{#if f.type === 'textarea'}
								<textarea
									id="{f.key}-input"
									bind:value={values[f.key]}
									rows="3"
									placeholder={f.placeholder}></textarea>
							{:else if f.type === 'select'}
								<select id="{f.key}-input" bind:value={values[f.key]}>
									{#each f.options ?? [] as o}<option value={o.value}>{o.label}</option>{/each}
								</select>
							{:else if f.type === 'date'}
								<input type="date" id="{f.key}-input" bind:value={values[f.key]} />
							{:else if f.type === 'datetime'}
								<input
									type="datetime-local"
									id="{f.key}-input"
									bind:value={values[f.key]}
									min={f.key === 'end' ? values.start : undefined}
								/>
							{:else if f.type === 'url'}
								<input
									type="url"
									inputmode="url"
									id="{f.key}-input"
									bind:value={values[f.key]}
									placeholder={f.placeholder}
								/>
							{:else if f.type === 'email'}
								<input
									type="email"
									id="{f.key}-input"
									bind:value={values[f.key]}
									placeholder={f.placeholder}
								/>
							{:else if f.type === 'tel'}
								<input
									type="tel"
									id="{f.key}-input"
									bind:value={values[f.key]}
									placeholder={f.placeholder}
								/>
							{:else}
								<input id="{f.key}-input" bind:value={values[f.key]} placeholder={f.placeholder} />
							{/if}
							{#if f.help}<small>{f.help}</small>{/if}
						</label>
					{/if}
				{/each}
			</div>
			{#if hasAuthors}
				<div class="field-label">
					<label for="authors-input">{authorsLabel}</label>
					<OrganizerPicker
						bind:authors
						profiles={data.profiles}
						options={organizerOptions}
						id="authors-input"
						describedby="authors-help"
					/>
					<small id="authors-help"
						>Elegí de amigues (se enlaza su perfil) o escribí un nombre y elegí «Agregar».</small
					>
				</div>
			{/if}
		</fieldset>

		<fieldset class="card">
			<legend>🏷️ Etiquetas</legend>
			{#if isEvent}
				<EventTagRules bind:state={tagRules} errors={tagErrors} idPrefix="edit" />
			{/if}
			<div class="field-label">
				<label for="tags-input"
					>{isEvent ? 'Otras etiquetas: tipo de evento, prácticas, temas…' : 'Etiquetas'}</label
				>
				<TagPicker
					bind:tags={freeTags}
					options={tagOptions}
					reserved={reservedTags}
					reservedHint="se elige con los botones de arriba (idioma, lugar, precio o KinkyVibe)."
					id="tags-input"
					placeholder={isEvent
						? 'Buscá una etiqueta: taller, shibari, cine…'
						: 'Buscá una etiqueta: BDSM, shibari, guía…'}
					describedby="tags-help"
				/>
				<small id="tags-help"
					>Escribí para buscar (sin importar tildes). Si no existe, podés crearla, pero preferí las
					que ya existen: son las que se usan para filtrar.</small
				>
			</div>
		</fieldset>

		<fieldset class="card">
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
		<p class="note" role="status">✅ {form.save} {new Date().toLocaleString('es-AR')}</p>
	{/if}

	<details>
		<summary>Ver el archivo que se va a guardar</summary>
		<pre class="markdown">{content}</pre>
	</details>

	<form method="POST" action="?/save" class="bar">
		<textarea hidden name="content" value={content}></textarea>
		<input type="hidden" name="sha" value={sha} />
		<input type="hidden" name="path" value={path} />
		<small class="later"
			>Los cambios tardan unos minutos (normalmente entre 2 y 5) en verse. Si pasan más de 10,
			avisale a <a href="https://t.me/Gorro_Rojo">@Gorro_Rojo</a>.</small
		>
		<button
			type="submit"
			class="button"
			id="save"
			disabled={!content || problems.length > 0 || !changed}
			title={!changed ? 'No hay cambios' : undefined}>Guardar</button
		>
	</form>
</main>

<style lang="scss">
	/* Shared form look: $lib/components/admin/admin.scss (class kv-admin). */
	.wide {
		grid-column: 1 / -1;
	}
	.editor {
		border-radius: 0.8em;
		outline: 1px solid var(--1-light);
		overflow: hidden;
		:global(.cm-editor) {
			max-height: 40rem;
			background: white;
		}
	}
	textarea.raw {
		font-family: monospace;
		font-size: var(--step--1);
	}
	.later {
		flex: 1 1 16em;
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
</style>
