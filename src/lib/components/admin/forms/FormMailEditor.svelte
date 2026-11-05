<script>
	/**
	 * El asunto y el texto del mail con el link personal (docs/formularios.md, «El mail»), con su
	 * vista previa. Solo piezas del panel (`Field`, `Button`).
	 *
	 * - Suelto (`standalone`): su propio formulario, con «Guardar el mail» (`?/saveMail`) y «Ver
	 *   cómo queda» (`?/previewMail`, no guarda).
	 * - Adentro de otro formulario (Cómo salen por defecto): solo los campos (`<prefix>Subject`,
	 *   `<prefix>Body`) y «Ver cómo queda», que manda ese formulario a `?/previewMail` con
	 *   `previewKind`.
	 *
	 * Props: `subject`, `body` (lo guardado; vacío = `fallbackSubject` / `fallbackBody`, que se ven
	 * de ejemplo), `prefix`, `kind` ('survey' o 'form'), `preview` ({ subject, html } o null),
	 * `errors`, `message`, `standalone`.
	 */
	import { enhance } from '$app/forms';
	import { Eye, Save } from '@lucide/svelte';
	import { Button, Field, Notice } from '$lib/components/ui';

	export let subject = '';
	export let body = '';
	export let fallbackSubject = '';
	export let fallbackBody = '';
	export let prefix = 'mail';
	/** @type {'survey' | 'form'} */
	export let kind = 'survey';
	/** @type {{ subject: string, html: string } | null} */
	export let preview = null;
	/** @type {Record<string, string>} */
	export let errors = {};
	export let message = '';
	export let ok = true;
	export let standalone = true;
	export let idPrefix = 'mail';

	let busy = false;
</script>

{#if standalone}
	<form
		class="kv-stack mail-editor"
		method="POST"
		action="?/saveMail"
		use:enhance={() => {
			busy = true;
			return async ({ update }) => {
				await update({ reset: false });
				busy = false;
			};
		}}
	>
		<svelte:self
			{subject}
			{body}
			{fallbackSubject}
			{fallbackBody}
			{prefix}
			{kind}
			{preview}
			{errors}
			{idPrefix}
			standalone={false}
		/>
		<div class="kv-row">
			<Button type="submit" icon={Save} {busy} disabled={busy}>Guardar el mail</Button>
			{#if message}<Notice tone={ok ? 'ok' : 'error'} compact>{message}</Notice>{/if}
		</div>
	</form>
{:else}
	<div class="kv-stack fields">
		<Field
			id="{idPrefix}-asunto"
			label="Asunto"
			name="{prefix}Subject"
			value={subject}
			placeholder={fallbackSubject}
			help={kind === 'survey'
				? 'Ojo: el asunto se ve en la notificación del celu. Vacío: «' + fallbackSubject + '».'
				: 'Vacío: «' + fallbackSubject + '».'}
			error={errors.subject ?? ''}
		/>
		<Field
			id="{idPrefix}-texto"
			type="textarea"
			rows={6}
			label="Texto"
			name="{prefix}Body"
			value={body}
			placeholder={fallbackBody}
			help="Vacío: el texto de ejemplo. Podés usar {'{{evento}}'}, {'{{formulario}}'}, {'{{preguntas}}'} («Son 5 preguntas cortas…») y {'{{link}}'} (el link personal; el botón va siempre). Negrita: **así**."
			error={errors.body ?? ''}
		/>
		<div class="kv-row">
			<Button
				type="submit"
				variant="secondary"
				icon={Eye}
				formaction="?/previewMail"
				name="previewKind"
				value={kind}>Ver cómo queda</Button
			>
		</div>
		{#if preview}
			<p class="kv-note">Asunto: <strong>{preview.subject}</strong></p>
			<iframe
				title="Vista previa del mail{kind === 'survey' ? ' de la encuesta' : ''}"
				sandbox=""
				srcdoc={preview.html}
			></iframe>
		{/if}
	</div>
{/if}

<style>
	iframe {
		width: 100%;
		height: 34rem;
		border: 1px solid var(--line);
		border-radius: var(--radius-m);
		background: white;
	}
</style>
