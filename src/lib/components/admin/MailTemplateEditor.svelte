<script>
	/**
	 * Editor de la plantilla de un mail, con vista previa en vivo (claro, oscuro aproximado y
	 * texto) armada en el servidor con datos de ejemplo. Lo usan Mensajes → Plantillas (la
	 * plantilla general) y la pestaña Mails de la ficha de un evento (lo que cambia solo para ese
	 * evento).
	 *
	 * - `mode: 'general'`: asunto, título y texto no pueden quedar vacíos; las partes opcionales
	 *   vacías = el texto de siempre.
	 * - `mode: 'event'`: todo puede quedar vacío = lo de la plantilla general (`inherited`).
	 *
	 * Las acciones del formulario (`?/save`, `?/reset`, `?/test`) las pone la página.
	 */
	import '$lib/admin/panel-forms.scss';
	import { onMount } from 'svelte';
	import { enhance } from '$app/forms';
	import { RotateCcw, Save, Send } from '@lucide/svelte';
	import { fmtDateTime } from '$lib/admin/format.js';
	import {
		TEMPLATE_EXTRAS,
		TEMPLATE_FIELD_LABELS,
		templateKeys,
		unknownVariables
	} from '$lib/utils/emailTemplates.js';
	import Card from '$lib/components/admin/panel/Card.svelte';

	/** @typedef {import('$lib/utils/emailTemplates.js').TemplateKey} TemplateKey */

	/** @type {{ id: import('$lib/utils/emailTemplates.js').TemplateId, fixed: string,
	 *   vars: { name: string, label: string, sample: string }[],
	 *   defaults: import('$lib/utils/emailTemplates.js').TemplateText,
	 *   extras: Partial<Record<string, { default: string, note?: string }>> }} */
	export let def;
	/** @type {Record<string, number>} */
	export let limits;
	/** @type {'general' | 'event'} */
	export let mode = 'general';
	/** Lo guardado (para el formulario): las partes con texto propio. */
	/** @type {Partial<Record<TemplateKey, string | null>> & { updatedAt?: number, updatedBy?: string } | null} */
	export let saved = null;
	/** Lo que sale en cada parte si queda vacía (en un evento: lo de la plantilla general). */
	/** @type {Partial<Record<TemplateKey, string>>} */
	export let inherited = {};
	/** @type {{ address: string, label: string }[]} */
	export let recipients = [];
	/** @type {any} */
	export let form = null;
	/** POST con las partes → { subject, html, text, errors }. */
	/** @type {string} */
	export let previewUrl;
	export let resetLabel = 'Restaurar el original';
	export let resetConfirm = '¿Volver al texto original de este mail?';

	$: keys = templateKeys(def.id);
	const isExtra = (/** @type {string} */ k) => TEMPLATE_EXTRAS.includes(/** @type {any} */ (k));

	/** Lo que tiene cada campo cuando no hay nada propio. */
	function blank() {
		/** @type {Record<TemplateKey, string>} */
		const v = { subject: '', heading: '', body: '', label: '', button: '', help: '', why: '' };
		if (mode === 'general') {
			v.subject = def.defaults.subject;
			v.heading = def.defaults.heading;
			v.body = def.defaults.body;
		}
		return v;
	}
	/** @type {Record<TemplateKey, string>} */
	const pristine = blank();
	/** @type {Record<TemplateKey, string>} */
	let values = { ...pristine };
	if (saved) {
		for (const k of /** @type {TemplateKey[]} */ (Object.keys(values))) {
			const v = saved[k];
			if (typeof v === 'string') values[k] = v;
		}
	}
	let to = recipients[0]?.address ?? '';

	// Después de restaurar, volver a lo de siempre en los campos.
	$: if (form?.reset) values = blank();

	/** @type {Record<string, string>} */
	$: serverErrors = form?.errors ?? {};
	$: unknown = unknownVariables(def.id, values);
	$: isPristine = Object.keys(pristine).every(
		(k) => values[/** @type {TemplateKey} */ (k)] === pristine[/** @type {TemplateKey} */ (k)]
	);

	/** Texto de ayuda de cada campo (qué sale si queda vacío). */
	/** @param {TemplateKey} k */
	function emptyHint(k) {
		const inh = inherited[k];
		if (mode === 'event') return inh ? `Vacío: «${inh}».` : '';
		const d = def.extras[k]?.default;
		return d ? `Vacío: «${d}».` : '';
	}

	/** @type {'light' | 'dark' | 'text'} */
	let view = 'light';
	/** @type {{ subject: string, html: string, text: string } | null} */
	let preview = null;
	let previewError = '';
	/** @type {ReturnType<typeof setTimeout> | undefined} */
	let timer;
	let mounted = false;

	async function refresh() {
		try {
			const res = await fetch(previewUrl, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(values)
			});
			if (!res.ok) throw new Error(String(res.status));
			preview = await res.json();
			previewError = '';
		} catch {
			previewError = 'No se pudo armar la vista previa.';
		}
	}
	$: if (mounted) {
		void values;
		clearTimeout(timer);
		timer = setTimeout(refresh, 300);
	}
	onMount(() => {
		mounted = true;
		return () => clearTimeout(timer);
	});

	// Modo oscuro "a lo Gmail": invierte colores (aproximado; cada cliente lo hace distinto).
	// (La etiqueta se arma en partes: un "<style" literal dentro del <script> confunde a Svelte.)
	const STYLE_TAG = 'style';
	const DARK = `<${STYLE_TAG}>html{background:#fff;filter:invert(1) hue-rotate(180deg)}img{filter:invert(1) hue-rotate(180deg)}</${STYLE_TAG}>`;
	$: srcdoc = preview
		? view === 'dark'
			? preview.html.replace('<body', DARK + '<body')
			: preview.html
		: '';

	/** Último campo con foco, para insertar variables donde está el cursor. */
	/** @type {HTMLInputElement | HTMLTextAreaElement | null} */
	let lastField = null;
	/** @param {FocusEvent} e */
	function track(e) {
		lastField = /** @type {HTMLInputElement | HTMLTextAreaElement} */ (e.currentTarget);
	}
	/** @param {string} name */
	function insert(name) {
		const el = lastField;
		const token = `{{${name}}}`;
		if (!el) {
			values.body = `${values.body}${values.body.endsWith(' ') || !values.body ? '' : ' '}${token}`;
			return;
		}
		const start = el.selectionStart ?? el.value.length;
		const end = el.selectionEnd ?? start;
		const next = el.value.slice(0, start) + token + el.value.slice(end);
		values[/** @type {TemplateKey} */ (el.name)] = next;
		requestAnimationFrame(() => {
			el.focus();
			el.setSelectionRange(start + token.length, start + token.length);
		});
	}
