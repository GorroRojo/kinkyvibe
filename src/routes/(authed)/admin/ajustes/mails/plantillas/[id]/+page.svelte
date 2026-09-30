<script>
	/**
	 * Editor de la plantilla de un mail, con vista previa en vivo (claro, oscuro aproximado y
	 * texto) armada en el servidor con datos de ejemplo.
	 */
	import '$lib/admin/panel-forms.scss';
	import { onMount } from 'svelte';
	import { enhance } from '$app/forms';
	import { RotateCcw, Save, Send } from '@lucide/svelte';
	import { AJUSTES_TABS } from '$lib/admin/ajustes.js';
	import { fmtDateTime } from '$lib/admin/format.js';
	import { unknownVariables } from '$lib/utils/emailTemplates.js';
	import PageHeader from '$lib/components/admin/panel/PageHeader.svelte';
	import Card from '$lib/components/admin/panel/Card.svelte';
	import Tabs from '$lib/components/admin/panel/Tabs.svelte';
	import Badge from '$lib/components/admin/panel/Badge.svelte';

	export let data;
	export let form;

	/** @type {{ subject: string, heading: string, body: string }} */
	const initial = data.saved ?? data.def.defaults;
	let subject = initial.subject;
	let heading = initial.heading;
	let body = initial.body;
	let to = data.recipients[0]?.address ?? '';

	// Después de restaurar, volver a los textos originales en los campos.
	$: if (form?.reset) {
		subject = data.def.defaults.subject;
		heading = data.def.defaults.heading;
		body = data.def.defaults.body;
	}

	/** @type {Record<string, string>} */
	$: serverErrors = form?.errors ?? {};
	$: unknown = unknownVariables(data.def.id, { subject, heading, body });
	$: isDefault =
		subject === data.def.defaults.subject &&
		heading === data.def.defaults.heading &&
		body === data.def.defaults.body;

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
			const res = await fetch(`/admin/ajustes/mails/plantillas/${data.def.id}/vista-previa`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ subject, heading, body })
			});
			if (!res.ok) throw new Error(String(res.status));
			preview = await res.json();
			previewError = '';
		} catch {
			previewError = 'No se pudo armar la vista previa.';
		}
	}
	$: if (mounted) {
		(void subject, heading, body);
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
			body = `${body}${body.endsWith(' ') || !body ? '' : ' '}${token}`;
			return;
		}
		const start = el.selectionStart ?? el.value.length;
		const end = el.selectionEnd ?? start;
		const next = el.value.slice(0, start) + token + el.value.slice(end);
		if (el.name === 'subject') subject = next;
		else if (el.name === 'heading') heading = next;
		else body = next;
		requestAnimationFrame(() => {
			el.focus();
			el.setSelectionRange(start + token.length, start + token.length);
		});
	}
</script>

<PageHeader
	title={data.def.label}
	subtitle={data.def.when}
	back={{ href: '/admin/ajustes/mails/plantillas', label: 'Plantillas' }}
>
	<svelte:fragment slot="meta">
		{#if data.saved}<Badge tone="info">texto propio</Badge>{:else}<Badge>original</Badge>{/if}
	</svelte:fragment>
</PageHeader>
<Tabs tabs={[...AJUSTES_TABS]} current="/admin/ajustes/mails" />

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
			<label class="kv-field">
				<span>Asunto</span>
				<input
					name="subject"
					bind:value={subject}
					on:focus={track}
					maxlength={data.limits.subject}
					autocomplete="off"
					aria-invalid={serverErrors.subject ? 'true' : undefined}
				/>
				{#if serverErrors.subject}<small class="kv-error">{serverErrors.subject}</small>{/if}
			</label>
			<label class="kv-field">
				<span>Título</span>
				<input
					name="heading"
					bind:value={heading}
					on:focus={track}
					maxlength={data.limits.heading}
					autocomplete="off"
					aria-invalid={serverErrors.heading ? 'true' : undefined}
				/>
				{#if serverErrors.heading}<small class="kv-error">{serverErrors.heading}</small>{/if}
			</label>
			<label class="kv-field">
				<span>Texto de arriba</span>
				<textarea
					name="body"
					rows="7"
					bind:value={body}
					on:focus={track}
					maxlength={data.limits.body}
					aria-invalid={serverErrors.body ? 'true' : undefined}></textarea>
				<small>
					<code>**así**</code> para negrita; una línea en blanco empieza otro párrafo. No se acepta HTML
					(se ve tal cual).
				</small>
				{#if serverErrors.body}<small class="kv-error">{serverErrors.body}</small>{/if}
			</label>
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
				{#if data.saved}
					<button
						class="kv-btn ghost"
						type="submit"
						formaction="?/reset"
						formnovalidate
						on:click={(e) => {
							if (!confirm('¿Volver al texto original de este mail?')) e.preventDefault();
						}}
					>
						<RotateCcw size={16} aria-hidden="true" /> Restaurar el original
					</button>
				{:else if !isDefault}
					<button
						class="kv-btn ghost"
						type="button"
						on:click={() => {
							subject = data.def.defaults.subject;
							heading = data.def.defaults.heading;
							body = data.def.defaults.body;
						}}
					>
						<RotateCcw size={16} aria-hidden="true" /> Deshacer cambios
					</button>
				{/if}
			</div>
			{#if data.saved}
				<p class="kv-note">
					Cambiado el {fmtDateTime(data.saved.updatedAt)} por {data.saved.updatedBy}.
				</p>
			{/if}
		</Card>

		<Card title="Mandarme una prueba">
			<p class="kv-note">
				Con lo que está escrito ahora (aunque no esté guardado) y datos de ejemplo. El asunto
				empieza con “[Prueba]”.
			</p>
			{#if data.recipients.length}
				<div class="kv-row test">
					<label class="kv-field grow">
						<span>Mandar a</span>
						<select name="to" bind:value={to}>
							{#each data.recipients as r (r.address)}
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
				{#each data.def.vars as v (v.name)}
					<li>
						<button type="button" class="var" on:click={() => insert(v.name)}>
							<code>{`{{${v.name}}}`}</code>
						</button>
						<span>{v.label}</span>
						<small class="muted">ej.: {v.sample}</small>
					</li>
				{/each}
			</ul>
			<p class="kv-note"><b>Lo pone siempre el sistema:</b> {data.def.fixed}</p>
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
		gap: 1rem;
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
		gap: 0.2rem 0.6rem;
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
		border-radius: 0.8rem;
		background: white;
	}
	.text {
		white-space: pre-wrap;
		overflow-wrap: anywhere;
		font-size: 0.85rem;
		background: var(--surface-2);
		border-radius: 0.8rem;
		padding: 0.8rem;
		max-height: 38rem;
		overflow: auto;
		margin: 0;
	}
</style>