</script>

{#if form?.message}
	<p class="kv-flash" role="status">{form.message}</p>
{:else if form?.error}
	<p class="kv-flash bad" role="alert">{form.error}</p>
{/if}

<div class="editor">
	<form
		class="kv-form"
		method="POST"
		action="?/save"
		use:enhance={() =>
			async ({ update }) =>
				update({ reset: false })}
	>
		<Card title="Texto">
			{#if mode === 'event'}
				<p class="kv-note">
					Lo que dejes vacío sale como en la plantilla general (Mensajes → Plantillas).
				</p>
			{/if}
			{#each keys.filter((k) => !isExtra(k)) as k (k)}
				<label class="kv-field">
					<span>{TEMPLATE_FIELD_LABELS[k]}</span>
					{#if k === 'body'}
						<textarea
							name="body"
							rows="7"
							bind:value={values.body}
							on:focus={track}
							maxlength={limits.body}
							placeholder={mode === 'event' ? (inherited.body ?? '') : ''}
							aria-invalid={serverErrors.body ? 'true' : undefined}></textarea>
						<small>
							<code>**así**</code> para negrita; una línea en blanco empieza otro párrafo. No se acepta
							HTML.
						</small>
					{:else}
						<input
							name={k}
							bind:value={values[k]}
							on:focus={track}
							maxlength={limits[k]}
							placeholder={mode === 'event' ? (inherited[k] ?? '') : ''}
							autocomplete="off"
							aria-invalid={serverErrors[k] ? 'true' : undefined}
						/>
					{/if}
					{#if mode === 'event' && !values[k]}<small class="muted">{emptyHint(k)}</small>{/if}
					{#if serverErrors[k]}<small class="kv-error">{serverErrors[k]}</small>{/if}
				</label>
			{/each}
		</Card>

		<Card title="Detalles del diseño">
			<p class="kv-note">
				Opcionales. Texto común y <code>{'{{variables}}'}</code>; en la ayuda y el pie también
				<code>**negrita**</code>. A dónde lleva el botón lo decide siempre el sistema.
			</p>
			{#each keys.filter(isExtra) as k (k)}
				<label class="kv-field">
					<span>{TEMPLATE_FIELD_LABELS[k]}</span>
					<input
						name={k}
						bind:value={values[k]}
						on:focus={track}
						maxlength={limits[k]}
						placeholder={inherited[k] ?? def.extras[k]?.default ?? ''}
						autocomplete="off"
						aria-invalid={serverErrors[k] ? 'true' : undefined}
					/>
					{#if !values[k] && emptyHint(k)}<small class="muted">{emptyHint(k)}</small>{/if}
					{#if def.extras[k]?.note}<small class="muted">{def.extras[k]?.note}</small>{/if}
					{#if serverErrors[k]}<small class="kv-error">{serverErrors[k]}</small>{/if}
				</label>
			{/each}
		</Card>

		{#if unknown.length}
			<p class="kv-flash warn" role="alert">
				{unknown.length === 1 ? 'Esta variable no existe' : 'Estas variables no existen'} en este mail:
				{unknown.map((n) => `{{${n}}}`).join(', ')}. Así no se puede guardar.
			</p>
		{/if}
		<div class="kv-row">
			<button class="kv-btn" type="submit" disabled={unknown.length > 0}>
				<Save size={16} aria-hidden="true" /> Guardar
			</button>
			{#if saved}
				<button
					class="kv-btn ghost"
					type="submit"
					formaction="?/reset"
					formnovalidate
					on:click={(e) => {
						if (!confirm(resetConfirm)) e.preventDefault();
					}}
				>
					<RotateCcw size={16} aria-hidden="true" />
					{resetLabel}
				</button>
			{:else if !isPristine}
				<button class="kv-btn ghost" type="button" on:click={() => (values = blank())}>
					<RotateCcw size={16} aria-hidden="true" /> Deshacer cambios
				</button>
			{/if}
		</div>
		{#if saved?.updatedAt}
			<p class="kv-note">
				Cambiado el {fmtDateTime(saved.updatedAt)} por {saved.updatedBy}.
			</p>
		{/if}

		<Card title="Mandarme una prueba">
			<p class="kv-note">
				Con lo que está escrito ahora (aunque no esté guardado) y datos de ejemplo. El asunto
				empieza con “[Prueba]”.
			</p>
			{#if recipients.length}
				<div class="kv-row test">
					<label class="kv-field grow">
						<span>Mandar a</span>
						<select name="to" bind:value={to}>
							{#each recipients as r (r.address)}
								<option value={r.address}>{r.address} ({r.label})</option>
							{/each}
						</select>
					</label>
					<button
						class="kv-btn ghost"
						type="submit"
						formaction="?/test"
						disabled={unknown.length > 0}
					>
						<Send size={16} aria-hidden="true" /> Mandarme una prueba
					</button>
				</div>
			{:else}
				<p class="kv-note">No hay ninguna dirección configurada para mandar pruebas.</p>
			{/if}
		</Card>

		<Card title="Variables">
			<p class="kv-note">Tocá una para agregarla donde está el cursor.</p>
			<ul class="vars">
				{#each def.vars as v (v.name)}
					<li>
						<button type="button" class="var" on:click={() => insert(v.name)}>
							<code>{`{{${v.name}}}`}</code>
						</button>
						<span>{v.label}</span>
						<small class="muted">ej.: {v.sample}</small>
					</li>
				{/each}
			</ul>
			<p class="kv-note"><b>Lo pone siempre el sistema:</b> {def.fixed}</p>
		</Card>
	</form>

	<div class="preview">
		<Card title="Vista previa">
			<nav class="kv-row views" aria-label="Cómo ver la vista previa">
				<button
					type="button"
					class="kv-btn small ghost"
					class:on={view === 'light'}
					on:click={() => (view = 'light')}>Claro</button
				>
				<button
					type="button"
					class="kv-btn small ghost"
					class:on={view === 'dark'}
					on:click={() => (view = 'dark')}>Oscuro</button
				>
				<button
					type="button"
					class="kv-btn small ghost"
					class:on={view === 'text'}
					on:click={() => (view = 'text')}>Solo texto</button
				>
			</nav>
			{#if previewError}<p class="kv-flash bad">{previewError}</p>{/if}
			{#if preview}
				<p class="subject"><small class="muted">Asunto</small><br /><b>{preview.subject}</b></p>
				{#if view === 'text'}
					<pre class="text">{preview.text}</pre>
				{:else}
					<iframe title="Vista previa del mail" sandbox="" {srcdoc}></iframe>
				{/if}
				{#if view === 'dark'}
					<p class="kv-note">Aproximado: cada programa de mail oscurece distinto.</p>
				{/if}
			{:else}
				<p class="kv-note">Armando la vista previa…</p>
			{/if}
		</Card>
	</div>
</div>

<style>
	.editor {
		display: grid;
		gap: var(--space-xs);
		grid-template-columns: minmax(0, 1fr);
		align-items: start;
		margin-top: 1rem;
	}
	@media (min-width: 1100px) {
		.editor {
			grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
		}
		.preview {
			position: sticky;
			top: 1rem;
		}
	}
	.grow {
		flex: 1 1 14rem;
	}
	.test {
		align-items: flex-end;
	}
	.vars {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}
	.vars li {
		display: flex;
		flex-wrap: wrap;
		gap: 0.2rem var(--space-2xs);
		align-items: baseline;
	}
	.var {
		background: none;
		border: 0;
		padding: 0;
		cursor: pointer;
		min-height: 2rem;
	}
	.var code {
		color: var(--link);
		font-weight: 700;
	}
	.views .on {
		background: var(--link-bg);
		border-color: var(--link);
		color: var(--link);
	}
	.subject {
		margin: 0;
		overflow-wrap: anywhere;
	}
	iframe {
		width: 100%;
		height: 38rem;
		border: 1px solid var(--line);
		border-radius: var(--radius-m);
		background: white;
	}
	.text {
		white-space: pre-wrap;
		overflow-wrap: anywhere;
		font-size: var(--text-xs);
		background: var(--surface-2);
		border-radius: var(--radius-m);
		padding: var(--space-xs);
		max-height: 38rem;
		overflow: auto;
		margin: 0;
	}
</style>
